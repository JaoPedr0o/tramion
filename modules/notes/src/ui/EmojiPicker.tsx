import { useEffect, useMemo, useState, type RefObject } from "react";
import { filterEmojis, type EmojiData, type EmojiEntry } from "../application/emoji.ts";
import { Popover } from "./Popover.tsx";

interface Props {
  loadData(): Promise<EmojiData>;
  onPick(emoji: string): void;
  /** Quando a página já tem símbolo, aparece "Remover ícone". */
  onRemove?: () => void;
  onClose(): void;
  ignore?: ReadonlyArray<RefObject<HTMLElement | null>>;
}

type Loaded = { status: "loading" } | { status: "ready"; data: EmojiData } | { status: "error" };

/** No máximo isto de resultados numa busca (para a janela não ficar enorme). */
const MAX_RESULTS = 240;

/** Escolher o símbolo da página: busca por nome, lista por categoria e "aleatório", como no Notion. */
export function EmojiPicker({ loadData, onPick, onRemove, onClose, ignore }: Props) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadData().then(
      (data) => !cancelled && setLoaded({ status: "ready", data }),
      () => !cancelled && setLoaded({ status: "error" }),
    );
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const data = loaded.status === "ready" ? loaded.data : null;
  const results = useMemo(
    () =>
      data && query.trim() !== "" ? filterEmojis(data.emojis, query).slice(0, MAX_RESULTS) : null,
    [data, query],
  );

  const pick = (entry: EmojiEntry) => onPick(entry.emoji);
  const button = (entry: EmojiEntry) => (
    <button
      key={`${entry.category}-${entry.emoji}-${entry.label}`}
      type="button"
      className="emoji-picker__emoji"
      aria-label={entry.label}
      title={entry.label}
      onClick={() => pick(entry)}
    >
      {entry.emoji}
    </button>
  );

  return (
    <Popover
      label="Escolher ícone"
      onClose={onClose}
      {...(ignore ? { ignore } : {})}
      className="emoji-picker"
    >
      <div className="emoji-picker__bar">
        <input
          type="search"
          aria-label="Buscar emoji"
          placeholder="Buscar um emoji…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          disabled={!data}
          onClick={() => {
            if (data) pick(data.emojis[Math.floor(Math.random() * data.emojis.length)]!);
          }}
        >
          Aleatório
        </button>
        {onRemove && (
          <button type="button" onClick={onRemove}>
            Remover ícone
          </button>
        )}
      </div>

      {loaded.status === "loading" && <p role="status">Carregando emojis…</p>}
      {loaded.status === "error" && <p role="alert">Não foi possível carregar os emojis.</p>}
      {results && results.length === 0 && <p className="popover__note">Nenhum emoji encontrado.</p>}
      {results && results.length > 0 && (
        <div className="emoji-picker__grid">{results.map(button)}</div>
      )}
      {data &&
        !results &&
        data.categories.map((category) => {
          const inCategory = data.emojis.filter((entry) => entry.category === category.index);
          return inCategory.length === 0 ? null : (
            <section key={category.index}>
              <h3 className="popover__heading">{category.label}</h3>
              <div className="emoji-picker__grid">{inCategory.map(button)}</div>
            </section>
          );
        })}
    </Popover>
  );
}
