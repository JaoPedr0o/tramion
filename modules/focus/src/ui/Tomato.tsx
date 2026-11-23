import { useId } from "react";

/**
 * O tomate desenhado em SVG: corpo (a cor vem de `--focus-body`, que muda com a fase), folhas verdes, caule e um
 * brilho sutil. Fica dentro de um `<svg>` de 240 x 240; o desenho ocupa a metade de baixo para deixar as folhas
 * respirarem em cima.
 */
export function TomatoArt() {
  const shine = useId();
  return (
    <g aria-hidden="true">
      <defs>
        <radialGradient id={shine} cx="35%" cy="28%" r="70%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* corpo: levemente achatado, com dois lobos em cima */}
      <path
        className="focus-tomato__body"
        d="M120 56c-14 -9 -34 -10 -52 2C46 72 36 98 40 126c4 32 36 62 80 62s76 -30 80 -62c4 -28 -6 -54 -28 -68 -18 -12 -38 -11 -52 -2z"
      />
      <path
        d="M120 56c-14 -9 -34 -10 -52 2C46 72 36 98 40 126c4 32 36 62 80 62s76 -30 80 -62c4 -28 -6 -54 -28 -68 -18 -12 -38 -11 -52 -2z"
        fill={`url(#${shine})`}
      />
      {/* brilho pontual */}
      <ellipse
        cx="76"
        cy="92"
        rx="12"
        ry="7"
        transform="rotate(-35 76 92)"
        fill="#fff"
        opacity="0.22"
      />
      {/* folhas */}
      <path
        className="focus-tomato__leaf"
        d="M120 58c-8 -2 -22 4 -34 -2 10 -3 18 -2 26 -6 -8 -4 -10 -10 -10 -16 10 2 16 8 18 14 2 -8 8 -14 18 -16 0 8 -4 14 -10 18 8 2 16 2 26 6 -12 6 -26 0 -34 2z"
      />
      <path
        className="focus-tomato__leaf focus-tomato__leaf--deep"
        d="M120 60c-4 -6 -10 -8 -16 -8 6 -2 12 0 16 4 4 -4 10 -6 16 -4 -6 0 -12 2 -16 8z"
      />
      {/* caule */}
      <path
        className="focus-tomato__stem"
        d="M120 58c0 -10 2 -18 8 -24"
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </g>
  );
}

/** Um tomatinho para os indicadores de ciclo (cheio = sessão feita). */
export function MiniTomato({ filled }: { filled: boolean }) {
  return (
    <svg
      className="focus-mini-tomato"
      data-filled={filled ? "true" : "false"}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="focus-mini-tomato__body"
        d="M12 7.5c-1.6-1.1-3.8-1.1-5.6.3C4.5 9.2 3.8 11.7 4.4 14c.7 3 3.7 5.5 7.6 5.5s6.9-2.5 7.6-5.5c.6-2.3-.1-4.8-2-6.2-1.8-1.4-4-1.4-5.6-.3z"
      />
      <path
        className="focus-mini-tomato__leaf"
        d="M12 8c-1-.4-2.5.3-3.6-.3 1-.5 1.8-.4 2.6-1-.7-.6-.9-1.3-.9-2 1 .3 1.6 1 1.9 1.6.3-.7.9-1.4 1.9-1.6 0 .8-.3 1.5-.9 2 .8.6 1.6.5 2.6 1-1.1.6-2.6-.1-3.6.3z"
      />
    </svg>
  );
}
