import { useId } from "react";

/**
 * A marca do aplicativo: um "A" caligráfico com uma faísca, sobre um degradê lavanda → rosé → pêssego.
 * Decorativa (o nome vem do texto ao lado). O mesmo desenho gera o ícone do aplicativo.
 */
export function Logo({ size = 24 }: { size?: number }) {
  const gradient = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      aria-hidden="true"
      focusable="false"
      className="logo"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9a2ec" />
          <stop offset="0.52" stopColor="#f4a6c7" />
          <stop offset="1" stopColor="#ffd0b0" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="232" fill={`url(#${gradient})`} />
      <g fill="none" stroke="#fff" strokeWidth="84" strokeLinecap="round" strokeLinejoin="round">
        <path d="M292 790 L492 262 L692 790" />
        <path d="M372 622 H612" />
      </g>
      <path
        fill="#fff"
        d="M752 168 C760 252 786 278 870 286 C786 294 760 320 752 404 C744 320 718 294 634 286 C718 278 744 252 752 168 Z"
      />
    </svg>
  );
}
