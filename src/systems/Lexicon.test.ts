import { describe, it, expect } from "vitest";
import {
  LEXICON_CATEGORIES,
  LEXICON_ENTRIES,
  lexiconByCategory,
  lexiconEntry,
  visibleLexicon,
  type LexiconContext,
} from "./Lexicon";
import { initialJournal, noteJournal, JOURNAL_ENTRIES } from "./Journal";
import { initialObjectives, noteTerminalHacked } from "./Objectives";
import { CERT_ITEM } from "./EntityStats";

function ctx(over: Partial<LexiconContext> = {}): LexiconContext {
  return {
    journal: initialJournal(),
    inventory: [],
    objectives: initialObjectives(),
    ...over,
  };
}

describe("Lexicon", () => {
  it("has unique ids, a known category and prose throughout", () => {
    const ids = LEXICON_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of LEXICON_ENTRIES) {
      expect(LEXICON_CATEGORIES).toContain(entry.category);
      expect(entry.term.length).toBeGreaterThan(0);
      expect(entry.body.length).toBeGreaterThan(0);
    }
  });

  it("resolves every cross-reference to a real entry", () => {
    for (const entry of LEXICON_ENTRIES) {
      for (const ref of entry.seeAlso ?? []) {
        expect(lexiconEntry(ref), `"${entry.id}" points at missing entry "${ref}"`).toBeDefined();
        expect(ref).not.toBe(entry.id);
      }
    }
  });

  it("gates entries on journal beats the player hasn't reached", () => {
    const before = visibleLexicon(ctx()).map((e) => e.id);
    expect(before).not.toContain("shared-field");

    const journal = initialJournal();
    noteJournal(journal, "we");
    expect(visibleLexicon(ctx({ journal })).map((e) => e.id)).toContain("shared-field");
  });

  it("gates entries on held items", () => {
    expect(visibleLexicon(ctx()).map((e) => e.id)).not.toContain("q0-cert");
    expect(visibleLexicon(ctx({ inventory: [CERT_ITEM] })).map((e) => e.id)).toContain("q0-cert");
  });

  it("gates entries on objective progress", () => {
    expect(visibleLexicon(ctx()).map((e) => e.id)).not.toContain("log-cache");
    const objectives = initialObjectives();
    noteTerminalHacked(objectives, "log_cache");
    expect(visibleLexicon(ctx({ objectives })).map((e) => e.id)).toContain("log-cache");
  });

  it("shows the terms Rowan already knows from the start", () => {
    const ids = visibleLexicon(ctx()).map((e) => e.id);
    expect(ids).toContain("article-zero");
    expect(ids).toContain("rowan");
    expect(ids).toContain("eira-7");
    expect(ids.length).toBeGreaterThan(0);
  });

  it("leaves no entry permanently unreachable", () => {
    // Everything unlocked: the full index must be visible, or some entry has a
    // requirement no run can satisfy.
    const journal = initialJournal();
    for (const e of JOURNAL_ENTRIES) noteJournal(journal, e.id);
    const objectives = initialObjectives();
    noteTerminalHacked(objectives, "log_cache");
    const everything = ctx({ journal, objectives, inventory: [CERT_ITEM] });
    expect(visibleLexicon(everything)).toHaveLength(LEXICON_ENTRIES.length);
  });

  it("groups by category and omits empty groups", () => {
    const groups = lexiconByCategory(ctx());
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.entries.length).toBeGreaterThan(0);
      expect(g.entries.every((e) => e.category === g.category)).toBe(true);
    }
    // Grouping is a partition of the visible set — nothing lost, nothing doubled.
    const grouped = groups.flatMap((g) => g.entries.map((e) => e.id));
    expect(grouped.sort()).toEqual(visibleLexicon(ctx()).map((e) => e.id).sort());
  });
});
