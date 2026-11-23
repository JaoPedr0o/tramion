import { useEffect, useState } from "react";
import type { PomodoroStore } from "../application/pomodoro-store.ts";
import {
  durationMsFor,
  formatClock,
  formatMinutes,
  kindLabel,
  nextKind,
  remainingMs,
} from "../domain/pomodoro.ts";
import { useStore, useTicker } from "./hooks.ts";
import { GearIcon, PauseIcon, PlayIcon, SkipIcon, StopIcon } from "./icons.tsx";
import { SettingsDialog } from "./SettingsDialog.tsx";
import { MiniTomato } from "./Tomato.tsx";
import { TimerRing } from "./TimerRing.tsx";
import { messageFor } from "./messages.ts";

/** Quantos tomatinhos o ciclo tem: a pausa longa, se ligada; senão, quatro (o pomodoro clássico). */
const DEFAULT_CYCLE = 4;

/** Pomodoro: um cronômetro tranquilo. Nada aqui começa, avisa ou pergunta sozinho. */
export function PomodoroPanel({ store }: { store: PomodoroStore }) {
  const snap = useStore(store);
  const { timer, settings, finished } = snap;
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Carrega ajustes e sessões ao abrir a tela (uma vez; o store ignora repetições).
  useEffect(() => {
    void store.init();
  }, [store]);

  // Enquanto roda, confere o relógio com frequência (navegadores atrasam temporizadores de janelas ocultas).
  useTicker(timer.phase === "running", 500, store.tick);

  const now = store.now();
  const idle = timer.phase === "idle";
  const shownKind = idle ? "focus" : timer.kind;
  const totalMs = idle ? durationMsFor("focus", settings) : timer.durationMs;
  const shownMs = idle ? totalMs : remainingMs(timer, now);
  const progress = idle || totalMs <= 0 ? 0 : 1 - shownMs / totalMs;

  const today = store.today();
  const todays = snap.sessions.filter((session) => store.dayOf(session.startedAt) === today);
  const todaySeconds = todays.reduce((sum, session) => sum + session.durationSec, 0);

  const next = finished ? nextKind(finished.kind, snap.completedInCycle, settings) : "focus";

  const cycleSize = settings.longBreakEvery >= 2 ? settings.longBreakEvery : DEFAULT_CYCLE;
  const cycleDone = snap.completedInCycle === 0 ? 0 : ((snap.completedInCycle - 1) % cycleSize) + 1;

  const phaseText = `${kindLabel(shownKind)}${timer.phase === "paused" ? " (pausado)" : ""}`;

  return (
    <section className="focus-pomodoro" aria-labelledby="focus-pomodoro-title">
      <h2 id="focus-pomodoro-title" className="focus-sr-only">
        Pomodoro
      </h2>

      <div className="focus-stage" data-kind={shownKind} data-running={timer.phase === "running"}>
        <div className="focus-stage__bar">
          <p className="focus-pomodoro__kind" data-kind={shownKind}>
            {phaseText}
          </p>
          <button
            type="button"
            className="focus-btn focus-btn--ghost"
            onClick={() => setSettingsOpen(true)}
          >
            <GearIcon />
            Ajustes
          </button>
        </div>

        <TimerRing progress={progress}>
          <p
            className="focus-pomodoro__clock"
            role="timer"
            aria-label={`Tempo restante (${kindLabel(shownKind).toLowerCase()})`}
          >
            {formatClock(shownMs)}
          </p>
        </TimerRing>

        <div
          className="focus-cycle"
          role="img"
          aria-label={`Ciclo: ${cycleDone} de ${cycleSize} sessões de foco`}
        >
          {Array.from({ length: cycleSize }, (_, index) => (
            <MiniTomato key={index} filled={index < cycleDone} />
          ))}
        </div>

        <div className="focus-actions focus-actions--center">
          {idle ? (
            <button
              type="button"
              className="focus-btn focus-btn--primary focus-btn--big"
              onClick={() => store.start()}
            >
              <PlayIcon />
              Iniciar foco
            </button>
          ) : (
            <>
              {timer.phase === "running" ? (
                <button
                  type="button"
                  className="focus-btn focus-btn--primary focus-btn--big"
                  onClick={() => store.pause()}
                >
                  <PauseIcon />
                  Pausar
                </button>
              ) : (
                <button
                  type="button"
                  className="focus-btn focus-btn--primary focus-btn--big"
                  onClick={() => store.resume()}
                >
                  <PlayIcon />
                  Retomar
                </button>
              )}
              <button
                type="button"
                className="focus-btn focus-btn--big"
                onClick={() => store.cancel()}
              >
                {timer.kind === "focus" ? <StopIcon /> : <SkipIcon />}
                {timer.kind === "focus" ? "Cancelar" : "Pular pausa"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Região viva: leitores de tela anunciam o fim; a tela mostra o que fazer a seguir. */}
      <div role="status" aria-live="polite" className="focus-finished-region">
        {finished ? (
          <div className="focus-finished">
            <p className="focus-finished__text">
              {finished.kind === "focus"
                ? "Sessão de foco concluída."
                : `${kindLabel(finished.kind)} terminada.`}
            </p>
            <div className="focus-actions">
              <button
                type="button"
                className="focus-btn focus-btn--primary"
                onClick={() => store.startNext()}
              >
                {next === "focus"
                  ? "Começar foco"
                  : `Começar ${kindLabel(next).toLowerCase()} (${durationMsFor(next, settings) / 60_000} min)`}
              </button>
              <button type="button" className="focus-btn" onClick={() => store.dismissFinished()}>
                Agora não
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {finished?.recordFailed ? (
        <p role="alert" className="focus-error">
          Não foi possível salvar esta sessão no histórico.{" "}
          <button type="button" className="focus-link" onClick={() => void store.retryRecord()}>
            Tentar de novo
          </button>
        </p>
      ) : null}

      <section className="focus-today" aria-labelledby="focus-today-title">
        <h3 id="focus-today-title" className="focus-section-title">
          Hoje
        </h3>
        <div className="focus-stats">
          <div
            className="focus-stat"
            role="group"
            aria-label={`Foco hoje: ${formatMinutes(todaySeconds)}`}
          >
            <span className="focus-stat__value" aria-hidden="true">
              {formatMinutes(todaySeconds)}
            </span>
            <span className="focus-stat__label" aria-hidden="true">
              focados
            </span>
          </div>
          <div className="focus-stat" role="group" aria-label={`Pomodoros hoje: ${todays.length}`}>
            <span className="focus-stat__value" aria-hidden="true">
              {todays.length}
            </span>
            <span className="focus-stat__label" aria-hidden="true">
              {todays.length === 1 ? "pomodoro" : "pomodoros"}
            </span>
          </div>
        </div>
        {todays.length === 0 ? (
          <p className="focus-empty">Nenhuma sessão hoje.</p>
        ) : (
          <ul className="focus-sessions" aria-label="Últimas sessões de hoje">
            {todays.slice(0, 5).map((session) => (
              <li key={session.id} className="focus-session">
                <span className="focus-session__time">{store.hourOf(session.startedAt)}</span>
                <span className="focus-session__bar" aria-hidden="true" />
                <span>{formatMinutes(session.durationSec)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {settingsOpen ? (
        <SettingsDialog
          settings={settings}
          systemAlarm={store.systemAlarm}
          error={snap.error}
          onSave={(next) => store.saveSettings(next)}
          onPreview={() => store.previewAlarm()}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {snap.error && !settingsOpen ? (
        <p role="alert" className="focus-error">
          {messageFor(snap.error)}
        </p>
      ) : null}
    </section>
  );
}
