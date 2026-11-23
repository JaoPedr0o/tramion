import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  /** O que mostrar no lugar da área que falhou. `reset` tenta desenhar a área de novo. */
  fallback(error: Error, reset: () => void): ReactNode;
  /** Chamado uma vez por falha, com o erro e a pilha de componentes (para registrar). */
  onError?: (error: Error, componentStack: string) => void;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Isola falhas de desenho: se algo dentro dela lançar um erro, só ESTA área é trocada pela mensagem,
 * e o resto do app continua funcionando. Sem isto, um erro numa área apaga a tela inteira.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info.componentStack ?? "");
  }

  reset = () => this.setState({ error: null });

  override render(): ReactNode {
    return this.state.error
      ? this.props.fallback(this.state.error, this.reset)
      : this.props.children;
  }
}
