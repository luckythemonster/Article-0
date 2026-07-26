import { describe, it, expect, beforeEach } from "vitest";
import {
  clearSave,
  emptyProgress,
  hasAnySave,
  listSaves,
  loadGame,
  newestSave,
  saveGame,
  SAVE_SLOTS,
  type SavePayload,
} from "./SaveGame";
import { initialObjectives } from "./Objectives";
import { initialJournal, noteJournal } from "./Journal";
import { ExploredMap } from "./Explored";
import { installBlockedStorage, installMemStorage } from "../testing/memStorage";

beforeEach(installMemStorage);

const sample: SavePayload = {
  level: "main1",
  tileX: 3,
  tileY: 7,
  hp: 80,
  inventory: ["Ration Pack"],
  objectives: initialObjectives(),
  ...emptyProgress(),
};

/** A v1 blob exactly as the shipped version wrote it — no journal, no slot key. */
function writeLegacyV1(over: Record<string, unknown> = {}): void {
  localStorage.setItem(
    "article-zero-save",
    JSON.stringify({
      version: 1,
      level: "duct1",
      tileX: 9,
      tileY: 4,
      hp: 55,
      inventory: ["Battery", "Flashlight"],
      objectives: { logsRecovered: true, vent4Silenced: false },
      ...over,
    }),
  );
}

