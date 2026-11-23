import { PageIcon } from "@aun/ui";

/** O símbolo de uma página: o emoji escolhido, ou a folha de papel padrão. Decorativo (o nome vem do título). */
export function PageGlyph({ icon, size = 16 }: { icon: string | null; size?: number }) {
  if (icon) {
    return (
      <span className="page-glyph" aria-hidden="true" style={{ fontSize: size }}>
        {icon}
      </span>
    );
  }
  return <PageIcon size={size} />;
}
