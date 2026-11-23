import { describe, expect, it } from "vitest";
import { editedAgo } from "./format.ts";

const NOW = Date.UTC(2026, 10, 23, 12, 0, 0);
const ago = (ms: number) => editedAgo(NOW - ms, NOW);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("editedAgo", () => {
  it("'agora' para menos de 45 segundos, inclusive horas no futuro (relógio diferente)", () => {
    expect(ago(0)).toBe("Editado agora");
    expect(ago(44 * SECOND)).toBe("Editado agora");
    expect(editedAgo(NOW + 5 * MINUTE, NOW)).toBe("Editado agora");
  });

  it("minutos", () => {
    expect(ago(45 * SECOND)).toBe("Editado há 1 min");
    expect(ago(2 * MINUTE)).toBe("Editado há 2 min");
    expect(ago(59 * MINUTE)).toBe("Editado há 59 min");
  });

  it("horas", () => {
    expect(ago(60 * MINUTE)).toBe("Editado há 1 h");
    expect(ago(23 * HOUR)).toBe("Editado há 23 h");
  });

  it("dias, com singular", () => {
    expect(ago(24 * HOUR)).toBe("Editado há 1 dia");
    expect(ago(2 * DAY)).toBe("Editado há 2 dias");
    expect(ago(6 * DAY)).toBe("Editado há 6 dias");
  });

  it("passada uma semana, mostra a data", () => {
    expect(ago(7 * DAY)).toMatch(/^Editado em \d{2}\/\d{2}\/\d{4}$/);
  });
});
