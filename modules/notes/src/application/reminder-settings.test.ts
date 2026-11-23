// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  readReminderSettings,
  saveReminderSettings,
} from "./reminder-settings.ts";

describe("preferências de lembretes", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sem nada guardado, usa o padrão (aviso do sistema ligado, às 09:00)", () => {
    expect(readReminderSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({
      systemNotifications: true,
      time: "09:00",
      lastDigest: null,
    });
  });

  it("grava e lê de volta", () => {
    saveReminderSettings({ systemNotifications: false, time: "07:45", lastDigest: "2026-11-15" });

    expect(readReminderSettings()).toEqual({
      systemNotifications: false,
      time: "07:45",
      lastDigest: "2026-11-15",
    });
  });

  it("valores inválidos voltam ao padrão campo a campo", () => {
    localStorage.setItem(
      "tramion.reminders",
      JSON.stringify({ systemNotifications: "sim", time: "99:99", lastDigest: "ontem" }),
    );

    expect(readReminderSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("JSON corrompido não quebra", () => {
    localStorage.setItem("tramion.reminders", "{não é json");

    expect(readReminderSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("sem armazenamento disponível, lê o padrão e gravar não falha", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("bloqueado");
      },
      configurable: true,
    });
    try {
      expect(readReminderSettings()).toEqual(DEFAULT_SETTINGS);
      expect(() => saveReminderSettings(DEFAULT_SETTINGS)).not.toThrow();
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
  });
});
