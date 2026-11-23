// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  onReminderSettingsChange,
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
      timedNotifications: true,
      leadMinutes: 10,
    });
  });

  it("grava e lê de volta", () => {
    const settings = {
      systemNotifications: false,
      time: "07:45",
      lastDigest: "2026-11-15",
      timedNotifications: false,
      leadMinutes: 30,
    };
    saveReminderSettings(settings);

    expect(readReminderSettings()).toEqual(settings);
  });

  it("preferências antigas (sem os campos de hora) ganham o padrão deles", () => {
    localStorage.setItem(
      "tramion.reminders",
      JSON.stringify({ systemNotifications: false, time: "08:00", lastDigest: null }),
    );

    expect(readReminderSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      systemNotifications: false,
      time: "08:00",
    });
  });

  it("antecedência fora da lista volta ao padrão", () => {
    localStorage.setItem("tramion.reminders", JSON.stringify({ leadMinutes: 7 }));

    expect(readReminderSettings().leadMinutes).toBe(10);
  });

  it("avisa quem escuta quando grava", () => {
    const heard = vi.fn();
    const off = onReminderSettingsChange(heard);
    saveReminderSettings(DEFAULT_SETTINGS);
    off();
    saveReminderSettings(DEFAULT_SETTINGS);

    expect(heard).toHaveBeenCalledTimes(1);
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
