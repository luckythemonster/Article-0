import { describe, it, expect } from "vitest";
import { CollisionGrid } from "./CollisionGrid";
import type { GameLevel } from "../map/types";

/** A 5×5 level with a wall column at x=2 for y=0..2. */
function level(): GameLevel {
  return {
    name: "t",
    width: 5,
    height: 5,
    layers: [{ name: "walls", tiles: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }] }],
  } as unknown as GameLevel;
}

describe("CollisionGrid", () => {
  it("marks wall tiles blocked and treats out-of-bounds as blocked", () => {
    const g = new CollisionGrid(level());
    expect(g.isBlocked(2, 1)).toBe(true);
    expect(g.isBlocked(0, 0)).toBe(false);
    expect(g.isBlocked(-1, 0)).toBe(true);
    expect(g.isBlocked(99, 0)).toBe(true);
  });

  it("blocks line of sight through a wall but not across an open row", () => {
    const g = new CollisionGrid(level());
    expect(g.hasLineOfSight(0, 1, 4, 1)).toBe(false); // crosses the wall at x=2
    expect(g.hasLineOfSight(0, 4, 4, 4)).toBe(true); // open row
  });

  it("clears a tile at runtime with setBlocked", () => {
    const g = new CollisionGrid(level());
    g.setBlocked(2, 1, false);
    expect(g.isBlocked(2, 1)).toBe(false);
    expect(g.hasLineOfSight(0, 1, 4, 1)).toBe(true); // gap now open
  });
});