describe("SaveGame", () => {
  it("round-trips a saved checkpoint", () => {
    expect(hasAnySave()).toBe(false);
    saveGame("auto", sample);
    expect(hasAnySave()).toBe(true);
    const loaded = loadGame("auto");
    expect(loaded?.level).toBe("main1");
    expect(loaded?.hp).toBe(80);
    expect(loaded?.inventory).toEqual(["Ration Pack"]);
    expect(loaded?.objectives.logsRecovered).toBe(false);
  });

  it("round-trips the journal, the explored map and the run clock", () => {
    const journal = initialJournal();
    noteJournal(journal, "the-cache");
    const mask = new ExploredMap(16, 16);
    mask.mark(2, 3);

    saveGame("2", { ...sample, journal, explored: { main1: mask.toBase64() }, playTimeMs: 91_000 });

    const loaded = loadGame("2")!;
    expect(loaded.journal.unlocked).toEqual(["the-cache"]);
    expect(loaded.playTimeMs).toBe(91_000);
    expect(ExploredMap.fromBase64(loaded.explored.main1, 16, 16).has(2, 3)).toBe(true);
  });

  it("keeps slots independent, so a checkpoint can't clobber a manual save", () => {
    saveGame("1", { ...sample, level: "main1", hp: 100 });
    saveGame("auto", { ...sample, level: "duct2", hp: 10 });

    expect(loadGame("1")?.level).toBe("main1");
    expect(loadGame("1")?.hp).toBe(100);
    expect(loadGame("auto")?.level).toBe("duct2");
    expect(loadGame("2")).toBeNull();
    expect(loadGame("3")).toBeNull();
  });

  it("lists every slot in display order, empty ones included", () => {
    saveGame("2", sample);
    const listed = listSaves();
    expect(listed.map((s) => s.slot)).toEqual([...SAVE_SLOTS]);
    expect(listed.filter((s) => s.data !== null).map((s) => s.slot)).toEqual(["2"]);
  });

  it("picks the newest save by timestamp, not by slot order", () => {
    saveGame("3", sample);
    // Backdate slot 3 so "auto", written second, is unambiguously newer.
    const older = JSON.parse(localStorage.getItem("article-zero-save-3")!);
    older.savedAt = 1000;
    localStorage.setItem("article-zero-save-3", JSON.stringify(older));
    saveGame("auto", sample);

    expect(newestSave()?.slot).toBe("auto");

    // And the other way round.
    const newer = JSON.parse(localStorage.getItem("article-zero-save-3")!);
    newer.savedAt = Date.now() + 60_000;
    localStorage.setItem("article-zero-save-3", JSON.stringify(newer));
    expect(newestSave()?.slot).toBe("3");
  });

  it("clears one slot without touching the others, or all of them at once", () => {
    saveGame("auto", sample);
    saveGame("1", sample);

    clearSave("auto");
    expect(loadGame("auto")).toBeNull();
    expect(loadGame("1")).not.toBeNull();

    clearSave();
    expect(hasAnySave()).toBe(false);
  });

  // --- v1 migration ------------------------------------------------------

  it("adopts a legacy v1 save as the auto slot instead of discarding it", () => {
    writeLegacyV1();
    const loaded = loadGame("auto");
    expect(loaded).not.toBeNull();
    expect(loaded!.level).toBe("duct1");
    expect(loaded!.hp).toBe(55);
    expect(loaded!.inventory).toEqual(["Battery", "Flashlight"]);
    expect(loaded!.objectives.logsRecovered).toBe(true);
    expect(hasAnySave()).toBe(true);
  });

  it("gives a migrated v1 save empty journal/map/clock rather than junk", () => {
    writeLegacyV1();
    const loaded = loadGame("auto")!;
    expect(loaded.version).toBe(2);
    expect(loaded.journal).toEqual(initialJournal());
    expect(loaded.explored).toEqual({});
    expect(loaded.playTimeMs).toBe(0);
    // Dated to the epoch, so it can never outrank a genuinely newer slot.
    expect(loaded.savedAt).toBe(0);
    saveGame("1", sample);
    expect(newestSave()?.slot).toBe("1");
  });

  it("prefers a real auto slot over the legacy key once one exists", () => {
    writeLegacyV1();
    saveGame("auto", { ...sample, level: "main2" });
    expect(loadGame("auto")?.level).toBe("main2");
  });

  it("still range-checks a v1 blob rather than trusting it through migration", () => {
    writeLegacyV1({ hp: -5 });
    expect(loadGame("auto")).toBeNull();
    writeLegacyV1({ tileX: 2.5 });
    expect(loadGame("auto")).toBeNull();
  });

  it("clears the legacy key too, so a wiped save can't resurrect", () => {
    writeLegacyV1();
    clearSave();
    expect(loadGame("auto")).toBeNull();
    expect(hasAnySave()).toBe(false);
  });

  // --- rejection ---------------------------------------------------------

  it("rejects a malformed or versionless payload", () => {
    localStorage.setItem("article-zero-save-auto", JSON.stringify({ level: "main1" }));
    expect(loadGame("auto")).toBeNull();
    localStorage.setItem("article-zero-save-auto", "{not json");
    expect(loadGame("auto")).toBeNull();
  });

  it("rejects a version from the future", () => {
    localStorage.setItem("article-zero-save-auto", JSON.stringify({ version: 99, ...sample }));
    expect(loadGame("auto")).toBeNull();
  });

  it("rejects out-of-range or corrupted field values", () => {
    const base = { version: 2, savedAt: Date.now(), ...sample };
    const bad: Array<Record<string, unknown>> = [
      { ...base, hp: Number.NaN }, // non-finite HP
      { ...base, hp: -5 }, // negative HP
      { ...base, tileX: -1 }, // off-grid tile
      { ...base, tileY: 2.5 }, // fractional tile
      { ...base, level: "" }, // empty level id
      { ...base, inventory: ["ok", 7] }, // non-string inventory entry
      { ...base, objectives: {} }, // missing logsRecovered
      { ...base, objectives: { logsRecovered: "yes" } }, // wrong type
      { ...base, journal: { unlocked: "orders" } }, // journal not a list
      { ...base, journal: null }, // journal missing
      { ...base, explored: [] }, // explored not a record
      { ...base, explored: { main1: 42 } }, // non-string mask
      { ...base, playTimeMs: -1 }, // negative clock
      { ...base, playTimeMs: Number.NaN }, // non-finite clock
    ];
    for (const payload of bad) {
      localStorage.setItem("article-zero-save-auto", JSON.stringify(payload));
      expect(loadGame("auto"), JSON.stringify(payload).slice(0, 80)).toBeNull();
    }
  });

  it("drops journal entries a newer build authored and this one doesn't have", () => {
    saveGame("auto", sample);
    const blob = JSON.parse(localStorage.getItem("article-zero-save-auto")!);
    blob.journal.unlocked = ["orders", "an-entry-from-the-future"];
    localStorage.setItem("article-zero-save-auto", JSON.stringify(blob));
    // Loads, minus the unknown entry — a forward-compatible save is not a corrupt one.
    expect(loadGame("auto")?.journal.unlocked).toEqual(["orders"]);
  });

  it("accepts a well-formed payload with optional objective fields", () => {
    saveGame("auto", { ...sample, objectives: { logsRecovered: true, vent4Silenced: true } });
    const loaded = loadGame("auto");
    expect(loaded?.objectives.logsRecovered).toBe(true);
    expect(loaded?.objectives.vent4Silenced).toBe(true);
  });

  it("survives storage being unavailable", () => {
    installBlockedStorage();
    expect(() => saveGame("auto", sample)).not.toThrow();
    expect(() => clearSave()).not.toThrow();
    expect(loadGame("auto")).toBeNull();
    expect(hasAnySave()).toBe(false);
  });
});
