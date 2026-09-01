import { describe, it, expect } from "vitest";
import {
  MEMOS,
  collectedMemos,
  hasMemo,
  initialMemos,
  isMemoState,
  nextMemoFor,
  noteMemo,
  sanitizeMemos,
} from "./Memos";

describe("MEMOS", () => {
  it("has unique ids and fills every field", () => {
    const ids = MEMOS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MEMOS) {
      expect(m.title.length, m.id).toBeGreaterThan(0);
      expect(m.from.length, m.id).toBeGreaterThan(0);
      expect(m.body.length, m.id).toBeGreaterThan(80);
    }
  });

  it("keeps some paper in general circulation", () => {
    // The unlevelled pool is what stops a map that puts its terminals somewhere
    // else leaving half the archive permanently unfillable.
    expect(MEMOS.some((m) => m.level === undefined)).toBe(true);
    expect(MEMOS.some((m) => m.level !== undefined)).toBe(true);
  });
});

describe("nextMemoFor", () => {
  it("deals a deck's own paper first, in authored order", () => {
    const state = initialMemos();
    const first = nextMemoFor("main1", state)!;
    expect(first.level).toBe("main1");
    noteMemo(state, first.id);
    const second = nextMemoFor("main1", state)!;
    expect(second.level).toBe("main1");
    expect(second.id).not.toBe(first.id);
  });

  it("falls through to general circulation once a deck is exhausted", () => {
    const state = initialMemos();
    for (const m of MEMOS) if (m.level === "main1") noteMemo(state, m.id);
    const next = nextMemoFor("main1", state)!;
    expect(next.level).toBeUndefined();
  });

  it("gives a deck it has never heard of the general pool", () => {
    // A map with its own level names still surfaces memos rather than none.
    const next = nextMemoFor("basement", initialMemos())!;
    expect(next.level).toBeUndefined();
  });

  it("runs out rather than repeating", () => {
    const state = initialMemos();
    for (const m of MEMOS) noteMemo(state, m.id);
    expect(nextMemoFor("main1", state)).toBeUndefined();
  });
});

describe("noteMemo", () => {
  it("reports only the call that took it", () => {
    const state = initialMemos();
    expect(noteMemo(state, MEMOS[0].id)).toBe(true);
    // The sting fires once; a second breach on the same paper is not a find.
    expect(noteMemo(state, MEMOS[0].id)).toBe(false);
    expect(hasMemo(state, MEMOS[0].id)).toBe(true);
  });

  it("refuses an id this build does not know", () => {
    const state = initialMemos();
    expect(noteMemo(state, "not-a-memo")).toBe(false);
    expect(state.collected).toEqual([]);
  });
});

describe("collectedMemos", () => {
  it("reads back in the authored order, not the order found", () => {
    const state = initialMemos();
    const [a, b] = [MEMOS[3], MEMOS[1]];
    noteMemo(state, a.id);
    noteMemo(state, b.id);
    expect(collectedMemos(state).map((m) => m.id)).toEqual([b.id, a.id]);
  });
});

describe("isMemoState / sanitizeMemos", () => {
  it("accepts a real state and rejects the shapes a bad blob takes", () => {
    expect(isMemoState({ collected: [] })).toBe(true);
    expect(isMemoState({ collected: ["ticket-1471"] })).toBe(true);
    expect(isMemoState(null)).toBe(false);
    expect(isMemoState([])).toBe(false);
    expect(isMemoState({})).toBe(false);
    expect(isMemoState({ collected: [1] })).toBe(false);
    expect(isMemoState({ collected: ["../../etc/passwd"] })).toBe(false);
    expect(isMemoState({ collected: Array.from({ length: 200 }, () => "a") })).toBe(false);
  });

  it("drops ids this build lacks, and duplicates, on the way in", () => {
    // A save from a newer build that authored more memos still loads.
    const cleaned = sanitizeMemos({
      collected: ["ticket-1471", "from-the-future", "ticket-1471"],
    });
    expect(cleaned.collected).toEqual(["ticket-1471"]);
  });
});
