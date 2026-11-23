import type { ReactNode } from "react";

/**
 * Ícones do sistema de design: SVG simples, desenhados aqui (sem biblioteca de ícones). Usam a cor
 * do texto (`currentColor`) e são decorativos (`aria-hidden`): o nome acessível vem do botão que os usa.
 */
export interface IconProps {
  /** Lado em pixels (padrão 16). */
  size?: number;
}

function Svg({ size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Folha de papel com a dobra no canto: o ícone padrão de uma página. */
export const PageIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 1.75h5l3 3v9.5H4z" />
    <path d="M9 1.75v3h3" />
  </Svg>
);

/** Lupa. */
export const SearchIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="M10.25 10.25 13.5 13.5" />
  </Svg>
);

/** Grade 2x2: o ícone padrão de uma base de dados. */
export const TableIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M2 6.5h12M2 10h12M6.5 6.5v7" />
  </Svg>
);

/** Aponta para a direita; o CSS gira para baixo quando a página está expandida. */
export const ChevronIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </Svg>
);

export const PlusIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);

/** Três pontos (menu "mais ações"). */
export const MoreIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="3.5" cy="8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12.5" cy="8" r="1.1" fill="currentColor" stroke="none" />
  </Svg>
);

const STAR = "M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z";

export const StarIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d={STAR} />
  </Svg>
);

export const StarFilledIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d={STAR} fill="currentColor" />
  </Svg>
);

export const TrashIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v4M9 7v4" />
  </Svg>
);

/** Quadrado com caneta: "nova página". */
export const ComposeIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12.5 9v3.5a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1H7" />
    <path d="M11.2 2.3l2.5 2.5-5 5H6.2V7.3z" />
  </Svg>
);

/** Painel com a coluna da esquerda: mostrar e esconder a barra lateral. */
export const SidebarIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M6 2.5v11" />
  </Svg>
);

export const SunIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="8" cy="8" r="2.8" />
    <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" />
  </Svg>
);

export const MoonIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M13.5 9.6A5.7 5.7 0 0 1 6.4 2.5a5.7 5.7 0 1 0 7.1 7.1z" />
  </Svg>
);

/** Tela: "seguir o tema do sistema". */
export const MonitorIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="2" y="2.5" width="12" height="8" rx="1.2" />
    <path d="M6 13.5h4M8 10.5v3" />
  </Svg>
);

/** Elo de corrente: link. */
export const LinkIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M6.5 9.5l3-3M5.8 7.2 4.4 8.6a2.4 2.4 0 0 0 3.4 3.4l1.4-1.4M10.2 8.8l1.4-1.4A2.4 2.4 0 0 0 8.2 4L6.8 5.4" />
  </Svg>
);
