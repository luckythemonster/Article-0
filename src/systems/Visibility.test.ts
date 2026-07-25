import { describe, it, expect } from "vitest";
import { CollisionGrid } from "./CollisionGrid";
import { rayDirections, rayDistance, sightDistances, SIGHT_RAYS } from "./Visibility";
import type { GameLevel } from "../map/types";

/** A 5×5 level with a wall column at x=2 for y=0..2 (rows 3–4 are open). */
function level(): GameLevel {
  return {
    name: "t",
    width: 5,
    height: 5,
    layers: [{ name: "walls", tiles: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }] }],
  } as unknown as GameLevel;
}

/** A 5×5 level whose only open tile is (1,1) — a sealed 1×1 room. */
function sealedLevel(): GameLevel {
  const tiles: { x: number; y: number }[] = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (!(x === 1 && y === 1)) tiles.push({ x, y });
    }
  }
  return {
    name: "sealed",
    width: 5,
    height: 5,
    layers: [{ name: "walls", tiles }],
  } as unknown as GameLevel;
}

describe("rayDirections", () => {
  it("builds unit directions starting along +x", () => {
    const d = rayDirections(4);
    expect(d.cos).toHaveLength(4);
    expect(d.cos[0]).toBeCloseTo(1);
    expect(d.sin[0]).toBeCloseTo(0);
    for (let i = 0; i < 4; i++) {
      expect(Math.hypot(d.cos[i], d.sin[i])).toBeCloseTo(1);
    }
  });
});

describe("rayDistance", () => {
  it("reaches the cap across open ground", () => {
    const g = new CollisionGrid(level());
    // Row 4 is clear, so nothing stops the ray inside 3 tiles.
    expect(rayDistance(g, 0.5, 4.5, 1, 0, 3)).toBe(3);
  });

  it("stops at the far side of the first wall, so the wall tile stays visible", () => {
    const g = new CollisionGrid(level());
    // From x=0.5 the wall tile at x=2 spans x∈[2,3]; its far side is 2.5 away.
    expect(rayDistance(g, 0.5, 1.5, 1, 0, 10)).toBeCloseTo(2.5);
  });

  it("sees through a tile cleared at runtime (a door opening)", () => {
    const g = new CollisionGrid(level());
    g.setBlocked(2, 1, false);
    expect(rayDistance(g, 0.5, 1.5, 1, 0, 3)).toBe(3);
  });

  it("treats out of bounds as blocking", () => {
    const g = new CollisionGrid(level());
    // Heading left off the edge: stops rather than running to the cap.
    expect(rayDistance(g, 0.5, 4.5, -1, 0, 20)).toBeLessThan(20);
  });

  it("sees out of a wall tile, so debug no-clip is not blinding", () => {
    const g = new CollisionGrid(level());
    // Origin is inside the wall column; the ray still escapes eastward.
    expect(rayDistance(g, 2.5, 1.5, 1, 0, 3)).toBe(3);
  });
});

describe("sightDistances", () => {
  it("casts every direction into the supplied buffer", () => {
    const g = new CollisionGrid(level());
    const dirs = rayDirections(SIGHT_RAYS);
    const out = new Float64Array(SIGHT_RAYS);
    expect(sightDistances(g, 2.5, 3.5, 10, dirs, out)).toBe(out);
    for (let i = 0; i < SIGHT_RAYS; i++) expect(out[i]).toBeGreaterThan(0);
  });

  it("lets nothing escape a sealed room", () => {
    const g = new CollisionGrid(sealedLevel());
    const dirs = rayDirections(64);
    const out = sightDistances(g, 1.5, 1.5, 20, dirs, new Float64Array(64));
    for (let i = 0; i < 64; i++) expect(out[i]).toBeLessThan(20);
  });
});
