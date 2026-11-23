import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PairedDevice, PairingOffer, SyncReport } from "../application/notes-platform.ts";
import { NotesError } from "../domain/errors.ts";
import type { NotesUiDeps } from "./deps.ts";
import { messageFor } from "./messages.ts";
import { useNavigation } from "./useNavigation.ts";

/** Com que frequência a lista de aparelhos se atualiza enquanto a janela está aberta (para ver o outro aparelho entrar). */
const REFRESH_MS = 3000;

/** Nos dois sentidos: este aparelho mostra o código (o outro lê) ou este lê o do outro. */
type Mode = "show" | "scan";

/** O motivo de uma falha: erros internos trazem o motivo real (por exemplo, "sem conexão com uma rede local"). */
function reasonOf(error: unknown): string {
  return error instanceof NotesError && error.code === "notes.internal" && error.message
    ? error.message
    : messageFor(error);
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Janela "Parear aparelho". No celular ela começa no modo "ler" e a câmera só abre quando a pessoa toca em "Abrir a
 * câmera" (nada abre sozinho: ela pode preferir mostrar o código deste aparelho ou colar o do outro). No computador
 * ela mostra o QR. O botão de cima troca o sentido (quem mostra e quem lê).
 */
export function PairingDialog({ deps }: { deps: NotesUiDeps }) {
  const nav = useNavigation(deps.store);
  return nav.pairingOpen ? createPortal(<Pairing deps={deps} />, document.body) : null;
}

function Pairing({ deps }: { deps: NotesUiDeps }) {
  const { store, platform } = deps;
  const [mode, setMode] = useState<Mode>(platform.canScanQr ? "scan" : "show");
  const [offer, setOffer] = useState<PairingOffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [peers, setPeers] = useState<readonly PairedDevice[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
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

  // A lista de aparelhos carrega ao abrir e se atualiza sozinha.
  useEffect(() => {
    const first = setTimeout(() => void refreshPeers(), 0);
    const timer = setInterval(() => {
      setNow(Date.now());
      void refreshPeers();
    }, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refreshPeers]);

  // O QR deste aparelho só existe enquanto ele está no modo "mostrar"; ao sair dele, o QR deixa de valer.
  useEffect(() => {
    if (mode !== "show") return;
    const first = setTimeout(() => void generate(), 0);
    return () => {
      clearTimeout(first);
      void platform.cancelPairing().catch(() => {});
    };
  }, [mode, generate, platform]);

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
      setResult("Nenhum aparelho pareado para procurar.");
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

  /** Abre a câmera e, se ler um código, pareia. Ao cancelar, não faz nada. */
  const scan = async () => {
    setError(null);
    setResult(null);
    setScanning(true);
    try {
      const text = await platform.scanQr();
      if (text) await run(async () => [await platform.pairWithCode(text.trim())]);
    } catch (failure) {
      setError(reasonOf(failure));
    } finally {
      setScanning(false);
    }
  };

  const switchTo = (next: Mode) => {
    if (next === mode) return;
    setOffer(null);
    setError(null);
    setResult(null);
    setMode(next);
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

        <div className="pairing__modes" role="group" aria-label="Quem mostra o código">
          <button
            type="button"
            className="pairing__mode"
            aria-label="Mostrar código neste aparelho"
            aria-pressed={mode === "show"}
            onClick={() => switchTo("show")}
          >
            Mostrar código
          </button>
          <button
            type="button"
            className="pairing__mode"
            aria-label="Ler código de outro aparelho"
            aria-pressed={mode === "scan"}
            onClick={() => switchTo("scan")}
          >
            Ler código
          </button>
        </div>

        {error ? (
          <p role="alert" className="pairing__error">
            {error}
          </p>
        ) : null}

        {mode === "show" ? (
          <section className="pairing__section">
            <p className="pairing__hint">
              No outro aparelho, escolha “Ler código” e aponte a câmera para este QR. Os dois
              precisam estar na mesma rede Wi-Fi.
            </p>
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
              <div className="pairing__expired">
                <p>O código expirou.</p>
                <button type="button" className="pairing__btn" onClick={() => void generate()}>
                  Gerar novo código
                </button>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="pairing__section">
            {platform.canScanQr ? (
              <>
                <p className="pairing__hint">
                  Aponte a câmera para o QR mostrado no outro aparelho (em “Parear celular” →
                  “Mostrar código”).
                </p>
                <button
                  type="button"
                  className="pairing__btn pairing__btn--primary pairing__btn--wide"
                  disabled={busy || scanning}
                  onClick={() => void scan()}
                >
                  {scanning ? "Câmera aberta…" : "Abrir a câmera"}
                </button>
              </>
            ) : (
              <p className="pairing__hint">
                Este aparelho não tem câmera para ler o QR: cole abaixo o código mostrado no outro
                aparelho.
              </p>
            )}
            <label className="pairing__field-label" htmlFor="pairing-code">
              {platform.canScanQr ? "Ou cole o código" : "Código do outro aparelho"}
            </label>
            <div className="pairing__connect">
              <input
                id="pairing-code"
                aria-label="Código do outro aparelho"
                placeholder="tramion-pair:1:…"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <button
                type="button"
                className="pairing__btn pairing__btn--primary"
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
          </section>
        )}

        <section className="pairing__section">
          <h3 className="pairing__subtitle">Aparelhos pareados</h3>
          {peers.some((peer) => peer.canDial) ? (
            <button
              type="button"
              className="pairing__btn pairing__btn--primary pairing__btn--wide"
              disabled={busy}
              onClick={() => void run(() => platform.syncNow())}
            >
              {busy ? "Sincronizando…" : "Sincronizar agora"}
            </button>
          ) : null}
          {result ? (
            <p role="status" className="pairing__result">
              {result}
            </p>
          ) : null}
          {peers.length === 0 ? (
            <p className="pairing__empty">Nenhum aparelho pareado.</p>
          ) : (
            <ul className="pairing__peers" aria-label="Aparelhos pareados">
              {peers.map((peer) => (
                <li key={peer.device} className="pairing__peer">
                  <span className="pairing__peer-info">
                    <span className="pairing__peer-name">{peer.name}</span>
                    <small>
                      {peer.lastSyncAt === null
                        ? "Ainda não sincronizou"
                        : `Sincronizou ${new Date(peer.lastSyncAt).toLocaleString("pt-BR")}`}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="pairing__btn pairing__btn--danger"
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
        </section>

        <div className="pairing__footer">
          <button type="button" className="pairing__btn pairing__btn--wide" onClick={close}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
