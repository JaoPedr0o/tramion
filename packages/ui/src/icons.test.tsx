// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ChevronIcon,
  ComposeIcon,
  MoreIcon,
  PageIcon,
  PlusIcon,
  SidebarIcon,
  StarFilledIcon,
  StarIcon,
  TrashIcon,
} from "./index.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const icons = {
  PageIcon,
  ChevronIcon,
  PlusIcon,
  MoreIcon,
  StarIcon,
  StarFilledIcon,
  TrashIcon,
  ComposeIcon,
  SidebarIcon,
};

describe("ícones", () => {
  afterEach(cleanup);

  it.each(Object.entries(icons))("%s é um SVG decorativo de 16 px por padrão", (_name, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector("svg")!;

    expect(svg).toBeTruthy();
    expect(svg.getAttribute("aria-hidden")).toBe("true"); // o nome acessível vem do botão que o usa
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("stroke")).toBe("currentColor"); // usa a cor do texto
  });

  it("aceita outro tamanho", () => {
    const { container } = render(<PageIcon size={24} />);

    expect(container.querySelector("svg")!.getAttribute("width")).toBe("24");
    expect(container.querySelector("svg")!.getAttribute("height")).toBe("24");
  });

  it("a estrela cheia se distingue da vazia pelo preenchimento", () => {
    const empty = render(<StarIcon />).container.querySelector("path")!;
    const filled = render(<StarFilledIcon />).container.querySelector("path")!;

    expect(empty.getAttribute("fill")).toBeNull();
    expect(filled.getAttribute("fill")).toBe("currentColor");
  });
});
