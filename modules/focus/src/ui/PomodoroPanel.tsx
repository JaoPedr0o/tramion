import { useEffect, useState, type FormEvent } from "react";
import type { PomodoroStore } from "../application/pomodoro-store.ts";
import type { PomodoroSettings } from "../domain/habit.ts";
import {
  durationMsFor,
  formatClock,
  formatMinutes,
  kindLabel,
  nextKind,
  remainingMs,
} from "../domain/pomodoro.ts";
import { useStore, useTicker } from "./hooks.ts";
import { messageFor } from "./messages.ts";

/** Pomodoro: um cronômetro tranquilo. Nada aqui começa, avisa ou pergunta sozinho. */
export function PomodoroPanel({ store }: { store: PomodoroStore }) {
  const snap = useStore(store);
  const { timer, settings, finished } = snap;

  // Carrega ajustes e sessões ao abrir a tela (uma vez; o store ignora repetições).
  useEffect(() => {
    void store.init();
  }, [store]);

  // Enquanto roda, confere o relógio com frequência (navegadores atrasam temporizadores de janelas ocultas).
  useTicker(timer.phase === "running", 500, store.tick);

  const now = store.now();
  const idle = timer.phase === "idle";
  const shownKind = idle ? "focus" : timer.kind;
  const shownMs = idle ? durationMsFor("focus", settings) : remainingMs(timer, now);

  const today = store.today();
  const todays = snap.sessions.filter((session) => store.dayOf(session.startedAt) === today);
  const todaySeconds = todays.reduce((sum, session) => sum + session.durationSec, 0);

  const next = finished ? nextKind(finished.kind, snap.completedInCycle, settings) : "focus";

  return (
    <section className="focus-card" aria-labelledby="focus-pomodoro-title">
      <h2 id="focus-pomodoro-title" className="focus-sr-only">
        Pomodoro
      </h2>

      <p className="focus-pomodoro__kind" data-kind={shownKind}>
        {kindLabel(shownKind)}
        {timer.phase === "paused" ? " (pausado)" : ""}
      </p>
      <p
        className="focus-pomodoro__clock"
        role="timer"
        aria-label={`Tempo restante (${kindLabel(shownKind).toLowerCase()})`}
        data-paused={timer.phase === "paused" ? "true" : undefined}
        data-idle={idle ? "true" : undefined}
      >
        {formatClock(shownMs)}
      </p>

      <div className="focus-actions">
        {idle ? (
          <button
            type="button"
            className="focus-btn focus-btn--primary"
            onClick={() => store.start()}
          >
            Iniciar foco
          </button>
        ) : (
          <>
            {timer.phase === "running" ? (
              <button
                type="button"
                className="focus-btn focus-btn--primary"
                onClick={() => store.pause()}
              >
                Pausar
              </button>
            ) : (
              <button
                type="button"
                className="focus-btn focus-btn--primary"
                onClick={() => store.resume()}
              >
                Retomar
              </button>
            )}
            <button type="button" className="focus-btn" onClick={() => store.cancel()}>
              {timer.kind === "focus" ? "Cancelar" : "Pular pausa"}
            </button>
          </>
        )}
      </div>

      {/* Região viva: leitores de tela anunciam o fim; a tela mostra o que fazer a seguir. */}
      <div role="status" aria-live="polite" className="focus-finished-region">
        {finished ? (
          <div className="focus-finished">
            <p>
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

      <p className="focus-pomodoro__today">
        {todays.length === 0
          ? "Nenhuma sessão hoje."
          : `Hoje: ${todays.length === 1 ? "1 sessão" : `${todays.length} sessões`} · ${formatMinutes(todaySeconds)}`}
      </p>

      <details className="focus-details">
        <summary>Ajustes do pomodoro</summary>
        <SettingsForm
          key={snap.loaded ? "loaded" : "loading"}
          settings={settings}
          onSave={(next) => store.saveSettings(next)}
          error={snap.error}
        />
      </details>
    </section>
  );
}

function SettingsForm({
  settings,
  onSave,
  error,
}: {
  settings: PomodoroSettings;
  onSave: (settings: PomodoroSettings) => Promise<boolean>;
  error: Error | null;
}) {
  const [focusMin, setFocusMin] = useState(String(settings.focusMin));
  const [breakMin, setBreakMin] = useState(String(settings.breakMin));
  const [longMin, setLongMin] = useState(String(settings.longBreakMin));
  const [longOn, setLongOn] = useState(settings.longBreakEvery > 0);
  const [longEvery, setLongEvery] = useState(String(settings.longBreakEvery || 4));
  const [notify, setNotify] = useState(settings.notify);
  const [saved, setSaved] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    const ok = await onSave({
      focusMin: Number(focusMin),
      breakMin: Number(breakMin),
      longBreakMin: Number(longMin),
      longBreakEvery: longOn ? Number(longEvery) : 0,
      notify,
    });
    setSaved(ok);
  };

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    min: number,
    max: number,
  ) => (
    <label className="focus-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => {
          setSaved(false);
          set(event.target.value);
        }}
        required
      />
    </label>
  );

  return (
    <form className="focus-settings" onSubmit={(event) => void submit(event)}>
      {field("Foco (minutos)", focusMin, setFocusMin, 1, 180)}
      {field("Pausa (minutos)", breakMin, setBreakMin, 1, 60)}
      <label className="focus-check">
        <input
          type="checkbox"
          checked={longOn}
          onChange={(event) => setLongOn(event.target.checked)}
        />
        <span>Pausa longa de vez em quando</span>
      </label>
      {longOn ? (
        <>
          {field("Pausa longa (minutos)", longMin, setLongMin, 1, 120)}
          {field("Pausa longa a cada (sessões)", longEvery, setLongEvery, 2, 12)}
        </>
      ) : null}
      <label className="focus-check">
        <input
          type="checkbox"
          checked={notify}
          onChange={(event) => setNotify(event.target.checked)}
        />
        <span>Avisar no fim com uma notificação do sistema</span>
      </label>
      {error ? (
        <p role="alert" className="focus-error">
          {messageFor(error)}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="focus-ok">
          Ajustes salvos.
        </p>
      ) : null}
      <div className="focus-actions">
        <button type="submit" className="focus-btn focus-btn--primary">
          Salvar ajustes
        </button>
      </div>
    </form>
  );
}
