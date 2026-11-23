import { useState, type ComponentType } from "react";
import type { HabitsStore } from "../application/habits-store.ts";
import type { PomodoroStore } from "../application/pomodoro-store.ts";
import { HabitsPanel } from "./HabitsPanel.tsx";
import { PomodoroPanel } from "./PomodoroPanel.tsx";

type Tab = "pomodoro" | "habits";

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "pomodoro", label: "Pomodoro" },
  { id: "habits", label: "Hábitos" },
];

/** Barra superior: só o nome da tela, sem nada que chame atenção. */
export function createTopbar(): ComponentType {
  return function FocusTopbar() {
    return <span className="focus-topbar">Foco</span>;
  };
}

/** A área principal do módulo: duas abas simples. A aba escolhida é lembrada ao trocar de tela dentro do app. */
export function createMain(deps: { pomodoro: PomodoroStore; habits: HabitsStore }): ComponentType {
  let remembered: Tab = "pomodoro";

  return function FocusMain() {
    const [tab, setTabState] = useState<Tab>(remembered);
    const setTab = (next: Tab) => {
      remembered = next;
      setTabState(next);
    };

    return (
      <div className="focus">
        <div className="focus__tabs" role="tablist" aria-label="Foco">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`focus-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`focus-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              className="focus__tab"
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  setTab(tab === "pomodoro" ? "habits" : "pomodoro");
                  requestAnimationFrame(() =>
                    document
                      .getElementById(`focus-tab-${tab === "pomodoro" ? "habits" : "pomodoro"}`)
                      ?.focus(),
                  );
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`focus-panel-${tab}`}
          aria-labelledby={`focus-tab-${tab}`}
          className="focus__panel"
        >
          {tab === "pomodoro" ? (
            <PomodoroPanel store={deps.pomodoro} />
          ) : (
            <HabitsPanel store={deps.habits} />
          )}
        </div>
      </div>
    );
  };
}
