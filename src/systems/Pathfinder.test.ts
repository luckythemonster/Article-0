import { describe, it, expect } from "vitest";
import { CollisionGrid } from "./CollisionGrid";
import { clearCorridor, findPath, smoothPath, tilePassable } from "./Pathfinder";
import type { PathNode } from "./Pathfinder";
import type { GameLevel } from "../map/types";

/**
 * Builds a grid from an ASCII sketch — `#` is wall, anything else is floor.
 * Rows must be equal length; the grid is square-padded to the larger dimension
 * so `CollisionGrid`'s row indexing stays honest.
 */
function gridFrom(rows: string[]): CollisionGrid {
  const width = rows[0].length;
  const height = rows.length;
  const tiles: { x: number; y: number }[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === "#") tiles.push({ x, y });
    });
  });
  return new CollisionGrid({
    name: "t",
    width,
    height,
    layers: [{ name: "walls", tiles }],
  } as unknown as GameLevel);
}

/** A 9×9 room, walled around the edge. */
const OPEN_ROOM = [
  "#########",
  "#.......#",
  "#.......#",
  "#.......#",
  "#.......#",
  "#.......#",
  "#.......#",
  "#.......#",
  "#########",
];

const R = 0.37; // an enforcer's real collision radius

function ends(path: PathNode[] | null): string {
  if (!path) return "null";
  const a = path[0];
  const b = path[path.length - 1];
  return `${a.x},${a.y} -> ${b.x},${b.y}`;
}

describe("tilePassable", () => {
  it("rejects walls and out-of-bounds tiles", () => {
    const g = gridFrom(OPEN_ROOM);
    expect(tilePassable(g, 4, 4, R)).toBe(true);
    expect(tilePassable(g, 0, 0, R)).toBe(false);
    expect(tilePassable(g, -1, 4, R)).toBe(false);
    expect(tilePassable(g, 99, 4, R)).toBe(false);
  });

  it("rejects a floor tile a wide body cannot stand on", () => {
    // A one-tile slot: open at (2,2), walled either side.
    const g = gridFrom(["#####", "#####", "##.##", "#####", "#####"]);
    expect(tilePassable(g, 2, 2, 0.4)).toBe(true);
    expect(tilePassable(g, 2, 2, 0.6)).toBe(false);
  });
});

