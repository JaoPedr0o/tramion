/** Intervalo mínimo entre duas sincronizações: eventos em sequência (voltar ao app, trocar de rede) viram uma só. */
export const MIN_GAP_MS = 15_000;
/** De quanto em quanto tempo sincroniza sozinho enquanto o app está aberto. */
export const PERIOD_MS = 120_000;
/** Pausa depois da última edição antes de sincronizar (para não sincronizar a cada letra digitada). */
export const EDIT_DEBOUNCE_MS = 5_000;

export interface AutoSync {
  /** Sincroniza assim que possível (respeitando o intervalo mínimo e sem sobrepor outra em andamento). */
  trigger(): void;
  /** Sincroniza depois de uma pausa nas edições; cada nova chamada reinicia a espera. */
  triggerSoon(): void;
  /** Para tudo (não sincroniza mais nada, nem o que estava agendado). */
  stop(): void;
}

/**
 * Agendador da sincronização automática. Garante três coisas: nunca duas sincronizações ao mesmo tempo (um pedido que
 * chega durante uma delas vira uma nova logo depois), nunca mais de uma a cada [`MIN_GAP_MS`], e que uma falha não
 * derruba nada (a próxima tentativa vem no ritmo normal). Quem chama liga os gatilhos (foco, rede, edições).
 */
export function startAutoSync(
  run: () => Promise<void>,
  options: { minGapMs?: number; periodMs?: number; editDebounceMs?: number } = {},
): AutoSync {
  const minGap = options.minGapMs ?? MIN_GAP_MS;
  const period = options.periodMs ?? PERIOD_MS;
  const debounce = options.editDebounceMs ?? EDIT_DEBOUNCE_MS;

  let stopped = false;
  let running = false;
  let again = false;
  let lastStart = Number.NEGATIVE_INFINITY;
  let gapTimer: ReturnType<typeof setTimeout> | null = null;
  let editTimer: ReturnType<typeof setTimeout> | null = null;

  const fire = () => {
    gapTimer = null;
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    lastStart = Date.now();
    void run()
      .catch(() => {})
      .finally(() => {
        running = false;
        if (again && !stopped) {
          again = false;
          trigger();
        }
      });
  };

  const trigger = () => {
    if (stopped || gapTimer !== null) return; // já há uma agendada
    const wait = Math.max(0, lastStart + minGap - Date.now());
    if (wait === 0) fire();
    else gapTimer = setTimeout(fire, wait);
  };

  const periodic = setInterval(trigger, period);

  return {
    trigger,
    triggerSoon() {
      if (stopped) return;
      if (editTimer !== null) clearTimeout(editTimer);
      editTimer = setTimeout(() => {
        editTimer = null;
        trigger();
      }, debounce);
    },
    stop() {
      stopped = true;
      clearInterval(periodic);
      if (gapTimer !== null) clearTimeout(gapTimer);
      if (editTimer !== null) clearTimeout(editTimer);
      gapTimer = null;
      editTimer = null;
    },
  };
}
