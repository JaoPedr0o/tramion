// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./index.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error("falha ao desenhar");
  return <p>tudo certo</p>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // O React registra no console o erro capturado; aqui isso é esperado.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("sem falha, mostra o conteúdo normalmente", () => {
    render(
      <ErrorBoundary fallback={() => <p>falhou</p>}>
        <Bomb explode={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("tudo certo")).toBeTruthy();
  });

  it("com falha, troca SÓ a área pelo aviso (o resto da tela segue) e entrega o erro", () => {
    render(
      <>
        <p>resto da tela</p>
        <ErrorBoundary fallback={(error) => <p role="alert">Falhou: {error.message}</p>}>
          <Bomb explode />
        </ErrorBoundary>
      </>,
    );

    expect(screen.getByRole("alert").textContent).toBe("Falhou: falha ao desenhar");
    expect(screen.getByText("resto da tela")).toBeTruthy();
  });

  it("avisa quem registra, uma vez, com o erro e a pilha de componentes", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary fallback={() => <p>falhou</p>} onError={onError}>
        <Bomb explode />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0]![0].message).toBe("falha ao desenhar");
    expect(typeof onError.mock.calls[0]![1]).toBe("string");
  });

  it("'tentar de novo' desenha a área outra vez", async () => {
    function Harness() {
      const [explode, setExplode] = useState(true);
      return (
        <ErrorBoundary
          fallback={(_error, reset) => (
            <button
              type="button"
              onClick={() => {
                setExplode(false);
                reset();
              }}
            >
              Tentar de novo
            </button>
          )}
        >
          <Bomb explode={explode} />
        </ErrorBoundary>
      );
    }
    render(<Harness />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Tentar de novo" }));

    expect(screen.getByText("tudo certo")).toBeTruthy();
  });

  it("converte algo que não é um Error (um texto lançado) em Error", () => {
    function Throws(): never {
      throw "texto solto";
    }
    render(
      <ErrorBoundary fallback={(error) => <p role="alert">{error.message}</p>}>
        <Throws />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert").textContent).toBe("texto solto");
  });
});
