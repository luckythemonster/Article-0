import { describe, it, expect } from "vitest";
import { mergeWallRects, wallBodyRects, wallCells, type WallRect } from "./TileBake";
import type { GameLevel, GameTile, SpriteFrame } from "./types";

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

describe("wallCells", () => {
  const frame = {} as SpriteFrame;

  /** An 8×8 level whose `walls` board holds the given tiles. */
  function level(tiles: (Partial<GameTile> & { x: number; y: number })[], name = "walls"): GameLevel {
    return {
      name: "t",
      width: 8,
      height: 8,
      layers: [
        {
          name,
          tiles: tiles.map((t) => ({
            frame,
            colSpan: 1,
            rowSpan: 1,
            offsetX: 0,
            offsetY: 0,
            components: [],
            ...t,
          })),
        },
      ],
    } as unknown as GameLevel;
  }

  /** Solid cells as sorted "x,y" strings. */
  function solidCells(l: GameLevel): string[] {
    const mask = wallCells(l, 32);
    const out: string[] = [];
    for (let y = 0; y < l.height; y++) {
      for (let x = 0; x < l.width; x++) if (mask[y * l.width + x] === 1) out.push(`${x},${y}`);
    }
    return out.sort();
  }

  it("marks the placed cell of a plain wall tile", () => {
    expect(solidCells(level([{ x: 3, y: 4 }]))).toEqual(["3,4"]);
  });

  it("marks both cells of a 1×2.5 pane", () => {
    // The `main2` glass jambs: the lower cell used to have no body under it, so
    // the player walked through half the pane.
    expect(solidCells(level([{ x: 3, y: 2, rowSpan: 2.5, offsetY: 16 }]))).toEqual(["3,2", "3,3"]);
  });

  it("merges a pane into a single tall rectangle", () => {
    const l = level([{ x: 3, y: 2, rowSpan: 2.5, offsetY: 16 }]);
    const mask = wallCells(l, 32);
    const rects = mergeWallRects(l.width, l.height, (x, y) => mask[y * l.width + x] === 1);
    expect(rects).toEqual([{ x: 3, y: 2, w: 1, h: 2 }]);
  });

  it("skips frameless tiles and boards that aren't walls", () => {
    expect(solidCells(level([{ x: 3, y: 4, frame: undefined }]))).toEqual([]);
    expect(solidCells(level([{ x: 3, y: 4 }], "cover"))).toEqual([]);
  });

  it("clips a footprint that runs off the level", () => {
    expect(solidCells(level([{ x: 0, y: 0, rowSpan: 2.5, offsetY: -16 }]))).toEqual(["0,0"]);
  });

  it("still marks a tile solid on a non-wall board when collisionMode forces it", () => {
    // "cover" isn't blocking on this fixture (no board declares `collision`, so
    // blockingLayerNames falls back to `["walls"]` alone) — the tile's own
    // override is what puts it in the mask.
    expect(
      solidCells(level([{ x: 3, y: 4, collisionMode: 1 } as Partial<GameTile> & { x: number; y: number }], "cover")),
    ).toEqual(["3,4"]);
  });
});

describe("wallBodyRects — per-tile override", () => {
  const frame = {} as SpriteFrame;

  /** An 8×8 level with one padded tile on the given board. */
  function level(board: string): GameLevel {
    return {
      name: "t",
      width: 8,
      height: 8,
      layers: [
        {
          name: board,
          tiles: [
            {
              x: 3,
              y: 4,
              frame,
              colSpan: 1,
              rowSpan: 1,
              offsetX: 0,
              offsetY: 0,
              components: [],
              collider: { Bottom: 0.4 },
              collisionMode: 1,
            } as unknown as GameTile,
          ],
        },
      ],
    } as unknown as GameLevel;
  }

  it("gives a forced-solid tile its own precise rect, even off the blocking boards", () => {
    // "cover" isn't in blockingLayerNames on this fixture — collisionMode alone
    // puts this padded tile's rect into the result.
    const rects = wallBodyRects(level("cover"), 32);
    expect(rects).toEqual([{ x: 96, y: 128, w: 32, h: 32 - 0.4 * 32 }]);
  });

  it("gives the same rect when the board would have blocked it anyway", () => {
    const rects = wallBodyRects(level("walls"), 32);
    expect(rects).toEqual([{ x: 96, y: 128, w: 32, h: 32 - 0.4 * 32 }]);
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
