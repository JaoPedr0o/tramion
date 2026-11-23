/** Preferência de aparência: forçar claro ou escuro, ou seguir o tema do sistema. */
export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "tramion.theme";
/** Chaves dos nomes antigos do app: a preferência de quem já usava continua valendo. */
const LEGACY_STORAGE_KEYS = ["aesthetic.theme", "aun.theme"];

// O armazenamento pode faltar (janela privada, dados bloqueados): nesse caso o tema só não é lembrado.
export function readTheme(): ThemePreference {
  try {
    const stored = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]
      .map((key) => localStorage.getItem(key))
      .find((value) => value !== null);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

export function saveTheme(theme: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* sem armazenamento: não lembra */
  }
}

/** O tema que vale agora é claro? (Em "system", segue o sistema.) */
export function isLightTheme(theme: ThemePreference): boolean {
  if (theme === "light") return true;
  if (theme === "dark") return false;
  return (
    typeof window.matchMedia === "function" &&
    !window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * Aplica o tema. Os estilos (`tokens.css`) entendem `data-theme="light|dark"`; sem o atributo, vale a
 * preferência do sistema.
 */
export function applyTheme(
  theme: ThemePreference,
  root: HTMLElement = document.documentElement,
): void {
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}
