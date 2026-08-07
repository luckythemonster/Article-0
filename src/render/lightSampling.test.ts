import { describe, it, expect } from "vitest";
import { CollisionGrid } from "../systems/CollisionGrid";
import { emptySample, sampleLightAt, type CastingLight } from "./lightSampling";
import type { GameLevel } from "../map/types";

const TILE = 32;

/** A 20×20 level with no walls at all. */
function openLevel(): GameLevel {
  return { name: "open", width: 20, height: 20, layers: [] } as unknown as GameLevel;
}

/** A 20×20 level with a wall column at x=10. */
function walledLevel(): GameLevel {
  const tiles: { x: number; y: number }[] = [];
  for (let y = 0; y < 20; y++) tiles.push({ x: 10, y });
  return {
    name: "walled",
    width: 20,
    height: 20,
    layers: [{ name: "walls", tiles }],
  } as unknown as GameLevel;
}

function grid(level: GameLevel): CollisionGrid {
  return new CollisionGrid(level, ["walls"], TILE);
}

/** A light at tile (tx, ty) reaching `radiusTiles`. */
function light(tx: number, ty: number, radiusTiles: number, intensity = 1): CastingLight {
  return {
    x: (tx + 0.5) * TILE,
    y: (ty + 0.5) * TILE,
    radiusPx: radiusTiles * TILE,
    intensity,
  };
}

/** World px at the centre of tile (tx, ty). */
function at(tx: number, ty: number): [number, number] {
  return [(tx + 0.5) * TILE, (ty + 0.5) * TILE];
}

describe("sampleLightAt", () => {
  it("reports nothing at all when there are no lights", () => {
    const [x, y] = at(5, 5);
    const s = sampleLightAt([], x, y, grid(openLevel()), TILE, emptySample());
    expect(s).toEqual({ dx: 0, dy: 0, strength: 0, directionality: 0 });
  });

  it("points away from a single light, at full directionality", () => {
    const [x, y] = at(7, 5);
    const s = sampleLightAt([light(5, 5, 4)], x, y, grid(openLevel()), TILE, emptySample());
    // Light is to the west, so the shadow falls east.
    expect(s.dx).toBeCloseTo(1, 6);
    expect(s.dy).toBeCloseTo(0, 6);
    expect(s.directionality).toBeCloseTo(1, 6);
    expect(s.strength).toBeGreaterThan(0);
  });

  it("ignores a light standing off beyond its own radius", () => {
    const [x, y] = at(12, 5);
    // Reaches 4 tiles; the sample point is 7 away.
    const s = sampleLightAt([light(5, 5, 4)], x, y, grid(openLevel()), TILE, emptySample());
    expect(s.strength).toBe(0);
    expect(s.dx).toBe(0);
    expect(s.dy).toBe(0);
  });

  it("gets darker closer to the light", () => {
    const g = grid(openLevel());
    const near = sampleLightAt([light(5, 5, 6)], ...at(7, 5), g, TILE, emptySample()).strength;
    const far = sampleLightAt([light(5, 5, 6)], ...at(10, 5), g, TILE, emptySample()).strength;
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });

  it("cancels the direction between two opposed lights but stays lit", () => {
    const [x, y] = at(5, 5);
    const s = sampleLightAt(
      [light(2, 5, 5), light(8, 5, 5)],
      x,
      y,
      grid(openLevel()),
      TILE,
      emptySample(),
    );
    // Equal and opposite: nothing left to point at, but the spot is brightly lit.
    expect(s.directionality).toBeCloseTo(0, 6);
    expect(s.strength).toBeGreaterThan(0.5);
  });

  it("lands between the two extremes when the lights are unequal", () => {
    // Same axis, but one is nearer — partial cancellation.
    const s = sampleLightAt(
      [light(3, 5, 5), light(9, 5, 5)],
      ...at(5, 5),
      grid(openLevel()),
      TILE,
      emptySample(),
    );
    expect(s.directionality).toBeGreaterThan(0);
    expect(s.directionality).toBeLessThan(1);
    // The nearer light is to the west, so what direction survives points east.
    expect(s.dx).toBeGreaterThan(0);
  });

  it("does not let a light throw a shadow through a wall", () => {
    const [x, y] = at(12, 5);
    const lights = [light(8, 5, 6)];
    // Same geometry, same distance — only the wall column at x=10 differs.
    const open = sampleLightAt(lights, x, y, grid(openLevel()), TILE, emptySample());
    expect(open.strength).toBeGreaterThan(0);

    const blocked = sampleLightAt(lights, x, y, grid(walledLevel()), TILE, emptySample());
    expect(blocked.strength).toBe(0);
    expect(blocked.directionality).toBe(0);
  });

  it("still lights the open side of that same wall", () => {
    // Mirror of the case above: light and sample both west of the column.
    const s = sampleLightAt(
      [light(8, 5, 6)],
      ...at(6, 5),
      grid(walledLevel()),
      TILE,
      emptySample(),
    );
    expect(s.strength).toBeGreaterThan(0);
    expect(s.dx).toBeCloseTo(-1, 6);
  });

  it("scales strength by a flickering light's intensity", () => {
    const g = grid(openLevel());
    const full = sampleLightAt([light(5, 5, 6)], ...at(8, 5), g, TILE, emptySample()).strength;
    const half = sampleLightAt(
      [light(5, 5, 6, 0.5)],
      ...at(8, 5),
      g,
      TILE,
      emptySample(),
    ).strength;
    expect(half).toBeCloseTo(full * 0.5, 6);
  });

  it("is bright but directionless standing exactly on a light", () => {
    const [x, y] = at(5, 5);
    const s = sampleLightAt([light(5, 5, 4)], x, y, grid(openLevel()), TILE, emptySample());
    expect(s.strength).toBe(1);
    expect(s.dx).toBe(0);
    expect(s.dy).toBe(0);
    expect(s.directionality).toBe(0);
  });

  it("clamps strength at 1 under a pile of lights", () => {
    const lights = [light(4, 5, 6), light(6, 5, 6), light(5, 4, 6), light(5, 6, 6)];
    const s = sampleLightAt(lights, ...at(5, 5), grid(openLevel()), TILE, emptySample());
    expect(s.strength).toBe(1);
    expect(s.directionality).toBeLessThanOrEqual(1);
  });

  it("writes into the caller's object rather than allocating", () => {
    const out = emptySample();
    const returned = sampleLightAt([light(5, 5, 4)], ...at(7, 5), grid(openLevel()), TILE, out);
    expect(returned).toBe(out);
  });

  it("clears the previous answer when the point goes dark", () => {
    const g = grid(openLevel());
    const out = emptySample();
    sampleLightAt([light(5, 5, 4)], ...at(7, 5), g, TILE, out);
    expect(out.strength).toBeGreaterThan(0);
    // Reusing a scratch object is only safe if an unlit sample fully resets it.
    sampleLightAt([light(5, 5, 4)], ...at(19, 19), g, TILE, out);
    expect(out).toEqual({ dx: 0, dy: 0, strength: 0, directionality: 0 });
  });
});
