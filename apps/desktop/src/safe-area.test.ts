// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applySafeArea,
  installSafeArea,
  parseInsets,
  setSystemBarsLight,
  type NativeBridge,
} from "./safe-area";

const setBridge = (bridge: NativeBridge | undefined) => {
  const holder = window as unknown as { TramionNative?: NativeBridge };
  if (bridge) holder.TramionNative = bridge;
  else delete holder.TramionNative;
};

afterEach(() => {
  setBridge(undefined);
  document.documentElement.removeAttribute("style");
});

describe("parseInsets", () => {
  it("lê esquerda, topo, direita e base", () => {
    expect(parseInsets("0,24.5,0,34")).toEqual([0, 24.5, 0, 34]);
  });

  it("valores ausentes, ilegíveis, negativos ou absurdos viram 0", () => {
    expect(parseInsets(undefined)).toEqual([0, 0, 0, 0]);
    expect(parseInsets("")).toEqual([0, 0, 0, 0]);
    expect(parseInsets("a,-3,9999,12")).toEqual([0, 0, 0, 12]);
    expect(parseInsets("10")).toEqual([10, 0, 0, 0]);
  });
});

describe("applySafeArea", () => {
  it("sem ponte nativa (computador), tudo fica em 0", () => {
    applySafeArea();

    const style = document.documentElement.style;
    expect(
      ["top", "right", "bottom", "left"].map((s) => style.getPropertyValue(`--safe-${s}`)),
    ).toEqual(["0px", "0px", "0px", "0px"]);
  });

  it("com a ponte, grava as margens em variáveis CSS", () => {
    setBridge({ insets: () => "4,30,6,48", setLightBars: () => {} });

    applySafeArea();

    const style = document.documentElement.style;
    expect(style.getPropertyValue("--safe-left")).toBe("4px");
    expect(style.getPropertyValue("--safe-top")).toBe("30px");
    expect(style.getPropertyValue("--safe-right")).toBe("6px");
    expect(style.getPropertyValue("--safe-bottom")).toBe("48px");
  });

  it("uma ponte que falha não derruba o app", () => {
    setBridge({
      insets: () => {
        throw new Error("falhou");
      },
      setLightBars: () => {},
    });

    expect(() => applySafeArea()).not.toThrow();
    expect(document.documentElement.style.getPropertyValue("--safe-top")).toBe("0px");
  });
});

describe("installSafeArea", () => {
  it("atualiza quando o Android avisa e para de ouvir ao desinstalar", () => {
    let top = "20";
    setBridge({ insets: () => `0,${top},0,0`, setLightBars: () => {} });
    const stop = installSafeArea();
    expect(document.documentElement.style.getPropertyValue("--safe-top")).toBe("20px");

    top = "40";
    window.dispatchEvent(new Event("tramion-insets"));
    expect(document.documentElement.style.getPropertyValue("--safe-top")).toBe("40px");

    stop();
    top = "60";
    window.dispatchEvent(new Event("tramion-insets"));
    expect(document.documentElement.style.getPropertyValue("--safe-top")).toBe("40px");
  });
});

describe("setSystemBarsLight", () => {
  it("repassa a escolha à ponte, e sem ponte não faz nada", () => {
    const setLightBars = vi.fn();
    setBridge({ insets: () => "0,0,0,0", setLightBars });

    setSystemBarsLight(true);
    setSystemBarsLight(false);

    expect(setLightBars.mock.calls).toEqual([[true], [false]]);
    setBridge(undefined);
    expect(() => setSystemBarsLight(true)).not.toThrow();
  });
});
