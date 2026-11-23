import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PairedDevice, PairingOffer, SyncReport } from "../application/notes-platform.ts";
import { NotesError } from "../domain/errors.ts";
import type { NotesUiDeps } from "./deps.ts";
import { messageFor } from "./messages.ts";
import { useNavigation } from "./useNavigation.ts";

/** Com que frequência a lista de aparelhos se atualiza enquanto a janela está aberta (para ver o celular entrar). */
const REFRESH_MS = 3000;

/** O motivo de uma falha: erros internos trazem o motivo real (por exemplo, "sem conexão com uma rede local"). */
function reasonOf(error: unknown): string {
  return error instanceof NotesError && error.code === "notes.internal" && error.message
    ? error.message
    : messageFor(error);
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Janela "Parear celular": mostra o QR, avisa quando expira e lista os aparelhos pareados (com opção de remover). */
export function PairingDialog({ deps }: { deps: NotesUiDeps }) {
  const nav = useNavigation(deps.store);
  return nav.pairingOpen ? createPortal(<Pairing deps={deps} />, document.body) : null;
}

function Pairing({ deps }: { deps: NotesUiDeps }) {
  const { store, platform } = deps;
  const [offer, setOffer] = useState<PairingOffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [peers, setPeers] = useState<readonly PairedDevice[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // O foco vai para a janela ao abrir (para o Esc funcionar) e volta para onde estava ao fechar.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  const generate = useCallback(async () => {
    try {
      const next = await platform.startPairing();
      setOffer(next);
      setError(null);
    } catch (failure) {
      setOffer(null);
      setError(reasonOf(failure));
    }
  }, [platform]);

  const refreshPeers = useCallback(async () => {
    try {
      setPeers(await platform.listPeers());
    } catch (failure) {
      setError(reasonOf(failure));
    }
  }, [platform]);

  // Ao abrir: gera o QR e carrega os aparelhos (agendado, para o primeiro setState não ser síncrono no efeito).
  // Ao fechar: o QR deixa de valer.
  useEffect(() => {
    const first = setTimeout(() => {
      void generate();
      void refreshPeers();
    }, 0);
    const timer = setInterval(() => {
      setNow(Date.now());
      void refreshPeers();
    }, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      void platform.cancelPairing().catch(() => {});
    };
  }, [generate, refreshPeers, platform]);

  /** Diz o que a sincronização fez e recarrega as páginas se algo mudou. */
  const report = (reports: readonly SyncReport[]) => {
    const failed = reports.filter((r) => !r.ok);
    const applied = reports.reduce((sum, r) => sum + r.applied, 0);
    const conflicts = reports.reduce((sum, r) => sum + r.conflicts, 0);
    setError(
      failed.length > 0 ? failed.map((r) => `${r.name}: ${r.error ?? "falhou"}`).join(" · ") : null,
    );
    if (reports.length - failed.length > 0) {
      setResult(
        `Sincronizado: ${applied === 1 ? "1 alteração recebida" : `${applied} alterações recebidas`}` +
          (conflicts > 0 ? `, ${conflicts} em conflito (veja as cópias com “~conflito~”)` : "") +
          ".",
      );
      if (applied > 0) store.reload();
    } else if (reports.length === 0) {
      setResult("Nenhum computador pareado para procurar.");
    }
  };

  /** Roda uma sincronização, mostrando o resultado ou o motivo da falha. Devolve se deu certo. */
  const run = async (action: () => Promise<readonly SyncReport[]>): Promise<boolean> => {
    setBusy(true);
    setResult(null);
    try {
      const reports = await action();
      report(reports);
      return reports.length > 0 && reports.every((r) => r.ok);
    } catch (failure) {
      setError(reasonOf(failure));
      return false;
    } finally {
      setBusy(false);
      void refreshPeers();
    }
  };

  const expired = offer !== null && now >= offer.expiresAt;
  const close = () => store.closePairing();

  return (
    <div
      className="search-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Parear celular"
        className="capture pairing"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
      >
        <h2 className="pairing__title">Parear celular</h2>
        <p className="pairing__hint">
          Abra o Tramion no celular, escolha “Parear com o computador” e leia este código. Os dois
          precisam estar na mesma rede Wi-Fi.
        </p>

        {error ? <p role="alert">{error}</p> : null}

        {offer && !expired ? (
          <>
            <img
              className="pairing__qr"
              alt="Código QR de pareamento"
              src={`data:image/svg+xml;utf8,${encodeURIComponent(offer.svg)}`}
            />
            <p className="pairing__expiry">
              Vale até {formatTime(offer.expiresAt)} e funciona uma única vez.
            </p>
            <details className="pairing__manual">
              <summary>Digitar o código</summary>
              <code aria-label="Código de pareamento">{offer.code}</code>
            </details>
            <p className="pairing__warning">
              Quem ler este código antes de você poderá parear. Não o compartilhe.
            </p>
          </>
        ) : null}

        {expired ? (
          <p>
            O código expirou.{" "}
            <button type="button" onClick={() => void generate()}>
              Gerar novo código
            </button>
          </p>
        ) : null}

        <h3 className="pairing__subtitle">Conectar a um computador</h3>
        <p className="pairing__hint">
          No celular: cole aqui o código mostrado pelo computador (em “Parear celular”).
        </p>
        <div className="pairing__connect">
          <input
            aria-label="Código do computador"
            placeholder="tramion-pair:1:…"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <button
            type="button"
            disabled={busy || code.trim() === ""}
            onClick={() => {
              void run(async () => [await platform.pairWithCode(code.trim())]).then((ok) => {
                if (ok) setCode("");
              });
            }}
          >
            Conectar
          </button>
        </div>
        {peers.some((peer) => peer.canDial) ? (
          <button type="button" disabled={busy} onClick={() => void run(() => platform.syncNow())}>
            Sincronizar agora
          </button>
        ) : null}
        {result ? <p role="status">{result}</p> : null}

        <h3 className="pairing__subtitle">Aparelhos pareados</h3>
        {peers.length === 0 ? (
          <p className="pairing__empty">Nenhum aparelho pareado.</p>
        ) : (
          <ul className="pairing__peers" aria-label="Aparelhos pareados">
            {peers.map((peer) => (
              <li key={peer.device}>
                <span>
                  {peer.name}
                  <small>
                    {peer.lastSyncAt === null
                      ? " · ainda não sincronizou"
                      : ` · sincronizou ${new Date(peer.lastSyncAt).toLocaleString("pt-BR")}`}
                  </small>
                </span>
                <button
                  type="button"
                  aria-label={`Remover ${peer.name}`}
                  onClick={() => {
                    void platform
                      .removePeer(peer.device)
                      .then(refreshPeers)
                      .catch((failure: unknown) => setError(reasonOf(failure)));
                  }}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="capture__bar">
          <span />
          <button type="button" onClick={close}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
