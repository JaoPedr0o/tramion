import { describe, expect, it } from "vitest";
import { EDGE_PX, MAX_DRIFT_PX, MIN_SWIPE_PX, swipeAction } from "./drawer";

const at = (x: number, y = 300) => ({ x, y });

describe("swipeAction", () => {
  it("da borda esquerda para a direita abre a gaveta", () => {
    expect(swipeAction(at(5), at(5 + MIN_SWIPE_PX), false)).toBe("open");
    expect(swipeAction(at(EDGE_PX), at(EDGE_PX + 200), false)).toBe("open");
  });

  it("fora da borda não abre, nem com um arrasto longo", () => {
    expect(swipeAction(at(EDGE_PX + 1), at(EDGE_PX + 300), false)).toBeNull();
  });

  it("arrasto curto demais não vale", () => {
    expect(swipeAction(at(5), at(5 + MIN_SWIPE_PX - 1), false)).toBeNull();
    expect(swipeAction(at(300), at(300 - MIN_SWIPE_PX + 1), true)).toBeNull();
  });

  it("para a esquerda, com a gaveta aberta, fecha (de qualquer ponto)", () => {
    expect(swipeAction(at(250), at(250 - MIN_SWIPE_PX), true)).toBe("close");
    expect(swipeAction(at(40), at(40 - 60), true)).toBe("close");
  });

  it("com a gaveta aberta, arrastar para a direita não faz nada; fechada, arrastar para a esquerda também não", () => {
    expect(swipeAction(at(5), at(300), true)).toBeNull();
    expect(swipeAction(at(300), at(5), false)).toBeNull();
  });

  it("movimento mais vertical que horizontal é rolagem", () => {
    expect(swipeAction(at(5, 100), at(5 + 80, 100 + MAX_DRIFT_PX + 1), false)).toBeNull();
    expect(swipeAction(at(5, 100), at(5 + 60, 100 + 70), false)).toBeNull();
  });
});
