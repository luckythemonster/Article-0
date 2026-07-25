import { describe, it, expect } from "vitest";
import { CollisionGrid } from "./CollisionGrid";
import { circleFits, moveCircle, moveCirclePx } from "./GridMotion";
import type { GameLevel } from "../map/types";

/** Builds a level of `size`×`size` with the given wall tiles. */
function level(size: number, walls: { x: number; y: number }[]): GameLevel {
  return {
    name: "t",
    width: size,
    height: size,
    layers: [{ name: "walls", tiles: walls }],
  } as unknown as GameLevel;
}

/** A 7×7 room walled all the way round, open inside. */
function room(): CollisionGrid {
  const walls: { x: number; y: number }[] = [];
  for (let i = 0; i < 7; i++) {
    walls.push({ x: i, y: 0 }, { x: i, y: 6 }, { x: 0, y: i }, { x: 6, y: i });
  }
  return new CollisionGrid(level(7, walls));
}

describe("circleFits", () => {
  it("clears open floor and overlaps a wall once the radius reaches it", () => {
    const g = room();
    expect(circleFits(g, 3.5, 3.5, 0.4)).toBe(true);
    // Centre is 0.5 tiles from the wall face at x=1, so r=0.4 clears and
    // r=0.6 does not — the centre-point test this replaces passed both.
    expect(circleFits(g, 1.5, 3.5, 0.4)).toBe(true);
    expect(circleFits(g, 1.5, 3.5, 0.6)).toBe(false);
  });

  it("catches a corner the axis-aligned faces would miss", () => {
    const g = new CollisionGrid(level(5, [{ x: 2, y: 2 }]));
    // Diagonally offset from the blocked tile's corner at (2,2): the nearest
    // point is the corner itself, ~0.28 tiles away.
    expect(circleFits(g, 1.8, 1.8, 0.25)).toBe(true);
    expect(circleFits(g, 1.8, 1.8, 0.35)).toBe(false);
  });

  it("treats out of bounds as solid", () => {
    const g = new CollisionGrid(level(5, []));
    expect(circleFits(g, 0.5, 0.5, 0.4)).toBe(true);
    expect(circleFits(g, 0.1, 0.5, 0.4)).toBe(false);
  });

  it("treats an openable cell as clear for planning only", () => {
    const g = new CollisionGrid(level(5, [{ x: 2, y: 2 }]));
    expect(circleFits(g, 2.5, 2.5, 0.4)).toBe(false);
    expect(circleFits(g, 2.5, 2.5, 0.4, (x, y) => x === 2 && y === 2)).toBe(true);
    // A different cell being openable changes nothing about this one.
    expect(circleFits(g, 2.5, 2.5, 0.4, (x) => x === 4)).toBe(false);
  });

  it("never lets a guard walk through an unopened door", () => {
    // `moveCircle` takes no openable predicate at all: planning may route a
    // guard through its own doors, but the body still has to wait for the door.
    const g = new CollisionGrid(level(5, [{ x: 2, y: 2 }]));
    expect(moveCircle(g, 1.5, 2.5, 0.4, 0, 0.4).blockedX).toBe(true);
    g.setBlocked(2, 2, false);
    expect(moveCircle(g, 1.5, 2.5, 0.4, 0, 0.4).blockedX).toBe(false);
  });

  it("blocks movement through glazing that sight passes through", () => {
    const g = new CollisionGrid(level(5, []));
    g.setBlocked(2, 2, true, true); // clear glass: see-through, still solid
    expect(g.blocksSight(2, 2)).toBe(false);
    expect(circleFits(g, 2.5, 2.5, 0.4)).toBe(false);
  });
});

describe("moveCircle", () => {
  it("moves freely across open floor", () => {
    const g = room();
    const m = moveCircle(g, 3, 3, 0.25, 0.25, 0.4);
    expect(m).toMatchObject({ x: 3.25, y: 3.25, blockedX: false, blockedY: false });
  });

  it("slides along a wall instead of stopping dead", () => {
    const g = room();
    // Pressed against the west wall, pushing north-west: the westward component
    // is refused, the northward one survives. The old whole-step rejection lost
    // both and re-aimed the guard at random.
    const m = moveCircle(g, 1.45, 3, -0.2, -0.2, 0.4);
    expect(m.blockedX).toBe(true);
    expect(m.blockedY).toBe(false);
    expect(m.x).toBe(1.45);
    expect(m.y).toBeCloseTo(2.8);
  });

  it("yields no movement in an inside corner", () => {
    const g = room();
    const m = moveCircle(g, 1.45, 1.45, -0.2, -0.2, 0.4);
    expect(m).toMatchObject({ x: 1.45, y: 1.45, blockedX: true, blockedY: true });
  });

  it("resolves Y from the position X already committed to", () => {
    // A wall only at (2,1). Stepping diagonally from (1.5,1.5) toward it, the X
    // move lands clear, and Y is then judged from there rather than from the
    // original position.
    const g = new CollisionGrid(level(6, [{ x: 2, y: 1 }]));
    const m = moveCircle(g, 1.5, 2.5, 0.3, -0.3, 0.3);
    expect(m.x).toBeCloseTo(1.8);
    expect(m.blockedY).toBe(true);
    expect(m.y).toBe(2.5);
  });

  it("fits a one-tile gap at guard radius but not at double it", () => {
    // A wall row with a single one-tile hole at x=3 — the shape `main1` has 24
    // of and `duct1` is built from.
    const walls = [0, 1, 2, 4, 5, 6].map((x) => ({ x, y: 3 }));
    const g = new CollisionGrid(level(7, walls));
    expect(moveCircle(g, 3.5, 3.9, 0, -0.3, 0.37).blockedY).toBe(false);
    expect(moveCircle(g, 3.5, 3.9, 0, -0.3, 0.74).blockedY).toBe(true);
  });

  it("reports no block for a zero-length step", () => {
    const g = room();
    const m = moveCircle(g, 1.45, 1.45, 0, 0, 0.4);
    expect(m).toMatchObject({ x: 1.45, y: 1.45, blockedX: false, blockedY: false });
  });
});

describe("moveCirclePx", () => {
  it("round-trips pixel coordinates through tile space", () => {
    const g = room();
    const m = moveCirclePx(g, 3 * 32, 3 * 32, 8, 8, 0.4, 32);
    expect(m.x).toBeCloseTo(104);
    expect(m.y).toBeCloseTo(104);
    expect(m.blockedX).toBe(false);
  });

  it("stops a pixel-space step at the wall face", () => {
    const g = room();
    const m = moveCirclePx(g, 1.45 * 32, 3 * 32, -16, 0, 0.4, 32);
    expect(m.blockedX).toBe(true);
    expect(m.x).toBeCloseTo(1.45 * 32);
  });
});
