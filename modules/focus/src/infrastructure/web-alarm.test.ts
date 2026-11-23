import { describe, expect, it, vi } from "vitest";
import { BELL_NOTES, createWebAlarm, type AudioContextLike } from "./web-alarm.ts";

function fakeContext(state = "running") {
  const oscillators: { frequency: { value: number }; start: ReturnType<typeof vi.fn> }[] = [];
  const context: AudioContextLike & { resume: ReturnType<typeof vi.fn> } = {
    currentTime: 10,
    destination: {},
    state,
    resume: vi.fn(async () => {}),
    createOscillator() {
      const oscillator = {
        type: "",
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain: () => ({
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }),
  };
  return { context, oscillators };
}

describe("alarme com o app aberto", () => {
  it("toca as três notas do sino em sequência e vibra", () => {
    const { context, oscillators } = fakeContext();
    const vibrate = vi.fn();
    createWebAlarm({ createContext: () => context, vibrate }).ring();

    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(oscillators.length).toBe(BELL_NOTES.length * 3);
    const fundamentals = oscillators.map((o) => o.frequency.value).filter((hz) => hz < 1100);
    expect(fundamentals).toEqual(expect.arrayContaining(BELL_NOTES.map((note) => note.hz)));
    // As notas começam em instantes crescentes, a partir de agora.
    const starts = oscillators.map((o) => o.start.mock.calls[0]?.[0] as number);
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...starts)).toBeGreaterThan(Math.min(...starts));
  });

  it("unlock cria e retoma o contexto suspenso (gesto da pessoa)", () => {
    const { context } = fakeContext("suspended");
    const alarm = createWebAlarm({ createContext: () => context, vibrate: vi.fn() });
    alarm.unlock();
    expect(context.resume).toHaveBeenCalledTimes(1);
  });

  it("sem áudio ou com erros, nunca lança", () => {
    const none = createWebAlarm({ createContext: () => null, vibrate: vi.fn() });
    expect(() => {
      none.unlock();
      none.ring();
    }).not.toThrow();

    const broken = createWebAlarm({
      createContext: () => {
        throw new Error("sem áudio");
      },
      vibrate: () => {
        throw new Error("sem vibração");
      },
    });
    expect(() => {
      broken.unlock();
      broken.ring();
    }).not.toThrow();
  });
});
