import { useMemo, useRef, useState } from "react";
import type { CellValue, Property, SelectOption } from "../domain/database.ts";
import { DateCell } from "./DateCell.tsx";
import { Popover } from "./Popover.tsx";
import { useSyncedDraft } from "./useSyncedDraft.ts";

interface Props {
  property: Property;
  /** Para o nome acessível: "Prazo — Comprar pão". */
  rowTitle: string;
  value: CellValue | undefined;
  /** Grava o valor; `null` esvazia. */
  onChange(value: CellValue | null): void;
  /** Cria uma opção nova na coluna e devolve o id dela (colunas de seleção). */
  onCreateOption(name: string): Promise<string | null>;
}

/** Texto, link, número e data: edita um rascunho local e grava ao sair do campo ou com Enter (Esc desfaz). */
function TextCell({ property, rowTitle, value, onChange }: Props) {
  const asText = value === undefined ? "" : String(value);
  const [draft, setDraft] = useSyncedDraft(asText);
  const cancelled = useRef(false); // Esc cancela: o blur que vem depois não deve gravar

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (draft === asText) return;
    if (property.type === "number") {
      const trimmed = draft.trim();
      if (trimmed === "") return onChange(null);
      const parsed = Number(trimmed.replace(",", "."));
      if (!Number.isFinite(parsed)) return setDraft(asText); // texto que não é número: volta ao anterior
      return onChange(parsed);
    }
    onChange(draft === "" ? null : draft);
  };

  return (
    <input
      className="db-cell__input"
      aria-label={`${property.name} — ${rowTitle}`}
      type={property.type === "date" ? "date" : "text"}
      inputMode={property.type === "number" ? "decimal" : undefined}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        // O seletor de data já devolve uma data completa: grava na hora.
        if (property.type === "date")
          onChange(event.target.value === "" ? null : event.target.value);
      }}
      onBlur={property.type === "date" ? undefined : commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          setDraft(asText);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function Chip({ option }: { option: SelectOption }) {
  return <span className={`db-chip db-chip--${option.color}`}>{option.name}</span>;
}

/** Seleção e seleção múltipla: mostra as opções como etiquetas; clicar abre a lista, com "criar opção". */
function OptionsCell({ property, rowTitle, value, onChange, onCreateOption }: Props) {
  const multiple = property.type === "multi_select";
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const anchor = useRef<HTMLDivElement>(null);
  const ignore = useMemo(() => [anchor], []);

  const chosen: readonly string[] = multiple
    ? ((value as readonly string[] | undefined) ?? [])
    : typeof value === "string"
      ? [value]
      : [];
  const byId = new Map(property.options.map((option) => [option.id, option]));

  const toggle = (id: string) => {
    if (!multiple) {
      onChange(chosen[0] === id ? null : id);
      setOpen(false);
      return;
    }
    const next = chosen.includes(id) ? chosen.filter((other) => other !== id) : [...chosen, id];
    onChange(next.length === 0 ? null : next);
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const id = await onCreateOption(name);
    if (id === null) return;
    setNewName("");
    if (multiple) onChange([...chosen, id]);
    else {
      onChange(id);
      setOpen(false);
    }
  };

  return (
    <div className="db-cell__options" ref={anchor}>
      <button
        type="button"
        className="db-cell__options-button"
        aria-label={`${property.name} — ${rowTitle}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        {chosen
          .map((id) => byId.get(id))
          .filter((o): o is SelectOption => o !== undefined)
          .map((option) => (
            <Chip key={option.id} option={option} />
          ))}
      </button>
      {open && (
        <Popover
          label={`Opções de ${property.name}`}
          className="popover--list"
          anchor={anchor}
          onClose={() => setOpen(false)}
          ignore={ignore}
        >
          <div
            role={multiple ? "group" : "listbox"}
            aria-label={`Opções de ${property.name}`}
            className="choice__list"
          >
            {property.options.map((option) => (
              <button
                key={option.id}
                type="button"
                role={multiple ? "checkbox" : "option"}
                {...(multiple
                  ? { "aria-checked": chosen.includes(option.id) }
                  : { "aria-selected": chosen.includes(option.id) })}
                onClick={() => toggle(option.id)}
              >
                <Chip option={option} />
              </button>
            ))}
          </div>
          <form
            className="db-cell__new-option"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <input
              aria-label="Nome da nova opção"
              placeholder="Criar opção…"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
          </form>
        </Popover>
      )}
    </div>
  );
}

/** O editor de uma célula, escolhido pelo tipo da coluna. */
export function DatabaseCell(props: Props) {
  const { property, rowTitle, value, onChange } = props;
  switch (property.type) {
    case "checkbox":
      return (
        <input
          type="checkbox"
          className="db-cell__checkbox"
          aria-label={`${property.name} — ${rowTitle}`}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      );
    case "select":
    case "multi_select":
      return <OptionsCell {...props} />;
    case "date":
      return <DateCell {...props} />;
    default:
      return <TextCell {...props} />;
  }
}
