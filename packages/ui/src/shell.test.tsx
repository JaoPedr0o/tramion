// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShellProvider, SidebarToggleButton, useShell } from "./index.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const { sidebarCollapsed } = useShell();
  return <p>{sidebarCollapsed ? "recolhida" : "aberta"}</p>;
}

describe("controles da moldura do app", () => {
  afterEach(cleanup);

  it("sem o app em volta, o padrão é a barra aberta e o botão é inofensivo", async () => {
    render(
      <>
        <Probe />
        <SidebarToggleButton />
      </>,
    );

    expect(screen.getByText("aberta")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button")); // não lança erro
  });

  it("o valor fornecido pelo app chega aos módulos", () => {
    render(
      <ShellProvider value={{ sidebarCollapsed: true, toggleSidebar: () => {} }}>
        <Probe />
      </ShellProvider>,
    );

    expect(screen.getByText("recolhida")).toBeTruthy();
  });

  it("o botão acompanha o estado: rótulo, aria-expanded e ação", async () => {
    const toggle = vi.fn();
    const { rerender } = render(
      <ShellProvider value={{ sidebarCollapsed: false, toggleSidebar: toggle }}>
        <SidebarToggleButton />
      </ShellProvider>,
    );

    const open = screen.getByRole("button", { name: "Fechar a barra lateral" });
    expect(open.getAttribute("aria-expanded")).toBe("true");
    await userEvent.setup().click(open);
    expect(toggle).toHaveBeenCalledOnce();

    rerender(
      <ShellProvider value={{ sidebarCollapsed: true, toggleSidebar: toggle }}>
        <SidebarToggleButton />
      </ShellProvider>,
    );
    const closed = screen.getByRole("button", { name: "Abrir a barra lateral" });
    expect(closed.getAttribute("aria-expanded")).toBe("false");
  });
});
