/**
 * A marca do aplicativo: um "T" com uma órbita (a trama que liga as ideias) e um ponto de acento (o "íon"). Chapada, sem
 * degradê: azulejo grafite, letra em papel e ponto em terracota. Decorativa (o nome vem do texto ao lado). O mesmo
 * desenho gera o ícone do aplicativo (`apps/desktop/src-tauri/icons/source/icon.svg`): ao alterar um, altere o outro.
 */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      aria-hidden="true"
      focusable="false"
      className="logo"
    >
      <rect width="1024" height="1024" rx="232" fill="#1f1b16" />
      <g transform="rotate(-24 512 540)">
        <ellipse
          cx="512"
          cy="540"
          rx="372"
          ry="138"
          fill="none"
          stroke="#f7f4ee"
          strokeOpacity="0.35"
          strokeWidth="22"
        />
      </g>
      <g
        fill="none"
        stroke="#f7f4ee"
        strokeWidth="104"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M318 340 H706" />
        <path d="M512 340 V770" />
      </g>
      <g transform="rotate(-24 512 540)">
        <circle cx="797" cy="628.7" r="50" fill="#e8825f" />
        <circle cx="189.8" cy="609" r="26" fill="#f7f4ee" fillOpacity="0.8" />
      </g>
    </svg>
  );
}
