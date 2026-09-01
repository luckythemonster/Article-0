import { describe, it, expect } from "vitest";
import type Phaser from "phaser";
import {
  NEW_RUN_NEXT_SCENE,
  NEW_RUN_SCENE,
  resetRun,
  startFreshRun,
} from "./GameState";
import { STAPLER_FIELD_MAX_CHARGES, STARTING_INVENTORY } from "./EntityStats";

/** A minimal stand-in for Phaser.Data.DataManager — get/set/has/remove over a Map. */
function fakeRegistry(): Phaser.Data.DataManager {
  const store = new Map<string, unknown>();
  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
    has: (key: string) => store.has(key),
    remove: (key: string) => store.delete(key),
  } as unknown as Phaser.Data.DataManager;
}

describe("resetRun", () => {
  it("clears run-scoped keys and starts a full inventory + Stapler charge pool", () => {
    const registry = fakeRegistry();
    registry.set("inventory", ["Stun Rounds"]);
    registry.set("staplerFieldCharges", 0);
    registry.set("objectives", { logsRecovered: true });

    resetRun(registry);

    expect(registry.get("inventory")).toEqual([...STARTING_INVENTORY]);
    expect(registry.get("staplerFieldCharges")).toBe(STAPLER_FIELD_MAX_CHARGES);
    expect(registry.has("objectives")).toBe(false);
  });

  it("puts the lights back on — a thrown breaker does not survive a fresh run", () => {
    // Circuit state is run-scoped, not save-scoped. Left in the registry it would
    // start a new run on a deck the *previous* one darkened.
    const registry = fakeRegistry();
    registry.set("powerGrid", { circuits: { "main1\u0000light_overhead1": false } });
    resetRun(registry);
    expect(registry.has("powerGrid")).toBe(false);
  });

  it("hands back a fresh array each time, not the shared starting-inventory const", () => {
    const registry = fakeRegistry();
    resetRun(registry);
    (registry.get("inventory") as string[]).push("Stun Rounds");
    expect(STARTING_INVENTORY).toEqual(["Sack Lunch"]);
  });

  it("is idempotent — resetting an already-clean registry still yields full charges", () => {
    const registry = fakeRegistry();
    resetRun(registry);
    expect(registry.get("staplerFieldCharges")).toBe(STAPLER_FIELD_MAX_CHARGES);
  });
});

/** A scene stand-in that records what `scene.start` was handed. */
function fakeScene(): { scene: Phaser.Scene; starts: { key: string; data: unknown }[] } {
  const starts: { key: string; data: unknown }[] = [];
  const scene = {
    registry: fakeRegistry(),
    scene: { start: (key: string, data: unknown) => starts.push({ key, data }) },
  } as unknown as Phaser.Scene;
  return { scene, starts };
}

describe("startFreshRun", () => {
  it("names the prologue's destination instead of leaving it to the last caller", () => {
    // The bug this guards: Phaser only overwrites a scene's settings.data when
    // `start` is given some, so a data-less start re-runs `init` against whatever
    // the previous start passed. Once a player had read the prologue from the
    // title screen (which passes `next: "TitleScene"`), every "New infiltration"
    // afterwards played the prologue and returned them to the title — no way to
    // start the game short of reloading the page.
    const { scene, starts } = fakeScene();
    startFreshRun(scene);

    expect(starts).toHaveLength(1);
    expect(starts[0].key).toBe(NEW_RUN_SCENE);
    expect(starts[0].data).toEqual({ next: NEW_RUN_NEXT_SCENE });
    // Specifically not undefined: that is the whole failure.
    expect(starts[0].data).not.toBeUndefined();
  });

  it("clears the previous run before starting the new one", () => {
    const { scene } = fakeScene();
    scene.registry.set("objectives", { logsRecovered: true });
    startFreshRun(scene);
    expect(scene.registry.has("objectives")).toBe(false);
  });
});
