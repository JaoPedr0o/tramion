import { describe, expect, it } from "vitest";
import {
  datePart,
  formatDateValue,
  isDateValue,
  joinDateTime,
  localInstant,
  timePart,
} from "./date-time.ts";

describe("valor de data com hora opcional", () => {
  it("divide e junta", () => {
    expect(datePart("2026-11-24T14:30")).toBe("2026-11-24");
    expect(datePart("2026-11-24")).toBe("2026-11-24");
    expect(timePart("2026-11-24T14:30")).toBe("14:30");
    expect(timePart("2026-11-24")).toBeNull();
    expect(timePart("2026-11-24T25:00")).toBeNull();
    expect(joinDateTime("2026-11-24", "09:05")).toBe("2026-11-24T09:05");
    expect(joinDateTime("2026-11-24", "")).toBe("2026-11-24");
    expect(joinDateTime("2026-11-24", null)).toBe("2026-11-24");
    expect(joinDateTime("2026-11-24", "9:5")).toBe("2026-11-24");
  });

  it("reconhece o formato", () => {
    expect(isDateValue("2026-11-24")).toBe(true);
    expect(isDateValue("2026-11-24T14:30")).toBe(true);
    expect(isDateValue("2026-11-24T14:3")).toBe(false);
    expect(isDateValue("2026-11-24T")).toBe(false);
    expect(isDateValue("24/11/2026")).toBe(false);
    expect(isDateValue(5)).toBe(false);
  });

  it("formata em português", () => {
    expect(formatDateValue("2026-11-24T14:30")).toBe("24/11/2026 14:30");
    expect(formatDateValue("2026-11-24")).toBe("24/11/2026");
  });

  it("calcula o instante local", () => {
    expect(localInstant("2026-11-24T14:30")).toBe(new Date(2026, 10, 24, 14, 30).getTime());
    expect(localInstant("2026-11-24")).toBeNull();
  });
});
