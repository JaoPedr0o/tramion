import type { ViewContribution } from "@tramion/contracts";

interface Props {
  readonly views: readonly ViewContribution[];
  readonly selectedId: string | undefined;
  readonly onSelect: (id: string) => void;
  /** `segmented`: controle no topo do menu lateral (computador). `tabbar`: barra de abas embaixo da tela (celular). */
  readonly variant: "segmented" | "tabbar";
}

/** O ícone da tela, ou, se ela não tem, a inicial do nome (para nunca ficar um botão sem marca). */
function Mark({ view }: { view: ViewContribution }) {
  const Icon = view.icon;
  if (Icon) return <Icon size={variantSize} />;
  return (
    <span className="shell__view-initial" aria-hidden="true">
      {view.title.slice(0, 1).toUpperCase()}
    </span>
  );
}

const variantSize = 18;

/**
 * Troca entre as telas do app (Notas, Foco...). No computador é um controle com ícone e nome no topo do menu lateral;
 * no celular, uma barra de abas fixa embaixo da tela, para trocar de tela sem abrir a gaveta.
 */
export function ViewSwitcher({ views, selectedId, onSelect, variant }: Props) {
  return (
    <nav className={variant === "tabbar" ? "shell__tabbar" : "shell__views"} aria-label="Telas">
      {views.map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          className={variant === "tabbar" ? "shell__tab" : "shell__view"}
          aria-current={candidate.id === selectedId ? "page" : undefined}
          onClick={() => onSelect(candidate.id)}
        >
          <Mark view={candidate} />
          <span className="shell__view-label">{candidate.title}</span>
        </button>
      ))}
    </nav>
  );
}
