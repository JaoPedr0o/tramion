import type { FocusAlarm } from "../application/focus-gateway.ts";

/** Só o que o alarme usa do `AudioContext` (os testes entregam um falso). */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state: string;
  resume(): Promise<void>;
  createOscillator(): {
    type: string;
    frequency: { value: number };
    connect(node: unknown): void;
    start(at: number): void;
    stop(at: number): void;
  };
  createGain(): {
    gain: {
      setValueAtTime(value: number, at: number): void;
      linearRampToValueAtTime(value: number, at: number): void;
      exponentialRampToValueAtTime(value: number, at: number): void;
    };
    connect(node: unknown): void;
  };
}

/** Três notas de sino (mi, sol, dó agudo) que se somam num acorde de dó maior. Frequências em Hz. */
export const BELL_NOTES: readonly { at: number; hz: number }[] = [
  { at: 0, hz: 659.25 },
  { at: 0.45, hz: 783.99 },
  { at: 0.9, hz: 1046.5 },
];
/** Um sino de verdade tem parciais que não são múltiplos exatos: estes dão o timbre metálico e suave. */
const PARTIALS: readonly { ratio: number; level: number; decay: number }[] = [
  { ratio: 1, level: 1, decay: 1.8 },
  { ratio: 2.76, level: 0.35, decay: 1.1 },
  { ratio: 5.4, level: 0.12, decay: 0.6 },
];
/** Volume moderado (0 a 1) do conjunto. */
const MASTER = 0.22;
const VIBRATION_PATTERN = [300, 150, 300, 150, 500];

export interface WebAlarmDeps {
  readonly createContext: () => AudioContextLike | null;
  readonly vibrate: (pattern: number[]) => void;
}

function defaultContext(): AudioContextLike | null {
  const scope = globalThis as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

const defaultDeps: WebAlarmDeps = {
  createContext: defaultContext,
  vibrate: (pattern) => {
    globalThis.navigator?.vibrate?.(pattern);
  },
};

/**
 * O alarme com o app aberto: sino sintetizado por Web Audio (nada de arquivo, nada de direitos autorais) e vibração
 * no celular. Nunca lança: sem áudio ou sem permissão, o aviso na tela continua.
 */
export function createWebAlarm(deps: WebAlarmDeps = defaultDeps): FocusAlarm {
  let context: AudioContextLike | null = null;

  const ensure = (): AudioContextLike | null => {
    try {
      context ??= deps.createContext();
      return context;
    } catch {
      return null;
    }
  };

  return {
    unlock() {
      // Navegadores só liberam o áudio depois de um gesto; criar e retomar o contexto no clique resolve.
      const ctx = ensure();
      if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
    },

    ring() {
      try {
        deps.vibrate(VIBRATION_PATTERN);
      } catch {
        // Sem vibração neste aparelho.
      }
      try {
        const ctx = ensure();
        if (!ctx) return;
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        const start = ctx.currentTime + 0.02;
        for (const note of BELL_NOTES) {
          for (const partial of PARTIALS) {
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            const begin = start + note.at;
            oscillator.type = "sine";
            oscillator.frequency.value = note.hz * partial.ratio;
            // Ataque curto (evita estalo) e decaimento exponencial, como um sino.
            gain.gain.setValueAtTime(0.0001, begin);
            gain.gain.linearRampToValueAtTime(MASTER * partial.level, begin + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, begin + partial.decay);
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.start(begin);
            oscillator.stop(begin + partial.decay + 0.05);
          }
        }
      } catch {
        // Sem áudio: o aviso na tela basta.
      }
    },
  };
}
