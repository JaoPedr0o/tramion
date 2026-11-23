import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PairedDevice, PairingOffer } from "../application/notes-platform.ts";
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
