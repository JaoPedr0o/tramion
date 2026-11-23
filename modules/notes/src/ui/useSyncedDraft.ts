import { useState } from "react";

/**
 * Rascunho de um campo de texto que volta ao valor de origem sempre que ele muda (por exemplo, depois de
 * salvar ou de uma atualização vinda de outro lugar). Ajusta durante o desenho, sem efeito.
 */
export function useSyncedDraft(source: string) {
  const [state, setState] = useState({ source, draft: source });
  const current = state.source === source ? state.draft : source;
  if (state.source !== source) setState({ source, draft: source });
  const setDraft = (draft: string) => setState({ source, draft });
  return [current, setDraft] as const;
}
