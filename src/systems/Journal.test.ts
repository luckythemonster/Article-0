import { describe, it, expect } from "vitest";
import {
  initialJournal,
  isJournalState,
  isUnlocked,
  journalIdForLevel,
  JOURNAL_ENTRIES,
  noteJournal,
  sanitizeJournal,
  unlockedEntries,
  type JournalState,
} from "./Journal";

describe("Journal", () => {
  it("starts empty", () => {
    expect(unlockedEntries(initialJournal())).toEqual([]);
  });

  it("reports only the first unlock of an entry, so the sting fires once", () => {
    const s = initialJournal();
    expect(noteJournal(s, "the-cache")).toBe(true);
    expect(noteJournal(s, "the-cache")).toBe(false);
    expect(s.unlocked).toEqual(["the-cache"]);
    expect(isUnlocked(s, "the-cache")).toBe(true);
    expect(isUnlocked(s, "we")).toBe(false);
  });

  it("reads back in authored order, not unlock order", () => {
    const s = initialJournal();
    // Unlocked backwards: the uplink before the call that started the night.
    noteJournal(s, "the-uplink");
    noteJournal(s, "orders");
    expect(unlockedEntries(s).map((e) => e.id)).toEqual(["orders", "the-uplink"]);
  });

  it("maps the shipped level names to arrival entries and ignores others", () => {
    expect(journalIdForLevel("main1")).toBe("arrival-main1");
    expect(journalIdForLevel("duct2")).toBe("arrival-duct2");
    // A map that doesn't use our level names gets no arrival entry, not a wrong one.
    expect(journalIdForLevel("rooftop")).toBeUndefined();
  });

  it("every arrival entry a level maps to actually exists", () => {
    const ids = new Set(JOURNAL_ENTRIES.map((e) => e.id));
    for (const level of ["main1", "duct1", "duct2", "main2"]) {
      expect(ids.has(journalIdForLevel(level)!)).toBe(true);
    }
  });

  it("has unique ids and non-empty prose throughout", () => {
    const ids = JOURNAL_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of JOURNAL_ENTRIES) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.body.length).toBeGreaterThan(0);
    }
  });

  it("accepts a well-formed persisted journal and rejects junk", () => {
    expect(isJournalState({ unlocked: [] })).toBe(true);
    expect(isJournalState({ unlocked: ["orders"] })).toBe(true);
    expect(isJournalState(null)).toBe(false);
    expect(isJournalState({})).toBe(false);
    expect(isJournalState({ unlocked: "orders" })).toBe(false);
    expect(isJournalState({ unlocked: [1, 2] })).toBe(false);
  });

  it("drops unknown ids and duplicates rather than wedging the run", () => {
    // A save from a newer build that authored entries this one doesn't have.
    const stale = { unlocked: ["orders", "not-an-entry", "orders"] } as unknown as JournalState;
    expect(sanitizeJournal(stale).unlocked).toEqual(["orders"]);
    // And an unknown id can never surface as an entry to render.
    expect(unlockedEntries(sanitizeJournal(stale)).map((e) => e.id)).toEqual(["orders"]);
  });
});
