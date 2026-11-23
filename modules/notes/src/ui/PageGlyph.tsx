import { PageIcon, TableIcon } from "@tramion/ui";

/** O símbolo de uma página: o emoji escolhido, ou a folha de papel padrão. Decorativo (o nome vem do título). */
export function PageGlyph({
  icon,
  size = 16,
  isDatabase = false,
}: {
  icon: string | null;
  size?: number;
  isDatabase?: boolean;
}) {
  if (icon) {
    return (
      <span className="page-glyph" aria-hidden="true" style={{ fontSize: size }}>
        {icon}
      </span>
    );
  }
  return isDatabase ? <TableIcon size={size} /> : <PageIcon size={size} />;
}
