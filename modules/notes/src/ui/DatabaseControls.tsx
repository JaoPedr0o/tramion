import { PlusIcon, TrashIcon } from "@tramion/ui";
import { useMemo, useRef, useState } from "react";
import {
  OPERATOR_LABELS,
  TITLE_KEY,
  VALUELESS_OPERATORS,
  operatorsFor,
  type FilterRule,
  type SortRule,
} from "../application/database-query.ts";
import {
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  type Property,
  type PropertyType,
} from "../domain/database.ts";
import { Choice } from "./Choice.tsx";
import { Popover } from "./Popover.tsx";

/** Botão que abre uma janelinha logo abaixo dele (usado pelas barras de ferramentas da base). */
function PopoverButton({
  label,
  caption,
  className,
  children,
}: {
  label: string;
  /** Texto visível do botão (padrão: o próprio `label`). */
  caption?: string;
  className?: string;
  children(close: () => void): React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const ignore = useMemo(() => [anchor], []);
  return (
    <span className="db-popover-anchor" ref={anchor}>
      <button
        type="button"
        className={className ?? "db-toolbar__button"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((was) => !was)}
      >
        {caption ?? label}
      </button>
      {open && (
        <Popover
          label={label}
          anchor={anchor}
          onClose={() => setOpen(false)}
          ignore={ignore}
          className="popover--panel"
        >
          {children(() => setOpen(false))}
        </Popover>
      )}
    </span>
  );
}

// ───────── Nova coluna ─────────

export function AddPropertyButton({
  onAdd,
}: {
  onAdd(name: string, type: PropertyType): Promise<boolean>;
}) {
  return (
    <PopoverButton label="Adicionar coluna" caption="+" className="db-add-column">
      {(close) => <AddPropertyForm onAdd={onAdd} close={close} />}
    </PopoverButton>
  );
}

function AddPropertyForm({
  onAdd,
  close,
}: {
  onAdd(name: string, type: PropertyType): Promise<boolean>;
  close(): void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PropertyType>("text");
  return (
    <form
      className="db-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        void onAdd(name, type).then((ok) => ok && close());
      }}
    >
      <input
        aria-label="Nome da coluna"
        placeholder="Nome da coluna"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Choice
        label="Tipo da coluna"
        value={type}
        options={PROPERTY_TYPES.map((id) => ({ id, label: PROPERTY_TYPE_LABELS[id] }))}
        onChange={(id) => setType(id as PropertyType)}
      />
      <button type="submit">Adicionar coluna</button>
    </form>
  );
}

// ───────── Cabeçalho de coluna ─────────

export function PropertyHeaderButton({
  property,
  onRename,
  onRemoveOption,
  onDelete,
}: {
  property: Property;
  onRename(name: string): Promise<void>;
  onRemoveOption(optionId: string): Promise<void>;
  onDelete(): Promise<void>;
}) {
  return (
    <PopoverButton
      label={`Coluna ${property.name}`}
      caption={property.name}
      className="db-column-button"
    >
      {(close) => (
        <PropertySettings
          property={property}
          onRename={onRename}
          onRemoveOption={onRemoveOption}
          onDelete={async () => {
            await onDelete();
            close();
          }}
        />
      )}
    </PopoverButton>
  );
}

