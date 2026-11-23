/** Preferência de aparência: forçar claro ou escuro, ou seguir o tema do sistema. */
export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "aun.theme";

// O armazenamento pode faltar (janela privada, dados bloqueados): nesse caso o tema só não é lembrado.
export function readTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
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
