#!/usr/bin/env python3
"""Sintetiza os sons do pomodoro para o Android (sem baixar nada, sem direitos autorais de terceiros).

Gera em `gen/android/app/src/main/res/raw/`:
- `pomodoro_end.wav`: um toque de sino de uns 4 segundos (três notas, mi-sol-dó, com decaimento), mono, 44,1 kHz, 16 bits,
  volume moderado (pico em ~55 % do máximo);
- `pomodoro_silent.wav`: meio segundo de silêncio, usado pelo canal "sem som" (o plugin de notificações não cria canal sem
  som, mas aceita um arquivo mudo).

Uso: python3 apps/desktop/src-tauri/scripts/gerar-som-pomodoro.py
"""

import math
import struct
import wave
from pathlib import Path

RATE = 44_100
PEAK = 0.55
# (início em segundos, frequência em Hz): mi5, sol5, dó6.
NOTES = [(0.0, 659.25), (0.55, 783.99), (1.1, 1046.50)]
# Parciais de um sino: (razão da frequência, nível, constante de decaimento em segundos).
PARTIALS = [(1.0, 1.0, 0.9), (2.76, 0.35, 0.55), (5.40, 0.12, 0.3), (0.5, 0.25, 1.2)]
TOTAL_SECONDS = 4.2

RAW = Path(__file__).resolve().parent.parent / "gen/android/app/src/main/res/raw"


def bell() -> list[float]:
    samples = [0.0] * int(RATE * TOTAL_SECONDS)
    for start, hz in NOTES:
        offset = int(start * RATE)
        for ratio, level, decay in PARTIALS:
            for i in range(offset, len(samples)):
                t = (i - offset) / RATE
                attack = min(1.0, t / 0.006)  # 6 ms: evita o estalo do começo
                samples[i] += level * attack * math.exp(-t / decay) * math.sin(2 * math.pi * hz * ratio * t)
    peak = max(abs(s) for s in samples)
    fade = int(RATE * 0.05)
    for i in range(fade):  # fecha o final sem corte seco
        samples[len(samples) - 1 - i] *= i / fade
    return [s / peak * PEAK for s in samples]


def write(name: str, samples: list[float]) -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    with wave.open(str(RAW / name), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in samples))
    print(f"{RAW / name}: {len(samples) / RATE:.2f} s")


if __name__ == "__main__":
    write("pomodoro_end.wav", bell())
    write("pomodoro_silent.wav", [0.0] * (RATE // 2))
