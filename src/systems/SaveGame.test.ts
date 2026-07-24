import { describe, it, expect, beforeEach } from "vitest";
import { saveGame, loadGame, hasSave, clearSave } from "./SaveGame";
import { initialObjectives } from "./Objectives";

/** Minimal in-memory localStorage stand-in for the node test environment. */
class MemStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

beforeEach(() => {
  globalThis.localStorage = new MemStorage() as unknown as Storage;
});

describe("SaveGame", () => {
  const sample = {
    level: "main1",
    tileX: 3,
    tileY: 7,
    hp: 80,
    inventory: ["Ration Pack"],
    objectives: initialObjectives(),
  };

  it("round-trips a saved checkpoint", () => {
    expect(hasSave()).toBe(false);
    saveGame(sample);
    expect(hasSave()).toBe(true);
    const loaded = loadGame();
    expect(loaded?.level).toBe("main1");
    expect(loaded?.hp).toBe(80);
    expect(loaded?.inventory).toEqual(["Ration Pack"]);
    expect(loaded?.objectives.logsRecovered).toBe(false);
  });

  it("clears a save", () => {
    saveGame(sample);
    clearSave();
    expect(hasSave()).toBe(false);
    expect(loadGame()).toBeNull();
  });

  it("rejects a malformed or versionless payload", () => {
    localStorage.setItem("article-zero-save", JSON.stringify({ level: "main1" }));
    expect(loadGame()).toBeNull();
  });

  it("rejects out-of-range or corrupted field values", () => {
    const base = { version: 1, ...sample };
    const bad: Array<Record<string, unknown>> = [
      { ...base, hp: Number.NaN }, // non-finite HP
      { ...base, hp: -5 }, // negative HP
      { ...base, tileX: -1 }, // off-grid tile
      { ...base, tileY: 2.5 }, // fractional tile
      { ...base, level: "" }, // empty level id
      { ...base, inventory: ["ok", 7] }, // non-string inventory entry
      { ...base, objectives: {} }, // missing logsRecovered
      { ...base, objectives: { logsRecovered: "yes" } }, // wrong type
    ];
    for (const payload of bad) {
      localStorage.setItem("article-zero-save", JSON.stringify(payload));
      expect(loadGame()).toBeNull();
    }
  });

  it("accepts a well-formed payload with optional objective fields", () => {
    saveGame({ ...sample, objectives: { logsRecovered: true, vent4Silenced: true } });
    const loaded = loadGame();
    expect(loaded?.objectives.logsRecovered).toBe(true);
    expect(loaded?.objectives.vent4Silenced).toBe(true);
  });
});
