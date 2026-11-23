import { createEventBus, createModuleRegistry, createViewRegistry } from "@tramion/core";
import { describe, expect, it } from "vitest";
import { createFocusModule } from "./module.ts";
import { alarmStub, memoryGateway, platformStub } from "./test-support.ts";

describe("módulo Foco", () => {
  it("registra a tela 'Foco' quando iniciado", () => {
    const views = createViewRegistry();
    const registry = createModuleRegistry({ events: createEventBus(), views });
    registry.add(createFocusModule(memoryGateway(), { platform: platformStub() }));

    expect(registry.start()).toEqual(["focus"]);

    expect(views.list().map((v) => [v.id, v.title])).toEqual([["focus", "Foco"]]);
  });

  it("ao iniciar o app só LÊ o que estava guardado (para retomar o cronômetro): não grava, não avisa, não toca", async () => {
    const calls: string[] = [];
    const gateway = new Proxy(memoryGateway(), {
      get(target, key, receiver) {
        const value: unknown = Reflect.get(target, key, receiver);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          calls.push(String(key));
          return value(...args);
        };
      },
    });
    const platform = platformStub();
    const registry = createModuleRegistry({
      events: createEventBus(),
      views: createViewRegistry(),
    });
    const alarm = alarmStub();
    registry.add(createFocusModule(gateway, { platform, alarm }));
    registry.start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls.sort()).toEqual(["getSettings", "getTimer", "listSessions"]);
    expect(platform.notify).not.toHaveBeenCalled();
    expect(alarm.ring).not.toHaveBeenCalled();
    expect(alarm.unlock).not.toHaveBeenCalled();
  });
});
