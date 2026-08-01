import { describe, it, expect } from "vitest";
import type Phaser from "phaser";
import { resetRun } from "./GameState";
import { STAPLER_FIELD_MAX_CHARGES } from "./EntityStats";

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

    expect(registry.get("inventory")).toEqual([]);
    expect(registry.get("staplerFieldCharges")).toBe(STAPLER_FIELD_MAX_CHARGES);
    expect(registry.has("objectives")).toBe(false);
  });

  it("is idempotent — resetting an already-clean registry still yields full charges", () => {
    const registry = fakeRegistry();
    resetRun(registry);
    expect(registry.get("staplerFieldCharges")).toBe(STAPLER_FIELD_MAX_CHARGES);
  });
});
