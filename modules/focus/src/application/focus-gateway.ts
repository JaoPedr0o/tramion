import type { Day } from "../domain/day.ts";
import type { NotificationPlan } from "../domain/notification-plan.ts";
import type { TimerRecord } from "../domain/pomodoro.ts";
import type {
  FocusSession,
  Habit,
  HabitCheck,
  HabitInput,
  PomodoroSettings,
} from "../domain/habit.ts";

/**
 * Tudo que o módulo Foco precisa para ler e gravar dados. A interface só conhece este contrato, então
 * os testes usam uma versão em memória e o app usa a do Tauri (que chama o Rust).
 */
export interface FocusGateway {
  listHabits(includeArchived: boolean): Promise<Habit[]>;
  createHabit(input: HabitInput): Promise<Habit>;
  updateHabit(id: string, input: HabitInput): Promise<Habit>;
  archiveHabit(id: string, archived: boolean): Promise<Habit>;
  /** As marcações de todos os hábitos entre dois dias (inclusive). */
  listChecks(from: Day, to: Day): Promise<HabitCheck[]>;
  setCheck(args: { habitId: string; day: Day; done: boolean }): Promise<void>;
  /** O cronômetro guardado (parado, se nunca foi usado). Sobrevive ao app fechado. */
  getTimer(): Promise<TimerRecord>;
  /** Guarda o cronômetro (iniciar, pausar, retomar, cancelar). */
  saveTimer(record: TimerRecord): Promise<void>;
  /**
   * Conclui o cronômetro que está rodando: registra a sessão de foco (início e duração do cronômetro guardado) e o
   * deixa parado com o ciclo informado, tudo de uma vez. Idempotente: se já foi concluído, devolve `null`.
   */
  finishTimer(cycle: number): Promise<FocusSession | null>;
  /** As sessões mais recentes primeiro, a partir de `since` (ms), se informado. */
  listSessions(args: { since?: number; limit?: number }): Promise<FocusSession[]>;
  getSettings(): Promise<PomodoroSettings>;
  saveSettings(settings: PomodoroSettings): Promise<PomodoroSettings>;
}

/** O que o módulo pede ao SISTEMA (não aos dados). É a "porta" da plataforma: injetada, nunca importada do módulo de notas. */
export interface FocusPlatform {
  /** Mostra uma notificação do sistema (pede a permissão na primeira vez; sem permissão, não faz nada). */
  notify(title: string, body: string): Promise<void>;
  /**
   * `true` quando o sistema avisa o fim sozinho, por alarme agendado (celular): a interface não precisa tocar o sino
   * nem notificar na hora do fim (o alarme faz isso, até com o app aberto). No computador é `false`.
   */
  readonly systemAlarm: boolean;
  /**
   * Deixa o sistema como o plano manda: notificação fixa mostrada/atualizada/cancelada e aviso do fim agendado/cancelado.
   * Idempotente (pode ser chamado com o mesmo plano). No computador não faz nada.
   */
  syncTimerNotifications(plan: NotificationPlan): Promise<void>;
  /** Tira só a notificação fixa (o cronômetro terminou); NÃO cancela o aviso do fim, que pode estar tocando. */
  clearOngoing(): Promise<void>;
}

/** O alarme sonoro do fim, com o app aberto: sino sintetizado e vibração. Injetável para os testes. */
export interface FocusAlarm {
  /** Prepara o áudio dentro de um gesto da pessoa (navegadores só deixam tocar depois de um toque). */
  unlock(): void;
  /** Toca o sino e vibra (no celular). Nunca lança. */
  ring(): void;
}

/** O relógio: injetável para os testes controlarem a hora e o fuso. */
export interface Clock {
  now(): number;
  /** Nome IANA do fuso; sem ele, o do aparelho. */
  readonly timeZone?: string;
}

export const systemClock: Clock = { now: () => Date.now() };
