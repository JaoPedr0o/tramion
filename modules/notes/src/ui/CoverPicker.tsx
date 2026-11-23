import { useState, type RefObject } from "react";
import {
  COVER_COLORS,
  COVER_GRADIENTS,
  coverImageFromLink,
  coverOf,
} from "../application/cover.ts";
import type { NotesPlatform } from "../application/notes-platform.ts";
import { NotesError } from "../domain/errors.ts";
import { messageFor } from "./messages.ts";
import { Popover } from "./Popover.tsx";

interface Props {
  platform: NotesPlatform;
  onPick(cover: string): void;
  /** Quando a página já tem capa, aparece "Remover capa". */
  onRemove?: () => void;
  onClose(): void;
  ignore?: ReadonlyArray<RefObject<HTMLElement | null>>;
}

type Tab = "gallery" | "upload" | "link";
const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "gallery", label: "Galeria" },
  { id: "upload", label: "Enviar" },
  { id: "link", label: "Link" },
];

/** Escolher a capa da página: galeria de degradês e cores, imagem do computador ou imagem por link. */
export function CoverPicker({ platform, onPick, onRemove, onClose, ignore }: Props) {
  const [tab, setTab] = useState<Tab>("gallery");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      onPick(coverOf.image(await platform.uploadAsset(file)));
    } catch (failure) {
      setError(messageFor(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover
      label="Escolher capa"
      onClose={onClose}
      {...(ignore ? { ignore } : {})}
      className="cover-picker"
    >
      <div className="cover-picker__bar">
        <div role="tablist" aria-label="Origem da capa" className="cover-picker__tabs">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => {
                setTab(item.id);
                setError(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove}>
            Remover capa
          </button>
        )}
      </div>

      {tab === "gallery" && (
        <div role="tabpanel" aria-label="Galeria">
          <h3 className="popover__heading">Degradês</h3>
          <div className="cover-picker__grid">
            {COVER_GRADIENTS.map((gradient) => (
              <button
                key={gradient.id}
                type="button"
                className="cover-picker__swatch"
                aria-label={gradient.label}
                title={gradient.label}
                style={{ backgroundImage: gradient.css }}
                onClick={() => onPick(coverOf.gradient(gradient.id))}
              />
            ))}
          </div>
          <h3 className="popover__heading">Cores</h3>
          <div className="cover-picker__grid">
            {COVER_COLORS.map((color) => (
              <button
                key={color.hex}
                type="button"
                className="cover-picker__swatch"
                aria-label={color.label}
                title={color.label}
                style={{ backgroundColor: color.hex }}
                onClick={() => onPick(coverOf.color(color.hex))}
              />
            ))}
          </div>
        </div>
      )}

      {tab === "upload" && (
        <div role="tabpanel" aria-label="Enviar" className="cover-picker__upload">
          <label>
            Escolher imagem
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
          {busy && <p role="status">Enviando…</p>}
        </div>
      )}

      {tab === "link" && (
        <form
          role="tabpanel"
          aria-label="Link"
          className="cover-picker__link"
          onSubmit={(event) => {
            event.preventDefault();
            const cover = coverImageFromLink(link);
            if (!cover) {
              setError(messageFor(new NotesError("notes.url-invalid", "endereço inválido")));
              return;
            }
            onPick(cover);
          }}
        >
          <input
            aria-label="Endereço da imagem"
            placeholder="Cole o endereço de uma imagem…"
            value={link}
            onChange={(event) => setLink(event.target.value)}
          />
          <button type="submit">Usar como capa</button>
        </form>
      )}

      {error && <p role="alert">{error}</p>}
    </Popover>
  );
}
