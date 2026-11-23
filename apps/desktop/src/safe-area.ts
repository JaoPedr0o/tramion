/**
 * Margens seguras no celular: o Android desenha o app por baixo da barra de status e da de navegação (e o teclado), e
 * a ponte nativa `TramionNative` informa quanto espaço cada uma ocupa. Aqui isso vira as variáveis CSS `--safe-top`,
 * `--safe-right`, `--safe-bottom` e `--safe-left`, que o CSS usa para afastar o conteúdo. No computador não há ponte e
 * tudo fica em 0.
 */
export interface NativeBridge {
  /** "esquerda,topo,direita,base" em pixels CSS. */
  insets(): string;
  setLightBars(light: boolean): void;
}

const EVENT = "tramion-insets";
const SIDES = ["left", "top", "right", "bottom"] as const;

function bridge(): NativeBridge | undefined {
  return (window as unknown as { TramionNative?: NativeBridge }).TramionNative;
}

/** Lê "e,t,d,b"; qualquer coisa fora do formato vira 0 (nunca um valor negativo ou absurdo na tela). */
export function parseInsets(raw: string | undefined): readonly number[] {
  const parts = (raw ?? "").split(",").map((part) => Number(part));
  return SIDES.map((_, index) => {
    const value = parts[index];
    return value !== undefined && Number.isFinite(value) && value >= 0 && value <= 400 ? value : 0;
  });
}

export function applySafeArea(root: HTMLElement = document.documentElement): void {
  let raw: string | undefined;
  try {
    raw = bridge()?.insets();
  } catch {
    raw = undefined;
  }
  parseInsets(raw).forEach((value, index) => {
    root.style.setProperty(`--safe-${SIDES[index]!}`, `${value}px`);
  });
}

/** Aplica as margens agora e sempre que o Android avisar que mudaram (girar o aparelho, abrir o teclado). */
export function installSafeArea(root: HTMLElement = document.documentElement): () => void {
  const update = () => applySafeArea(root);
  update();
  window.addEventListener(EVENT, update);
  return () => window.removeEventListener(EVENT, update);
}

/** Ícones das barras do sistema: escuros num fundo claro, claros num fundo escuro. Sem ponte, não faz nada. */
export function setSystemBarsLight(light: boolean): void {
  try {
    bridge()?.setLightBars(light);
  } catch {
    /* sem ponte nativa */
  }
}
