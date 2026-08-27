import { describe, it, expect } from "vitest";
import { CollisionGrid } from "./CollisionGrid";
import {
  rayDirections,
  rayDistance,
  sightDistances,
  walkRayCells,
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

/**
 * A 6×6 level whose only wall is a tile with an authored, inset collider at
 * (2,1) — mirrors the VENT-4 turbine-hub support posts: solid on the top 70%
 * of the cell (y∈[1,1.7)), walkable on the bottom 30% (y∈[1.7,2)).
 */
function paddedWallLevel(): GameLevel {
  return {
    name: "padded",
    width: 6,
    height: 6,
    layers: [
      {
        name: "walls",
        tiles: [
          {
            x: 2,
            y: 1,
            colSpan: 1,
            rowSpan: 1,
            offsetX: 0,
            offsetY: 0,
            components: [],
            collider: { Bottom: 0.3 },
          },
        ],
      },
    ],
  } as unknown as GameLevel;
}

/**
 * A 40×40 level with a full wall row at y=10 whose tiles are inset from the
 * bottom by 0.4 — the shipped map's commonest wall by far (157 of `main1`'s 318
 * `walls` tiles carry exactly this padding). Solid portion: y∈[10,10.6). The
 * strip y∈[10.6,11) is walkable floor in front of the wall's face, and it shares
 * the wall's own grid row.
 */
function paddedWallRowLevel(): GameLevel {
  const tiles: unknown[] = [];
  for (let x = 0; x < 40; x++) {
    tiles.push({
      x,
      y: 10,
      colSpan: 1,
      rowSpan: 1,
      offsetX: 0,
      offsetY: 0,
      components: [],
      collider: { Bottom: 0.4 },
    });
  }
  return {
    name: "paddedRow",
    width: 40,
    height: 40,
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

  describe("origin cell has authored collider padding (the thin-wall sight leak)", () => {
    it("stops at the solid portion when the origin stands in the tile's own walkable margin", () => {
      const g = new CollisionGrid(paddedWallLevel());
      // Standing at (2.5, 1.9): inside cell (2,1), in the open bottom 30%.
      // Heading north crosses the solid top 70% at y=1.7 — 0.2 tiles away.
      expect(rayDistance(g, 2.5, 1.9, 0, -1, 10, 0)).toBeCloseTo(0.2, 5);
    });

    it("does not block heading along the tile's own open margin", () => {
      const g = new CollisionGrid(paddedWallLevel());
      expect(rayDistance(g, 2.5, 1.9, 0, 1, 3, 0)).toBe(3);
    });

    it("still sees out of a *plain* wall tile — the no-clip case above is unaffected", () => {
      const g = new CollisionGrid(level());
      expect(rayDistance(g, 2.5, 1.5, 1, 0, 3)).toBe(3);
    });
  });

  describe("walking along a padded wall (the darkness jump)", () => {
    it("sees down the strip of floor a padded wall leaves in front of its face", () => {
      // Hugging the wall puts the eye at y≈10.8 — inside the wall's own row, in
      // the open bottom 40%. Every cell east of here is a wall cell, but none of
      // their *solid* portions reach down to this y, so sight runs the corridor.
      // Before the fix the walk stopped at the first cell boundary: ~1 tile.
      const g = new CollisionGrid(paddedWallRowLevel());
      expect(rayDistance(g, 20.5, 10.8, 1, 0, 15)).toBe(15);
      expect(rayDistance(g, 20.5, 10.8, -1, 0, 15)).toBe(15);
    });

    it("still stops against the solid portion of the wall it is pressed to", () => {
      const g = new CollisionGrid(paddedWallRowLevel());
      // Straight up from the strip crosses the solid face at y=10.6.
      expect(rayDistance(g, 20.5, 10.8, 0, -1, 10, 0)).toBeCloseTo(0.2, 5);
    });

    it("does not step as the eye crosses out of the wall's row", () => {
      // The regression proper. `Math.floor(originY)` flips from 10 to 11 at
      // y=11, which used to switch all 720 rays between the precise origin test
      // and the coarse walk at once — a full-corridor blackout that appeared and
      // vanished within one pixel of movement.
      const g = new CollisionGrid(paddedWallRowLevel());
      const dirs = rayDirections(SIGHT_RAYS);
      const out = new Float64Array(SIGHT_RAYS);

      const totals: number[] = [];
      // A pixel at tileSize 32 is 1/32 of a tile; sweep either side of the row
      // boundary in half-pixel steps.
      for (let oy = 10.7; oy <= 11.3001; oy += 1 / 64) {
        sightDistances(g, 20.5, oy, 15, dirs, out);
        let sum = 0;
        for (const d of out) sum += d;
        totals.push(sum);
      }

      // Total visible reach across all 720 rays necessarily *drifts* as the eye
      // backs away from the wall — more of the corridor comes into view. What a
      // discontinuity looks like is an outlier: one step far larger than its
      // neighbours. So compare the largest step against the typical one rather
      // than against an absolute bound, which would only be measuring the drift.
      const steps: number[] = [];
      for (let i = 1; i < totals.length; i++) steps.push(Math.abs(totals[i] - totals[i - 1]));
      const median = [...steps].sort((a, b) => a - b)[steps.length >> 1];
      const maxStep = Math.max(...steps);

      // Measured: 1.4x with the precise walk. Before the fix the eye crossing
      // y=11 moved the total by 133 tiles against a median of 21 — 6.2x — and
      // the sweep *inside* the wall's row oscillated between 88 and 116.
      expect(maxStep).toBeLessThan(median * 3);
    });
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

  describe("origin cell has authored collider padding (the thin-wall sight leak)", () => {
    it("blocks the ray toward the solid portion at the same distance rayDistance reports", () => {
      const g = new CollisionGrid(paddedWallLevel());
      const dirs = rayDirections(SIGHT_RAYS);
      const out = new Float64Array(SIGHT_RAYS);
      sightDistances(g, 2.5, 1.9, 10, dirs, out);
      // Index 3*SIGHT_RAYS/4 is unit direction (0,-1) — due "north", toward the
      // solid portion of the standing tile.
      const i = (3 * SIGHT_RAYS) / 4;
      expect(out[i]).toBeCloseTo(rayDistance(g, 2.5, 1.9, dirs.cos[i], dirs.sin[i], 10), 9);
      expect(out[i]).toBeLessThan(1); // was 10 (the cap) before this fix
    });

    it("leaves the ray along the open margin unaffected", () => {
      const g = new CollisionGrid(paddedWallLevel());
      const dirs = rayDirections(SIGHT_RAYS);
      const out = new Float64Array(SIGHT_RAYS);
      sightDistances(g, 2.5, 1.9, 3, dirs, out);
      // Index SIGHT_RAYS/4 is unit direction (0,1) — due "south", along the
      // tile's own walkable margin.
      expect(out[SIGHT_RAYS / 4]).toBe(3);
    });

    it("fast path and fallback path still agree with a padded origin cell", () => {
      const g = new CollisionGrid(paddedWallLevel());
      const dirs = rayDirections(SIGHT_RAYS);
      const outFast = new Float64Array(SIGHT_RAYS);
      const outFallback = new Float64Array(SIGHT_RAYS);
      sightDistances(g, 2.5, 1.9, 10, dirs, outFast);
      sightDistances(g, 2.5, 1.9, 10, { cos: dirs.cos, sin: dirs.sin }, outFallback);
      for (let i = 0; i < SIGHT_RAYS; i++) expect(outFast[i]).toBeCloseTo(outFallback[i], 9);
    });
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

    const strippedDirs = { cos: dirs.cos, sin: dirs.sin };

    // Warm both paths before either is timed.
    //
    // Without this the first loop measured pays for JIT-compiling code the
    // second one then runs hot, so the two timings are not comparable and the
    // 15ms tolerance is riding on which happened to go first. It usually
    // flattered the fast path — it runs second — which is why this only ever
    // failed on a contended runner, once in thirty runs on `main`, reporting
    // the fast path as *slower* than the fallback. Neither implementation
    // changed between those runs; only the machine's mood did.
    for (let i = 0; i < iterations; i++) {
      sightDistances(g, originX, originY, maxTiles, strippedDirs, out);
      sightDistances(g, originX, originY, maxTiles, dirs, out);
    }

    // Time each path several times and keep its *best* round.
    //
    // The warm-up above removes the JIT asymmetry but not the runner's. One
    // timed window per path is still one scheduler preemption away from
    // inverting the result, which is exactly what happened on CI run 490 while
    // 489 passed on the same executable code — the two commits differed only by
    // a doc comment. A second benchmark elsewhere in that run inverted too.
    //
    // Contention can only ever make a sample slower, never faster, so the
    // minimum across rounds is both the estimate closest to the true cost and
    // the one a spike cannot corrupt. This does not soften the assertion: a
    // fast path that is genuinely slower has a slower minimum too, and still
    // fails. Both paths pay the same closure overhead, so the comparison stays
    // like-for-like.
    const rounds = 5;
    const bestOf = (run: () => void): number => {
      let best = Infinity;
      for (let r = 0; r < rounds; r++) {
        const start = performance.now();
        for (let i = 0; i < iterations; i++) run();
        best = Math.min(best, performance.now() - start);
      }
      return best;
    };

    const fallbackTime = bestOf(() =>
      sightDistances(g, originX, originY, maxTiles, strippedDirs, out),
    );
    const fastTime = bestOf(() => sightDistances(g, originX, originY, maxTiles, dirs, out));

    const speedup = fallbackTime / (fastTime || 1);
    console.log(`[BENCHMARK] Fallback path: ${fallbackTime.toFixed(2)}ms, Fast path: ${fastTime.toFixed(2)}ms (Speedup: ${speedup.toFixed(2)}x)`);

    expect(fastTime).toBeLessThanOrEqual(fallbackTime + 15.0);
  });
});

describe("walkRayCells", () => {
  /** Collects the cells a ray covers, as "x,y" keys. */
  function cover(ox: number, oy: number, dx: number, dy: number, max: number): string[] {
    const out: string[] = [];
    walkRayCells(ox, oy, dx, dy, max, (x, y) => out.push(`${x},${y}`));
    return out;
  }

  it("visits the origin cell even with no reach at all", () => {
    expect(cover(2.5, 3.5, 1, 0, 0)).toEqual(["2,3"]);
  });

  it("walks a straight run one cell at a time", () => {
    expect(cover(0.5, 0.5, 1, 0, 3)).toEqual(["0,0", "1,0", "2,0", "3,0"]);
  });

  it("covers the cell the ray ends inside, not just the ones it fully crosses", () => {
    // Ends at x=2.2, which is inside cell 2 — you have seen it.
    expect(cover(0.5, 0.5, 1, 0, 1.7)).toEqual(["0,0", "1,0", "2,0"]);
  });

  it("steps both axes on a diagonal", () => {
    const cells = cover(0.5, 0.5, Math.SQRT1_2, Math.SQRT1_2, 2);
    expect(cells[0]).toBe("0,0");
    expect(cells).toContain("1,1");
    // Every step moves exactly one cell on exactly one axis.
    for (let i = 1; i < cells.length; i++) {
      const [ax, ay] = cells[i - 1].split(",").map(Number);
      const [bx, by] = cells[i].split(",").map(Number);
      expect(Math.abs(bx - ax) + Math.abs(by - ay)).toBe(1);
    }
  });

  it("marks exactly what a cast saw: the room, its walls, and nothing past them", () => {
    // The pairing that makes the explored mask agree with the darkness. A sealed
    // 1x1 room at (1,1): every ray stops in the wall ring, so the cells covered
    // are the room and its eight walls — never the open floor beyond.
    const g = new CollisionGrid(sealedLevel());
    const dirs = rayDirections(64);
    const dist = new Float64Array(64);
    sightDistances(g, 1.5, 1.5, 20, dirs, dist);

    const seen = new Set<string>();
    for (let i = 0; i < 64; i++) {
      walkRayCells(1.5, 1.5, dirs.cos[i], dirs.sin[i], dist[i], (x, y) => seen.add(`${x},${y}`));
    }

    for (let y = 0; y <= 2; y++) {
      for (let x = 0; x <= 2; x++) expect(seen.has(`${x},${y}`)).toBe(true);
    }
    expect(seen.has("3,1")).toBe(false);
    expect(seen.has("1,3")).toBe(false);
  });
});
