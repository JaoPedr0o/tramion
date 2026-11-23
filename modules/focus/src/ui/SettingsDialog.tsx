import { useState, type FormEvent } from "react";
import type { PomodoroSettings } from "../domain/habit.ts";
import { Dialog } from "./Dialog.tsx";
import { SoundIcon } from "./icons.tsx";
import { messageFor } from "./messages.ts";
import { Stepper, Switch } from "./controls.tsx";

interface Props {
  settings: PomodoroSettings;
  /** O sistema avisa o fim sozinho (celular): a opção de notificação do computador não se aplica. */
  systemAlarm: boolean;
  onSave: (settings: PomodoroSettings) => Promise<boolean>;
  onPreview: () => void;
  onClose: () => void;
  error: Error | null;
}

/** Ajustes do pomodoro: durações com − e +, pausa longa, notificação e som. */
export function SettingsDialog({
  settings,
  systemAlarm,
  onSave,
  onPreview,
  onClose,
  error,
}: Props) {
  const [focusMin, setFocusMin] = useState(settings.focusMin);
  const [breakMin, setBreakMin] = useState(settings.breakMin);
  const [longMin, setLongMin] = useState(settings.longBreakMin);
  const [longOn, setLongOn] = useState(settings.longBreakEvery > 0);
  const [longEvery, setLongEvery] = useState(settings.longBreakEvery || 4);
  const [notify, setNotify] = useState(settings.notify);
  const [sound, setSound] = useState(settings.sound);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const ok = await onSave({
      focusMin,
      breakMin,
      longBreakMin: longMin,
      longBreakEvery: longOn ? longEvery : 0,
      notify,
      sound,
    });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Dialog
      title="Ajustes do pomodoro"
      subtitle="Valem a partir do próximo cronômetro."
      onClose={onClose}
      onSubmit={(event) => void submit(event)}
      footer={
        <>
          <button type="button" className="focus-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="focus-btn focus-btn--primary" disabled={busy}>
            Salvar ajustes
          </button>
        </>
      }
    >
      <section className="focus-group" aria-label="Durações">
        <Stepper
          label="Foco"
          short="foco"
          value={focusMin}
          min={1}
          max={180}
          unit="min"
          onChange={setFocusMin}
        />
        <Stepper
          label="Pausa"
          short="pausa"
          value={breakMin}
          min={1}
          max={60}
          unit="min"
          onChange={setBreakMin}
        />
      </section>

      <section className="focus-group" aria-label="Pausa longa">
        <Switch
          label="Pausa longa de vez em quando"
          hint="Depois de várias sessões de foco seguidas."
          checked={longOn}
          onChange={setLongOn}
        />
        {longOn ? (
          <>
            <Stepper
              label="Pausa longa"
              short="pausa longa"
              value={longMin}
              min={1}
              max={120}
              unit="min"
              onChange={setLongMin}
            />
            <Stepper
              label="A cada"
              short="sessões da pausa longa"
              value={longEvery}
              min={2}
              max={12}
              unit="sessões"
              onChange={setLongEvery}
            />
          </>
        ) : null}
      </section>

      <section className="focus-group" aria-label="Avisos">
        <Switch
          label="Som ao terminar"
          hint="Um sino curto, com vibração no celular."
          checked={sound}
          onChange={setSound}
          extra={
            <button type="button" className="focus-btn focus-btn--small" onClick={onPreview}>
              <SoundIcon width={18} height={18} />
              Ouvir
            </button>
          }
        />
        {systemAlarm ? (
          <p className="focus-note">
            No celular o aviso do fim chega por alarme do sistema, mesmo com o app fechado.
          </p>
        ) : (
          <Switch
            label="Avisar no fim com uma notificação do sistema"
            hint="Desligado por padrão."
            checked={notify}
            onChange={setNotify}
          />
        )}
      </section>

      {error ? (
        <p role="alert" className="focus-error">
          {messageFor(error)}
        </p>
      ) : null}
    </Dialog>
  );
}
