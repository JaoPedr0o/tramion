import { NotesError } from "../domain/errors.ts";
import type { Note } from "../domain/note.ts";

/** Rascunho: o que está na tela do editor. */
export interface Draft {
  readonly title: string;
  readonly body: string;
}

/**
 * - `saved`: o que está na tela já está salvo.
 * - `dirty`: há mudanças esperando a pausa para serem salvas.
 * - `saving`: um salvamento está em andamento.
 * - `invalid`: o Rust recusou o conteúdo (por exemplo, título vazio). O texto fica na tela; ao editar de novo, tenta outra vez.
 * - `error`: falha inesperada. Ao editar de novo, tenta outra vez.
 * - `conflict`: a nota mudou em outro lugar. Para o salvamento automático e espera a decisão do usuário.
 */
export type SaveStatus = "saved" | "dirty" | "saving" | "invalid" | "error" | "conflict";

export interface NoteAutosaver {
  /** Informa o novo conteúdo da tela. O salvamento ocorre depois de `delayMs` sem novas mudanças. */
  change(draft: Draft): void;
  /** Salva agora o que estiver pendente (espera um salvamento em andamento terminar). */
  flush(): Promise<void>;
  /** Resolução do conflito "manter o meu texto": salva o rascunho sobre a versão atual do servidor. */
  keepMine(currentUpdatedAt: number): Promise<void>;
  /** Resolução do conflito "carregar a versão salva": o rascunho é descartado e a versão passa a ser a do servidor. */
  reset(currentUpdatedAt: number): void;
  /** Encerra: cancela a espera, deixa de avisar mudanças de estado e salva uma última vez o que estiver pendente. */
  close(): void;
}

export interface NoteAutosaverOptions {
  /** `updatedAt` da nota quando foi aberta. */
  initialUpdatedAt: number;
  save(draft: Draft, expectedUpdatedAt: number): Promise<Note>;
  onStatus(status: SaveStatus, error?: NotesError): void;
  delayMs?: number;
}

/**
 * Salvamento automático com pausa (debounce). A parte difícil é NUNCA ter dois salvamentos ao mesmo
 * tempo: cada salvamento troca a versão da nota, e um segundo, enviado com a versão antiga, seria
 * recusado como conflito falso, contra a própria pessoa. Por isso, enquanto um salvamento está em
 * andamento, o seguinte espera e já sai com a versão nova.
 *
 * Não depende de React: pode ser testado com relógio falso.
 */
export function createNoteAutosaver(options: NoteAutosaverOptions): NoteAutosaver {
  const { save, onStatus, delayMs = 500 } = options;

  let version = options.initialUpdatedAt;
  let latest: Draft | null = null;
  let dirty = false;
  let stopped = false; // conflito: aguardando a decisão do usuário
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<boolean> | null = null;

  const emit = (status: SaveStatus, error?: NotesError) => {
    if (!closed) onStatus(status, error);
  };

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const schedule = () => {
    clearTimer();
    timer = setTimeout(() => void run(), delayMs);
  };

  /** Uma tentativa de salvamento. Devolve `true` se o Rust confirmou. */
  async function attempt(sending: Draft): Promise<boolean> {
    try {
      const note = await save(sending, version);
      version = note.updatedAt;
      // Só fica "salvo" se nada novo foi digitado enquanto salvava.
      if (latest === sending) {
        dirty = false;
        emit("saved");
      }
      return true;
    } catch (raw) {
      const error = raw instanceof NotesError ? raw : undefined;
      if (error?.code === "notes.conflict") {
        stopped = true;
        emit("conflict", error);
      } else if (error?.code === "notes.title-empty" || error?.code === "notes.title-too-long") {
        emit("invalid", error);
      } else {
        emit("error", error);
      }
      return false;
    }
  }

  async function run(): Promise<void> {
    if (!dirty || stopped || inFlight || latest === null) return;
    const sending = latest;

    emit("saving");
    inFlight = attempt(sending);
    let ok: boolean;
    try {
      ok = await inFlight;
    } finally {
      inFlight = null;
    }

    // O usuário continuou digitando durante o salvamento: salva também o que chegou depois.
    // Se este salvamento falhou, NÃO repete sozinho: só a próxima mudança tenta de novo.
    if (ok && dirty && !stopped) {
      if (closed) await run();
      else schedule();
    }
  }

  return {
    change(draft) {
      latest = draft;
      dirty = true;
      if (stopped) return; // em conflito, só guarda o texto
      emit("dirty");
      schedule();
    },

    async flush() {
      clearTimer();
      if (inFlight) await inFlight;
      await run();
    },

    async keepMine(currentUpdatedAt) {
      version = currentUpdatedAt;
      stopped = false;
      await run();
    },

    reset(currentUpdatedAt) {
      clearTimer();
      version = currentUpdatedAt;
      stopped = false;
      dirty = false;
      latest = null;
      emit("saved");
    },

    close() {
      clearTimer();
      closed = true;
      if (dirty && !stopped) void run();
    },
  };
}
