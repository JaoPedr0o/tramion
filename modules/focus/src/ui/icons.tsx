import type { SVGProps } from "react";

/** Ícones pequenos em SVG (traço de 2 px, herdam a cor do texto). Sempre decorativos: o rótulo vem do botão. */
function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

export const GearIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
);

export const PlusIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const MinusIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="M5 12h14" />
  </Svg>
);

export const CheckIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg strokeWidth="3" {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const PlayIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg fill="currentColor" stroke="none" {...props}>
    <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z" />
  </Svg>
);

export const PauseIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg fill="currentColor" stroke="none" {...props}>
    <rect x="6" y="5" width="4" height="14" rx="1.2" />
    <rect x="14" y="5" width="4" height="14" rx="1.2" />
  </Svg>
);

export const StopIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const SkipIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="M5 5l9 7-9 7zM19 5v14" />
  </Svg>
);

export const SoundIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="M4 10v4h4l5 4V6L8 10z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
  </Svg>
);

/** Chama da sequência (preenchida, para ter peso visual). */
export const FlameIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg fill="currentColor" stroke="none" {...props}>
    <path d="M12.6 2.2c.4 3-1.2 4.6-2.7 6.3-1.4 1.6-2.4 3-2.4 5.2a4.9 4.9 0 0 0 9.8.4c.1-1.5-.4-2.7-1.2-3.8-.2 1.2-.8 2-1.7 2.4.5-3.4-.2-7.4-1.8-10.5z M12 21a3.2 3.2 0 0 1-3.2-3.2c0-1.6 1-2.5 1.9-3.5.7-.8 1.3-1.5 1.5-2.7 1.6 1.4 3 3 3 5.2A3.2 3.2 0 0 1 12 21z" />
  </Svg>
);

export const EditIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
  </Svg>
);

export const ArchiveIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg {...props}>
    <rect x="3" y="4" width="18" height="5" rx="1" />
    <path d="M5 9v10h14V9M10 13h4" />
  </Svg>
);

/** Brotinho do estado vazio dos hábitos. */
export const SproutIcon = (props: SVGProps<SVGSVGElement>) => (
  <Svg width="40" height="40" strokeWidth="1.6" {...props}>
    <path d="M12 21v-9" />
    <path d="M12 12C12 8 9 6 5 6c0 4 2 6 7 6z" />
    <path d="M12 14c0-3.5 2.5-6 7-6 0 4-2.5 6-7 6z" />
  </Svg>
);
