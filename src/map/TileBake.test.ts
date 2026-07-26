import { describe, it, expect } from "vitest";
import { mergeWallRects, type WallRect } from "./TileBake";

/** Builds a blocked-cell predicate from an ASCII map ('#' = blocked). */
function gridOf(rows: string[]): { width: number; height: number; blocked: (x: number, y: number) => boolean } {
  const height = rows.length;
  const width = rows[0].length;
  return {
    width,
    height,
    blocked: (x, y) => x >= 0 && y >= 0 && x < width && y < height && rows[y][x] === "#",
  };
}

/** Every cell covered by `rects`, as a sorted "x,y" list — and a double-cover check. */
function covered(rects: WallRect[]): string[] {
  const seen = new Set<string>();
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const k = `${x},${y}`;
        expect(seen.has(k), `cell ${k} covered twice`).toBe(false);
        seen.add(k);
      }
    }
  }
  return [...seen].sort();
}

/** Every blocked cell in the source grid, as a sorted "x,y" list. */
function blockedCells(g: ReturnType<typeof gridOf>): string[] {
  const out: string[] = [];
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) if (g.blocked(x, y)) out.push(`${x},${y}`);
  }
  return out.sort();
}

/** The invariant that makes this safe to ship: same cells, covered once each. */
function expectExactCover(rows: string[]): WallRect[] {
  const g = gridOf(rows);
  const rects = mergeWallRects(g.width, g.height, g.blocked);
  expect(covered(rects)).toEqual(blockedCells(g));
  for (const r of rects) {
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  }
  return rects;
}

describe("mergeWallRects — correctness", () => {
  it("returns nothing for an empty grid", () => {
    expect(expectExactCover(["....", "....", "...."])).toEqual([]);
  });

  it("covers a fully blocked grid with a single rectangle", () => {
    const rects = expectExactCover(["####", "####", "####"]);
    expect(rects).toEqual([{ x: 0, y: 0, w: 4, h: 3 }]);
  });

  it("merges a horizontal run into one rectangle", () => {
    const rects = expectExactCover([".....", ".###.", "....."]);
    expect(rects).toEqual([{ x: 1, y: 1, w: 3, h: 1 }]);
  });

  it("merges a vertical run into one rectangle", () => {
    const rects = expectExactCover([".#.", ".#.", ".#."]);
    expect(rects).toEqual([{ x: 1, y: 0, w: 1, h: 3 }]);
  });

  it("keeps isolated cells apart", () => {
    const rects = expectExactCover(["#.#", "...", "#.#"]);
    expect(rects).toHaveLength(4);
  });

  it("covers an L exactly, without overlap", () => {
    expectExactCover(["#....", "#....", "####.", "....."]);
  });

  it("covers a room perimeter exactly", () => {
    expectExactCover([
      "#####",
      "#...#",
      "#...#",
      "#...#",
      "#####",
    ]);
  });

  it("covers a ragged shape with holes exactly", () => {
    expectExactCover([
      "##..##..#",
      "#..##..##",
      "..#..##..",
      "###..#..#",
      "#..###.##",
    ]);
  });

  it("covers a single row and a single column grid", () => {
    expectExactCover(["#.##.#"]);
    expectExactCover(["#", ".", "#", "#"]);
  });

  it("covers a pseudo-random grid exactly, at several densities", () => {
    let seed = 12345;
    const rand = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (const density of [0.1, 0.35, 0.6, 0.9]) {
      const rows: string[] = [];
      for (let y = 0; y < 24; y++) {
        let row = "";
        for (let x = 0; x < 31; x++) row += rand() < density ? "#" : ".";
        rows.push(row);
      }
      expectExactCover(rows);
    }
  });
});

describe("mergeWallRects — reduction", () => {
  it("collapses a duct-like corridor grid by an order of magnitude", () => {
    // A 40x40 field of one-tile corridors on a 4-tile pitch — the shape duct1
    // is built from, and the level this optimisation exists for.
    const rows: string[] = [];
    for (let y = 0; y < 40; y++) {
      let row = "";
      for (let x = 0; x < 40; x++) row += x % 4 === 0 || y % 4 === 0 ? "." : "#";
      rows.push(row);
    }
    const g = gridOf(rows);
    const cells = blockedCells(g).length;
    const rects = expectExactCover(rows);
    expect(cells).toBeGreaterThan(800);
    expect(rects.length).toBeLessThan(cells / 8);
  });

  it("collapses solid rooms to a handful of rectangles", () => {
    const rows: string[] = [];
    for (let y = 0; y < 30; y++) {
      let row = "";
      for (let x = 0; x < 30; x++) row += y < 10 || y > 20 ? "#" : ".";
      rows.push(row);
    }
    const rects = expectExactCover(rows);
    expect(rects.length).toBeLessThanOrEqual(2);
  });
});