function PropertySettings({
  property,
  onRename,
  onRemoveOption,
  onDelete,
}: {
  property: Property;
  onRename(name: string): Promise<void>;
  onRemoveOption(optionId: string): Promise<void>;
  onDelete(): Promise<void>;
}) {
  const [name, setName] = useState(property.name);
  return (
    <div className="db-form">
      <input
        aria-label="Renomear coluna"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => name.trim() !== "" && name.trim() !== property.name && void onRename(name)}
        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
      />
      <p className="popover__note">Tipo: {PROPERTY_TYPE_LABELS[property.type]}</p>
      {property.options.length > 0 && (
        <ul className="db-options-list" aria-label="Opções da coluna">
          {property.options.map((option) => (
            <li key={option.id}>
              <span className={`db-chip db-chip--${option.color}`}>{option.name}</span>
              <button
                type="button"
                aria-label={`Remover a opção ${option.name}`}
                onClick={() => void onRemoveOption(option.id)}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="db-form__danger" onClick={() => void onDelete()}>
        Excluir coluna
      </button>
    </div>
  );
}

// ───────── Filtro ─────────

const defaultRule = (property: string, type: PropertyType | "title"): FilterRule => ({
  property,
  operator: operatorsFor(type)[0]!,
  value: "",
});

export function FilterButton({
  properties,
  rules,
  onChange,
}: {
  properties: readonly Property[];
  rules: readonly FilterRule[];
  onChange(rules: readonly FilterRule[]): void;
}) {
  const typeOf = (key: string): PropertyType | "title" =>
    key === TITLE_KEY ? "title" : (properties.find((p) => p.id === key)?.type ?? "title");
  const choices = [
    { id: TITLE_KEY, label: "Título" },
    ...properties.map((p) => ({ id: p.id, label: p.name })),
  ];
  const update = (index: number, rule: FilterRule) =>
    onChange(rules.map((existing, i) => (i === index ? rule : existing)));

  return (
    <PopoverButton
      label="Filtrar"
      caption={rules.length > 0 ? `Filtrar (${rules.length})` : "Filtrar"}
    >
      {() => (
        <div className="db-form">
          {rules.length === 0 && (
            <p className="popover__note">Nenhum filtro. As linhas aparecem todas.</p>
          )}
          {rules.map((rule, index) => {
            const type = typeOf(rule.property);
            const property = properties.find((p) => p.id === rule.property);
            return (
              <div className="db-rule" key={index} role="group" aria-label={`Filtro ${index + 1}`}>
                <Choice
                  label={`Coluna do filtro ${index + 1}`}
                  value={rule.property}
                  options={choices}
                  onChange={(id) => update(index, defaultRule(id, typeOf(id)))}
                />
                <Choice
                  label={`Condição do filtro ${index + 1}`}
                  value={rule.operator}
                  options={operatorsFor(type).map((id) => ({ id, label: OPERATOR_LABELS[id] }))}
                  onChange={(id) =>
                    update(index, { ...rule, operator: id as FilterRule["operator"] })
                  }
                />
                {!VALUELESS_OPERATORS.has(rule.operator) &&
                  (property &&
                  (property.type === "select" || property.type === "multi_select") &&
                  rule.operator !== "contains" ? (
                    <Choice
                      label={`Valor do filtro ${index + 1}`}
                      value={rule.value}
                      options={property.options.map((o) => ({ id: o.id, label: o.name }))}
                      onChange={(id) => update(index, { ...rule, value: id })}
                    />
                  ) : (
                    <input
                      aria-label={`Valor do filtro ${index + 1}`}
                      type={type === "date" ? "date" : "text"}
                      value={rule.value}
                      onChange={(event) => update(index, { ...rule, value: event.target.value })}
                    />
                  ))}
                <button
                  type="button"
                  aria-label={`Remover o filtro ${index + 1}`}
                  onClick={() => onChange(rules.filter((_, i) => i !== index))}
                >
                  <TrashIcon />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => onChange([...rules, defaultRule(TITLE_KEY, "title")])}
          >
            <PlusIcon /> Adicionar filtro
          </button>
        </div>
      )}
    </PopoverButton>
  );
}

// ───────── Ordenação ─────────

export function SortButton({
  properties,
  sort,
  onChange,
}: {
  properties: readonly Property[];
  sort: SortRule | null;
  onChange(sort: SortRule | null): void;
}) {
  const choices = [
    { id: TITLE_KEY, label: "Título" },
    ...properties.map((p) => ({ id: p.id, label: p.name })),
  ];
  return (
    <PopoverButton label="Ordenar" caption={sort ? "Ordenar (1)" : "Ordenar"}>
      {() => (
        <div className="db-form">
          <Choice
            label="Ordenar por"
            value={sort?.property ?? ""}
            options={choices}
            placeholder="Escolher coluna…"
            onChange={(id) => onChange({ property: id, direction: sort?.direction ?? "asc" })}
          />
          <Choice
            label="Direção da ordenação"
            value={sort?.direction ?? "asc"}
            options={[
              { id: "asc", label: "Crescente" },
              { id: "desc", label: "Decrescente" },
            ]}
            onChange={(id) =>
              onChange({ property: sort?.property ?? TITLE_KEY, direction: id as "asc" | "desc" })
            }
          />
          {sort && (
            <button type="button" onClick={() => onChange(null)}>
              Limpar ordenação
            </button>
          )}
        </div>
      )}
    </PopoverButton>
  );
}
