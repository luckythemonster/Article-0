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

  describe("glazing — blocks movement but not sight", () => {
    it("lets sight through a see-through cell while movement stays blocked", () => {
      const g = new CollisionGrid(level());
      g.setBlocked(2, 1, true, true);
      expect(g.isBlocked(2, 1)).toBe(true); // still a physical obstacle
      expect(g.blocksSight(2, 1)).toBe(false);
      expect(g.hasLineOfSight(0, 1, 4, 1)).toBe(true); // you can see across it
      // The neighbouring plain wall is unaffected.
      expect(g.blocksSight(2, 2)).toBe(true);
      expect(g.hasLineOfSight(0, 2, 4, 2)).toBe(false);
    });

    it("blocks sight again when re-registered opaque", () => {
      const g = new CollisionGrid(level());
      g.setBlocked(2, 1, true, true);
      g.setBlocked(2, 1, true, false);
      expect(g.blocksSight(2, 1)).toBe(true);
      expect(g.hasLineOfSight(0, 1, 4, 1)).toBe(false);
    });

    it("drops see-through when the cell is cleared, so a reblock is opaque by default", () => {
      const g = new CollisionGrid(level());
      g.setBlocked(2, 1, true, true);
      g.setBlocked(2, 1, false);
      g.setBlocked(2, 1, true);
      expect(g.blocksSight(2, 1)).toBe(true);
    });

    it("bumps the revision when only the glazing changes", () => {
      const g = new CollisionGrid(level());
      const before = g.revision;
      g.setBlocked(2, 1, true, true); // already blocked, now transparent
      expect(g.revision).toBeGreaterThan(before);
    });

    it("still treats out of bounds as blocking sight", () => {
      const g = new CollisionGrid(level());
      expect(g.blocksSight(-1, 0)).toBe(true);
      expect(g.blocksSight(99, 0)).toBe(true);
    });
  });
});
