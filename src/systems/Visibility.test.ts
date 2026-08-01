import { describe, it, expect } from "vitest";
import { CollisionGrid } from "./CollisionGrid";
import {
  rayDirections,
  rayDistance,
  sightDistances,
  SIGHT_RAYS,
  WALL_REVEAL_TILES,
} from "./Visibility";
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

/** A 40×40 level with one flat wall row at y=10, for shadow-edge smoothness. */
function flatWallLevel(): GameLevel {
  const tiles: { x: number; y: number }[] = [];
  for (let x = 0; x < 40; x++) tiles.push({ x, y: 10 });
  return {
    name: "flat",
    width: 40,
    height: 40,
    layers: [{ name: "walls", tiles }],
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

  it("stops at the middle of the first wall, not its far side", () => {
    const g = new CollisionGrid(level());
    // From x=0.5 the wall tile at x=2 spans x∈[2,3]; entry is 1.5 away, and reveal
    // stops half a tile past that (2.0) — short of the far face at 2.5, so nothing
    // on the other side of a one-tile-thick wall is ever lit.
    expect(rayDistance(g, 0.5, 1.5, 1, 0, 10)).toBeCloseTo(2.0);
  });

  it("sees through a tile cleared at runtime (a door opening)", () => {
    const g = new CollisionGrid(level());
    g.setBlocked(2, 1, false);
    expect(rayDistance(g, 0.5, 1.5, 1, 0, 3)).toBe(3);
  });

  it("keeps the shadow edge smooth along a flat wall", () => {
    // Regression: stopping at the blocking tile's *exit* boundary made this edge
    // sawtooth over a full tile (which face the ray leaves through flips per tile),
    // pitching black triangles along every room edge. A constant reveal past the
    // entry face has to stay continuous in the ray angle instead.
    const g = new CollisionGrid(flatWallLevel());
    const ox = 20.5;
    const oy = 13.5;
    const ends: number[] = [];
    for (let deg = -45; deg <= 45; deg += 0.5) {
      const a = (deg * Math.PI) / 180 - Math.PI / 2; // sweep around "up"
      const t = rayDistance(g, ox, oy, Math.cos(a), Math.sin(a), 30);
      ends.push(oy + Math.sin(a) * t);
    }
    // The wall row spans y∈[10,11] and is entered at y=11, so every endpoint sits
    // within the reveal depth of that face — never past the tile, never short of it.
    for (const y of ends) {
      expect(y).toBeGreaterThanOrEqual(11 - WALL_REVEAL_TILES - 1e-9);
      expect(y).toBeLessThanOrEqual(11 + 1e-9);
    }
    // And no step between neighbouring rays: the old sawtooth jumped ~0.9 tiles.
    let maxStep = 0;
    for (let i = 1; i < ends.length; i++) maxStep = Math.max(maxStep, Math.abs(ends[i] - ends[i - 1]));
    expect(maxStep).toBeLessThan(0.02);
  });

  it("sees straight through glazing", () => {
    // A pane still stops movement, so the ray must not stop where `isBlocked` would.
    const g = new CollisionGrid(level());
    g.setBlocked(2, 1, true, true);
    expect(g.isBlocked(2, 1)).toBe(true);
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

describe("sightDistances optimization parity and benchmark", () => {
  it("asserts exact numerical parity between fast path and fallback path", () => {
    const g = new CollisionGrid(level());
    const dirs = rayDirections(SIGHT_RAYS);
    const outFast = new Float64Array(SIGHT_RAYS);
    const outFallback = new Float64Array(SIGHT_RAYS);

    for (let j = 0; j < 15; j++) {
      const originX = 0.1 + Math.random() * 4.8;
      const originY = 0.1 + Math.random() * 4.8;
      const maxTiles = 1.0 + Math.random() * 15.0;

      const strippedDirs = { cos: dirs.cos, sin: dirs.sin };
      sightDistances(g, originX, originY, maxTiles, strippedDirs, outFallback);
      sightDistances(g, originX, originY, maxTiles, dirs, outFast);

      for (let i = 0; i < SIGHT_RAYS; i++) {
        expect(outFast[i]).toBeCloseTo(outFallback[i], 9);
      }
    }
  });

  it("benchmarks execution time to document performance gains", () => {
    const g = new CollisionGrid(level());
    const dirs = rayDirections(SIGHT_RAYS);
    const out = new Float64Array(SIGHT_RAYS);

    const iterations = 1000;
    const originX = 2.5;
    const originY = 2.5;
    const maxTiles = 10;

    // Benchmark Fallback Path
    const strippedDirs = { cos: dirs.cos, sin: dirs.sin };
    const startFallback = performance.now();
    for (let i = 0; i < iterations; i++) {
      sightDistances(g, originX, originY, maxTiles, strippedDirs, out);
    }
    const endFallback = performance.now();
    const fallbackTime = endFallback - startFallback;

    // Benchmark Fast Path
    const startFast = performance.now();
    for (let i = 0; i < iterations; i++) {
      sightDistances(g, originX, originY, maxTiles, dirs, out);
    }
    const endFast = performance.now();
    const fastTime = endFast - startFast;

    const speedup = fallbackTime / (fastTime || 1);
    console.log(`[BENCHMARK] Fallback path: ${fallbackTime.toFixed(2)}ms, Fast path: ${fastTime.toFixed(2)}ms (Speedup: ${speedup.toFixed(2)}x)`);

    expect(fastTime).toBeLessThanOrEqual(fallbackTime + 15.0);
  });
});
