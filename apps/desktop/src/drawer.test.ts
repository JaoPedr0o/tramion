import { describe, expect, it } from "vitest";
import { EDGE_MAX_PX, EDGE_MIN_PX, MAX_DRIFT_PX, MIN_SWIPE_PX, swipeAction } from "./drawer";

const at = (x: number, y = 300) => ({ x, y });

describe("swipeAction", () => {
  it("a partir da faixa perto da borda esquerda, para a direita, abre a gaveta", () => {
    expect(swipeAction(at(EDGE_MIN_PX), at(EDGE_MIN_PX + MIN_SWIPE_PX), false)).toBe("open");
    expect(swipeAction(at(EDGE_MAX_PX), at(EDGE_MAX_PX + 200), false)).toBe("open");
  });

  it("na borda extrema (gesto de voltar do Android) e fora da faixa não abre", () => {
    expect(swipeAction(at(5), at(5 + 200), false)).toBeNull();
    expect(swipeAction(at(EDGE_MIN_PX - 1), at(EDGE_MIN_PX + 200), false)).toBeNull();
    expect(swipeAction(at(EDGE_MAX_PX + 1), at(EDGE_MAX_PX + 300), false)).toBeNull();
  });

  it("arrasto curto demais não vale", () => {
    expect(swipeAction(at(60), at(60 + MIN_SWIPE_PX - 1), false)).toBeNull();
    expect(swipeAction(at(300), at(300 - MIN_SWIPE_PX + 1), true)).toBeNull();
  });

  it("para a esquerda, com a gaveta aberta, fecha (de qualquer ponto)", () => {
    expect(swipeAction(at(250), at(250 - MIN_SWIPE_PX), true)).toBe("close");
    expect(swipeAction(at(40), at(40 - 60), true)).toBe("close");
  });

  it("com a gaveta aberta, arrastar para a direita não faz nada; fechada, arrastar para a esquerda também não", () => {
    expect(swipeAction(at(60), at(300), true)).toBeNull();
    expect(swipeAction(at(300), at(5), false)).toBeNull();
  });

  it("movimento mais vertical que horizontal é rolagem", () => {
    expect(swipeAction(at(60, 100), at(60 + 80, 100 + MAX_DRIFT_PX + 1), false)).toBeNull();
    expect(swipeAction(at(60, 100), at(60 + 60, 100 + 70), false)).toBeNull();
  });
});
