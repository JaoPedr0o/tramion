import type { ReactNode } from "react";
import { TomatoArt } from "./Tomato.tsx";

interface Props {
  /** Quanto do tempo já passou, de 0 a 1 (a parte "cheia" do anel). */
  progress: number;
  /** O texto sobre o tomate (o tempo e o rótulo da fase). */
  children: ReactNode;
}

const RADIUS = 112;

/**
 * O anel de progresso em torno do tomate. O anel é um círculo com `pathLength=100`, então o traço
 * (`stroke-dasharray`) é a própria porcentagem. A transição suave vale só sem `prefers-reduced-motion` (no CSS).
 */
export function TimerRing({ progress, children }: Props) {
  const percent = Math.min(100, Math.max(0, progress * 100));
  return (
    <div className="focus-ring">
      <svg viewBox="0 0 240 240" className="focus-ring__svg" aria-hidden="true" focusable="false">
        <circle className="focus-ring__track" cx="120" cy="120" r={RADIUS} pathLength={100} />
        <circle
          className="focus-ring__progress"
          cx="120"
          cy="120"
          r={RADIUS}
          pathLength={100}
          strokeDasharray={`${percent} ${100 - percent}`}
          transform="rotate(-90 120 120)"
          data-empty={percent <= 0 ? "true" : undefined}
        />
        <g transform="translate(0 6) scale(1)">
          <TomatoArt />
        </g>
      </svg>
      <div className="focus-ring__center">{children}</div>
    </div>
  );
}
