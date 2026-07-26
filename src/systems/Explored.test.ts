import { describe, it, expect } from "vitest";
import { ExploredMap, initialExplored, isExploredState } from "./Explored";

describe("ExploredMap", () => {
  it("starts blank and records what it is told", () => {
    const m = new ExploredMap(16, 8);
    expect(m.has(3, 4)).toBe(false);
    expect(m.count()).toBe(0);
    m.mark(3, 4);
    expect(m.has(3, 4)).toBe(true);
    expect(m.has(4, 3)).toBe(false); // not symmetric — catches a transposed index
    expect(m.count()).toBe(1);
  });

  it("is idempotent, so re-walking a corridor doesn't inflate the count", () => {
    const m = new ExploredMap(8, 8);
    m.mark(1, 1);
    m.mark(1, 1);
    expect(m.count()).toBe(1);
  });

  it("ignores out-of-bounds and fractional coordinates rather than clamping", () => {
    const m = new ExploredMap(8, 8);
    m.mark(-1, 0);
    m.mark(0, -1);
    m.mark(8, 0);
    m.mark(0, 8);
    m.mark(1.5, 2);
    expect(m.count()).toBe(0);
    // A clamp would have smeared these onto the edge tiles.
    expect(m.has(0, 0)).toBe(false);
    expect(m.has(7, 0)).toBe(false);
  });

  it("round-trips through base64", () => {
    const m = new ExploredMap(20, 12);
    const marks: [number, number][] = [
      [0, 0],
      [19, 11],
      [7, 3],
      [12, 9],
    ];
    for (const [x, y] of marks) m.mark(x, y);

    const back = ExploredMap.fromBase64(m.toBase64(), 20, 12);
    for (const [x, y] of marks) expect(back.has(x, y)).toBe(true);
    expect(back.count()).toBe(marks.length);
    expect(back.has(1, 1)).toBe(false);
  });

  it("handles a mask wider than one byte row", () => {
    // 3×1 sits inside a single byte; 9×1 spans two. Bit packing is where an
    // off-by-one hides, so check the boundary explicitly.
    const m = new ExploredMap(9, 1);
    m.mark(8, 0);
    expect(m.has(8, 0)).toBe(true);
    expect(m.has(0, 0)).toBe(false);
    expect(ExploredMap.fromBase64(m.toBase64(), 9, 1).has(8, 0)).toBe(true);
  });

  it("degrades to a blank map on junk or a resized level", () => {
    expect(ExploredMap.fromBase64("!!!not base64!!!", 8, 8).count()).toBe(0);
    expect(ExploredMap.fromBase64("", 8, 8).count()).toBe(0);

    // Same data, level re-authored larger: wrong byte length, so start clean
    // rather than reading the old mask at the new stride.
    const small = new ExploredMap(8, 8);
    small.mark(1, 1);
    expect(ExploredMap.fromBase64(small.toBase64(), 32, 32).count()).toBe(0);
  });
});

describe("ExploredState", () => {
  it("accepts a well-formed per-level record and rejects junk", () => {
    expect(isExploredState(initialExplored())).toBe(true);
    expect(isExploredState({ main1: "AAAA", duct1: "" })).toBe(true);
    expect(isExploredState(null)).toBe(false);
    expect(isExploredState([])).toBe(false);
    expect(isExploredState({ main1: 42 })).toBe(false);
  });
});
