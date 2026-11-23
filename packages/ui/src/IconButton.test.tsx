// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IconButton, PlusIcon } from "./index.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("IconButton", () => {
  afterEach(cleanup);

  it("tem nome acessível e dica vindos do rótulo, e nunca envia formulário", () => {
    render(
      <IconButton label="Nova página">
        <PlusIcon />
      </IconButton>,
    );

    const button = screen.getByRole("button", { name: "Nova página" });
    expect(button.getAttribute("title")).toBe("Nova página");
    expect(button.getAttribute("type")).toBe("button");
  });

  it("repassa clique, estado e classes extras", async () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Favoritar" aria-pressed={true} className="extra" onClick={onClick}>
        <PlusIcon />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "Favoritar" });

    await userEvent.setup().click(button);

    expect(onClick).toHaveBeenCalledOnce();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.className).toBe("ui-icon-button extra");
  });

  it("desativado não dispara o clique", async () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Nada" disabled onClick={onClick}>
        <PlusIcon />
      </IconButton>,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Nada" }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
