/** O ícone da tela de Foco no seletor de telas: um tomatinho de linhas, igual em estilo aos outros ícones do app. */
export function FocusIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 4.6C5 3.8 2.4 5.8 2.4 8.9 2.4 11.9 5 14 8 14s5.6-2.1 5.6-5.1C13.6 5.8 11 3.8 8 4.6z" />
      <path d="M8 4.6C7.1 4.4 6.2 3.7 5.6 2.7M8 4.6c.9-.2 1.8-.9 2.4-1.9M8 4.6V2.3" />
    </svg>
  );
}
