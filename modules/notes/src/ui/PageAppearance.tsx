import { useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { coverStyle } from "../application/cover.ts";
import type { EmojiData } from "../application/emoji.ts";
import type { NotesPlatform } from "../application/notes-platform.ts";
import { CoverPicker } from "./CoverPicker.tsx";
import { EmojiPicker } from "./EmojiPicker.tsx";

export type Picker = "emoji" | "cover" | null;

/** A faixa da capa, no topo da página, com "Alterar capa" e "Remover capa" ao passar o mouse. */
export function PageCover({
  cover,
  onChange,
  onRemove,
}: {
  cover: string | null;
  onChange(): void;
  onRemove(): void;
}) {
  const style = coverStyle(cover);
  if (!style) return null;

  return (
    <div className="page-cover" style={style}>
      <div className="page-cover__actions">
        <button type="button" onClick={onChange}>
          Alterar capa
        </button>
        <button type="button" onClick={onRemove}>
          Remover capa
        </button>
      </div>
    </div>
  );
}

interface HeaderProps {
  icon: string | null;
  hasCover: boolean;
  picker: Picker;
  setPicker: Dispatch<SetStateAction<Picker>>;
  platform: NotesPlatform;
  loadEmojiData(): Promise<EmojiData>;
  onSetIcon(icon: string | null): void;
  onSetCover(cover: string | null): void;
}

/**
 * Acima do título: o símbolo (clicar abre o seletor) e, ao passar o mouse, "Adicionar ícone" e "Adicionar capa".
 * Os dois seletores abrem logo abaixo.
 */
export function PageHeader({
  icon,
  hasCover,
  picker,
  setPicker,
  platform,
  loadEmojiData,
  onSetIcon,
  onSetCover,
}: HeaderProps) {
  const header = useRef<HTMLDivElement>(null);
  // Clicar nos botões deste cabeçalho não conta como "fora" para o seletor aberto.
  const ignore = useMemo(() => [header], []);

  return (
    <div className="page-header" ref={header}>
      {icon && (
        <button
          type="button"
          className={hasCover ? "page-icon page-icon--over-cover" : "page-icon"}
          aria-label="Alterar ícone"
          onClick={() => setPicker("emoji")}
        >
          {icon}
        </button>
      )}
      <div className="page-header__actions">
        {!icon && (
          <button type="button" onClick={() => setPicker("emoji")}>
            Adicionar ícone
          </button>
        )}
        {!hasCover && (
          <button type="button" onClick={() => setPicker("cover")}>
            Adicionar capa
          </button>
        )}
      </div>

      {picker === "emoji" && (
        <EmojiPicker
          loadData={loadEmojiData}
          onPick={onSetIcon}
          {...(icon ? { onRemove: () => onSetIcon(null) } : {})}
          onClose={() => setPicker(null)}
          ignore={ignore}
        />
      )}
      {picker === "cover" && (
        <CoverPicker
          platform={platform}
          onPick={onSetCover}
          {...(hasCover ? { onRemove: () => onSetCover(null) } : {})}
          onClose={() => setPicker(null)}
          ignore={ignore}
        />
      )}
    </div>
  );
}
