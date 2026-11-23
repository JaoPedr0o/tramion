import type { ViewContribution } from "@tramion/contracts";

interface Props {
  readonly views: readonly ViewContribution[];
  readonly selectedId: string | undefined;
  readonly onSelect: (id: string) => void;
}

/** O ícone da tela, ou, se ela não tem, a inicial do nome (para nunca ficar um botão sem marca). */
function Mark({ view }: { view: ViewContribution }) {
  const Icon = view.icon;
  if (Icon) return <Icon size={ICON_SIZE} />;
  return (
    <span className="shell__view-initial" aria-hidden="true">
      {view.title.slice(0, 1).toUpperCase()}
    </span>
  );
}

const ICON_SIZE = 18;

/**
 * Troca entre as telas do app (Notas, Foco...): um controle com ícone e nome no topo do menu lateral (no celular, o
 * menu lateral é a gaveta).
 */
export function ViewSwitcher({ views, selectedId, onSelect }: Props) {
  return (
    <nav className="shell__views" aria-label="Telas">
      {views.map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          className="shell__view"
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