describe("findPath", () => {
  it("returns a single node when start and goal share a tile", () => {
    const g = gridFrom(OPEN_ROOM);
    expect(findPath(g, { x: 3, y: 3 }, { x: 3, y: 3 }, { radiusTiles: R })).toEqual([
      { x: 3, y: 3 },
    ]);
  });

  it("walks a straight open run at one step per tile", () => {
    const g = gridFrom(OPEN_ROOM);
    const path = findPath(g, { x: 1, y: 4 }, { x: 7, y: 4 }, { radiusTiles: R })!;
    expect(ends(path)).toBe("1,4 -> 7,4");
    expect(path).toHaveLength(7);
  });

  it("takes the diagonal across an open room", () => {
    const g = gridFrom(OPEN_ROOM);
    const path = findPath(g, { x: 1, y: 1 }, { x: 7, y: 7 }, { radiusTiles: R })!;
    // Pure diagonal: 6 steps plus the start.
    expect(path).toHaveLength(7);
    expect(ends(path)).toBe("1,1 -> 7,7");
  });

  it("routes around an L-shaped wall rather than through it", () => {
    const g = gridFrom([
      "#########",
      "#.......#",
      "#.#####.#",
      "#.#...#.#",
      "#.#.#.#.#",
      "#...#...#",
      "#####.###",
      "#.......#",
      "#########",
    ]);
    const path = findPath(g, { x: 4, y: 3 }, { x: 1, y: 7 }, { radiusTiles: R })!;
    expect(path).not.toBeNull();
    expect(ends(path)).toBe("4,3 -> 1,7");
    // Every step must land on open floor.
    for (const p of path) expect(tilePassable(g, p.x, p.y, R)).toBe(true);
    // And every step must be a single grid move.
    for (let i = 1; i < path.length; i++) {
      expect(Math.abs(path[i].x - path[i - 1].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(path[i].y - path[i - 1].y)).toBeLessThanOrEqual(1);
    }
  });

  it("refuses to cut the corner between two diagonal walls", () => {
    // The only diagonal link from (1,1) to (2,2) is the zero-width seam between
    // the walls at (2,1) and (1,2). The path has to go the long way round.
    const g = gridFrom([
      "#####",
      "#..##",
      "#.#.#",
      "#...#",
      "#####",
    ]);
    const path = findPath(g, { x: 1, y: 1 }, { x: 3, y: 2 }, { radiusTiles: R })!;
    expect(path).not.toBeNull();
    // A corner-cutting search would find this in 2 steps; going around is 3.
    expect(path.length).toBeGreaterThan(3);
  });

  it("returns null for an unreachable goal", () => {
    const g = gridFrom([
      "#######",
      "#..#..#",
      "#..#..#",
      "#..#..#",
      "#######",
    ]);
    expect(findPath(g, { x: 1, y: 1 }, { x: 5, y: 1 }, { radiusTiles: R })).toBeNull();
  });

  it("returns null when the goal tile itself is solid", () => {
    const g = gridFrom(OPEN_ROOM);
    expect(findPath(g, { x: 4, y: 4 }, { x: 0, y: 0 }, { radiusTiles: R })).toBeNull();
  });

  it("gives up rather than flood-filling when the node budget runs out", () => {
    const g = gridFrom([
      "#######",
      "#..#..#",
      "#..#..#",
      "#..#..#",
      "#######",
    ]);
    expect(findPath(g, { x: 1, y: 1 }, { x: 5, y: 1 }, { radiusTiles: R, maxNodes: 2 })).toBeNull();
  });

  it("still paths out when the body starts somewhere it could not enter", () => {
    // A door closing can pin a guard in a tile too tight for it; refusing to
    // path from there would strand it permanently.
    const g = gridFrom(["#####", "#.#.#", "#...#", "#####"]);
    const path = findPath(g, { x: 1, y: 1 }, { x: 3, y: 1 }, { radiusTiles: 0.45 });
    expect(path).not.toBeNull();
    expect(ends(path)).toBe("1,1 -> 3,1");
  });

  it("only uses a one-tile gap when the body fits through it", () => {
    // A wall across the room with a single one-tile hole at x=4.
    const g = gridFrom([
      "#########",
      "#.......#",
      "#.......#",
      "####.####",
      "#.......#",
      "#.......#",
      "#########",
    ]);
    expect(findPath(g, { x: 2, y: 1 }, { x: 6, y: 5 }, { radiusTiles: 0.37 })).not.toBeNull();
    expect(findPath(g, { x: 2, y: 1 }, { x: 6, y: 5 }, { radiusTiles: 0.6 })).toBeNull();
  });

  describe("openable cells (guard doors)", () => {
    /** Two rooms joined only by a shut door at (3,1). */
    const SPLIT = ["#######", "#..#..#", "#..#..#", "#######"];
    const doorAt = (x: number, y: number): boolean => x === 3 && y === 1;

    it("routes through a door the mover may open", () => {
      const g = gridFrom(SPLIT);
      expect(findPath(g, { x: 1, y: 1 }, { x: 5, y: 1 }, { radiusTiles: R })).toBeNull();
      const path = findPath(g, { x: 1, y: 1 }, { x: 5, y: 1 }, {
        radiusTiles: R,
        openable: doorAt,
      })!;
      expect(path).not.toBeNull();
      expect(path.some((p) => p.x === 3 && p.y === 1)).toBe(true);
    });

    it("still refuses a wall that is not an openable door", () => {
      const g = gridFrom(SPLIT);
      const notADoor = (x: number, y: number): boolean => x === 3 && y === 2;
      expect(
        findPath(g, { x: 1, y: 1 }, { x: 5, y: 1 }, { radiusTiles: R, openable: notADoor }),
      ).not.toBeNull();
      // (3,2) is the only opening now, so the route must use it rather than (3,1).
      const path = findPath(g, { x: 1, y: 1 }, { x: 5, y: 1 }, {
        radiusTiles: R,
        openable: notADoor,
      })!;
      expect(path.some((p) => p.x === 3 && p.y === 1)).toBe(false);
    });

    it("walks round rather than working a door when the detour is cheap", () => {
      // A shut door at (3,1) and an open row at y=2 both join the two halves.
      // Going round costs ~4.8 against the door route's 4 plus its toll, so the
      // guard should leave the door alone.
      const g = gridFrom(["#######", "#..#..#", "#.....#", "#######"]);
      const path = findPath(g, { x: 1, y: 1 }, { x: 5, y: 1 }, {
        radiusTiles: R,
        openable: doorAt,
      })!;
      expect(path.some((p) => p.x === 3 && p.y === 1)).toBe(false);
      expect(path.some((p) => p.y === 2)).toBe(true);
    });

    it("does work the door when going round is the long way", () => {
      // Same two halves, but the detour is now a long trek south. The toll is a
      // preference, not a prohibition.
      const g = gridFrom([
        "#######",
        "#..#..#",
        "#..#..#",
        "#..#..#",
        "#..#..#",
        "#.....#",
        "#######",
      ]);
      const path = findPath(g, { x: 1, y: 1 }, { x: 5, y: 1 }, {
        radiusTiles: R,
        openable: doorAt,
      })!;
      expect(path.some((p) => p.x === 3 && p.y === 1)).toBe(true);
    });

    it("smooths across an openable door without dropping it from the route", () => {
      const g = gridFrom(SPLIT);
      const path = findPath(g, { x: 1, y: 1 }, { x: 5, y: 1 }, {
        radiusTiles: R,
        openable: doorAt,
      })!;
      const smoothed = smoothPath(g, path, R, doorAt);
      expect(smoothed[0]).toEqual({ x: 1, y: 1 });
      expect(smoothed[smoothed.length - 1]).toEqual({ x: 5, y: 1 });
    });
  });

  it("reopens a route when a door unblocks at runtime", () => {
    const g = gridFrom([
      "#######",
      "#..#..#",
      "#..#..#",
      "#######",
    ]);
    expect(findPath(g, { x: 1, y: 1 }, { x: 5, y: 1 }, { radiusTiles: R })).toBeNull();
    g.setBlocked(3, 1, false);
    expect(findPath(g, { x: 1, y: 1 }, { x: 5, y: 1 }, { radiusTiles: R })).not.toBeNull();
  });
});

describe("smoothPath", () => {
  it("collapses a straight run to its endpoints", () => {
    const g = gridFrom(OPEN_ROOM);
    const path = findPath(g, { x: 1, y: 4 }, { x: 7, y: 4 }, { radiusTiles: R })!;
    const smoothed = smoothPath(g, path, R);
    expect(smoothed).toEqual([
      { x: 1, y: 4 },
      { x: 7, y: 4 },
    ]);
  });

  it("leaves short paths untouched", () => {
    const g = gridFrom(OPEN_ROOM);
    expect(smoothPath(g, [{ x: 1, y: 1 }], R)).toEqual([{ x: 1, y: 1 }]);
    expect(smoothPath(g, [{ x: 1, y: 1 }, { x: 2, y: 1 }], R)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it("shortens a corner without letting the body clip it", () => {
    const g = gridFrom([
      "#########",
      "#.......#",
      "#.......#",
      "#.......#",
      "#####...#",
      "#####...#",
      "#########",
    ]);
    const path = findPath(g, { x: 1, y: 1 }, { x: 6, y: 5 }, { radiusTiles: R })!;
    const smoothed = smoothPath(g, path, R);
    expect(smoothed.length).toBeLessThan(path.length);
    expect(smoothed[0]).toEqual(path[0]);
    expect(smoothed[smoothed.length - 1]).toEqual(path[path.length - 1]);
    // Every retained leg has to be walkable by a body of this width.
    for (let i = 1; i < smoothed.length; i++) {
      expect(clearCorridor(g, smoothed[i - 1], smoothed[i], R)).toBe(true);
    }
  });

  it("keeps the corner a zero-width ray would cut through", () => {
    // Sight passes diagonally between (2,1) and (1,2); a body of real width
    // does not, so smoothing must not join (1,1) straight to (2,2).
    const g = gridFrom(["#####", "#..##", "#.#.#", "#...#", "#####"]);
    expect(g.hasLineOfSight(1.5, 1.5, 3.5, 2.5)).toBe(true);
    expect(clearCorridor(g, { x: 1, y: 1 }, { x: 3, y: 2 }, R)).toBe(false);
  });
});
