import { useId } from "react";

/**
 * A marca do aplicativo: um "T" com uma órbita (a trama que liga as ideias) sobre um degradê índigo → violeta → coral.
 * Decorativa (o nome vem do texto ao lado). O mesmo desenho gera o ícone do aplicativo
 * (`apps/desktop/src-tauri/icons/source/icon.svg`): ao alterar um, altere o outro.
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
          <stop offset="0" stopColor="#5d4be0" />
          <stop offset="0.55" stopColor="#9a7bff" />
          <stop offset="1" stopColor="#ff9a8b" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="232" fill={`url(#${gradient})`} />
      <g transform="rotate(-24 512 540)">
        <ellipse
          cx="512"
          cy="540"
          rx="372"
          ry="138"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.5"
          strokeWidth="22"
        />
      </g>
      <g fill="none" stroke="#fff" strokeWidth="104" strokeLinecap="round" strokeLinejoin="round">
        <path d="M318 340 H706" />
        <path d="M512 340 V770" />
      </g>
      <g transform="rotate(-24 512 540)" fill="#fff">
        <circle cx="797" cy="628.7" r="46" />
        <circle cx="189.8" cy="609" r="26" fillOpacity="0.85" />
      </g>
    </svg>
  );
}
