// Editor de blocos FALSO, só para testes: um campo de texto que cumpre o mesmo contrato do editor de
// verdade (`BlockEditorProps`). Os testes do módulo exercitam o salvamento, os conflitos e as subpáginas
// sem carregar a biblioteca do editor, que não roda direito no jsdom.
import { useState } from "react";
import { blocksToPlainText, textToBlocks } from "./application/page-content.ts";
import type { BlockEditorProps } from "./ui/block-editor-types.ts";

export function StubBlockEditor({
  initialBlocks,
  childPages,
  onChange,
  onChildPageRemoved,
  onCreateSubpage,
  onOpenPage,
}: BlockEditorProps) {
  const [value, setValue] = useState(() => blocksToPlainText(initialBlocks));

  return (
    <div>
      <textarea
        aria-label="Texto da página"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          onChange({ blocks: textToBlocks(event.target.value), plainText: event.target.value });
        }}
      />
      {/* Simulam o que o editor de verdade faz com os blocos de subpágina. */}
      {childPages &&
        [...childPages.values()].map((page) => (
          <button key={page.id} type="button" onClick={() => onChildPageRemoved(page.id)}>
            {`Apagar o bloco de ${page.title}`}
          </button>
        ))}
      <button
        type="button"
        onClick={async () => {
          const pageId = await onCreateSubpage();
          if (pageId) onOpenPage(pageId);
        }}
      >
        Inserir /Página
      </button>
    </div>
  );
}
