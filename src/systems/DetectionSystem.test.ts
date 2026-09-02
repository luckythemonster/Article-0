import { describe, it, expect } from "vitest";
import { DetectionSystem } from "./DetectionSystem";
import type { GameLevel } from "../map/types";

const TILE = 32;

type TileSpec = { x: number; y: number; ref?: string; components?: unknown[] };

function level(layers: { name: string; tiles: TileSpec[] }[]): GameLevel {
  return { name: "t", width: 64, height: 64, layers } as unknown as GameLevel;
}

/** A `light_sources` tile with an explicit radius (tiles) and multiplier. */
function light(
  x: number,
  y: number,
  radius: number,
  multiplier: number,
  ref = "light_overhead1",
): TileSpec {
  return {
    x,
    y,
    ref,
    components: [
      {
        type: "light_source",
        values: {
          Radius: String(radius),
          DetectionMultiplier: String(multiplier),
        },
      },
    ],
  };
}

function cover(x: number, y: number, type = "low", thermalBleed = false): TileSpec {
  return {
    x,
    y,
    components: [
      {
        type: "cover",
        values: { type, ThermalBleed: String(thermalBleed) },
      },
    ],
  };
}

/** Pixel centre of a tile. */
const at = (tx: number, ty: number): [number, number] => [(tx + 0.5) * TILE, (ty + 0.5) * TILE];

describe("multiplierAt — lights", () => {
  it("is neutral where no light reaches", () => {
    const d = new DetectionSystem(level([{ name: "light_sources", tiles: [light(2, 2, 3, 3)] }]), TILE);
    expect(d.multiplierAt(...at(40, 40))).toBe(1);
  });

  it("is at full strength dead centre of a pool", () => {
    const d = new DetectionSystem(level([{ name: "light_sources", tiles: [light(2, 2, 3, 3)] }]), TILE);
    expect(d.multiplierAt(...at(2, 2))).toBeCloseTo(3);
  });

  it("falls off linearly to neutral at the rim", () => {
    const d = new DetectionSystem(level([{ name: "light_sources", tiles: [light(10, 10, 4, 3)] }]), TILE);
    const centre = (10 + 0.5) * TILE;
    // Halfway out: falloff 0.5, so 1 + (3-1)*0.5 = 2.
    expect(d.multiplierAt(centre + 2 * TILE, centre)).toBeCloseTo(2);
    // Just inside the rim is barely above neutral; the rim itself is neutral.
    expect(d.multiplierAt(centre + 3.99 * TILE, centre)).toBeLessThan(1.02);
    expect(d.multiplierAt(centre + 4 * TILE, centre)).toBe(1);
    expect(d.multiplierAt(centre + 5 * TILE, centre)).toBe(1);
  });

  it("compounds overlapping pools", () => {
    const d = new DetectionSystem(
      level([{ name: "light_sources", tiles: [light(10, 10, 4, 3), light(10, 10, 4, 3)] }]),
      TILE,
    );
    expect(d.multiplierAt(...at(10, 10))).toBeCloseTo(9);
  });

  it("finds a light whose reach crosses a spatial-index bucket boundary", () => {
    // Buckets are 8 tiles. A light at tile 7 with radius 4 spills into the next
    // bucket; a query over there must still see it.
    const d = new DetectionSystem(level([{ name: "light_sources", tiles: [light(7, 7, 4, 3)] }]), TILE);
    expect(d.multiplierAt(...at(9, 7))).toBeGreaterThan(1);
    expect(d.multiplierAt(...at(10, 7))).toBeGreaterThan(1);
    expect(d.multiplierAt(...at(7, 10))).toBeGreaterThan(1);
    // And a point past its reach, in that same neighbouring bucket, must not.
    expect(d.multiplierAt(...at(13, 7))).toBe(1);
  });

  it("agrees with a brute-force scan over a grid of query points", () => {
    const tiles = [light(5, 5, 3, 2), light(20, 9, 5, 4), light(33, 31, 2, 3)];
    const d = new DetectionSystem(level([{ name: "light_sources", tiles }]), TILE);

    const brute = (px: number, py: number): number => {
      let m = 1;
      for (const t of tiles) {
        const c = t.components![0] as { values: Record<string, string> };
        const r = Number(c.values.Radius) * TILE;
        const mult = Number(c.values.DetectionMultiplier);
        const dist = Math.hypot(px - (t.x + 0.5) * TILE, py - (t.y + 0.5) * TILE);
        if (dist < r) m *= 1 + (mult - 1) * (1 - dist / r);
      }
      return m;
    };

    for (let ty = 0; ty < 40; ty += 3) {
      for (let tx = 0; tx < 40; tx += 3) {
        const [px, py] = at(tx, ty);
        expect(d.multiplierAt(px, py)).toBeCloseTo(brute(px, py), 10);
      }
    }
  });
});

describe("multiplierAt — cover", () => {
  it("dampens detection on a cover tile and nowhere else", () => {
    const d = new DetectionSystem(level([{ name: "cover", tiles: [cover(3, 3)] }]), TILE);
    expect(d.multiplierAt(...at(3, 3))).toBeCloseTo(0.4);
    expect(d.multiplierAt(...at(4, 3))).toBe(1);
  });

  it("stacks with a light standing over the same tile", () => {
    const d = new DetectionSystem(
      level([
        { name: "cover", tiles: [cover(6, 6)] },
        { name: "light_sources", tiles: [light(6, 6, 3, 3)] },
      ]),
      TILE,
    );
    expect(d.multiplierAt(...at(6, 6))).toBeCloseTo(0.4 * 3);
  });
});

describe("cover queries", () => {
  it("reports the authored cover type, or undefined off it", () => {
    const d = new DetectionSystem(
      level([{ name: "cover", tiles: [cover(1, 1, "high"), cover(2, 1, "low")] }]),
      TILE,
    );
    expect(d.coverTypeAt(...at(1, 1))).toBe("high");
    expect(d.coverTypeAt(...at(2, 1))).toBe("low");
    expect(d.coverTypeAt(...at(3, 1))).toBeUndefined();
  });

  it("reports thermal bleed only where the cover authored it", () => {
    const d = new DetectionSystem(
      level([{ name: "cover", tiles: [cover(1, 1, "low", true), cover(2, 1, "low", false)] }]),
      TILE,
    );
    expect(d.thermalBleedAt(...at(1, 1))).toBe(true);
    expect(d.thermalBleedAt(...at(2, 1))).toBe(false);
    expect(d.thermalBleedAt(...at(9, 9))).toBe(false);
  });
});

describe("destroyCoverAt", () => {
  it("removes a cover tile's dampening and thermal bleed, and reports it did", () => {
    const d = new DetectionSystem(
      level([{ name: "cover", tiles: [cover(1, 1, "low", true)] }]),
      TILE,
    );
    expect(d.multiplierAt(...at(1, 1))).toBeCloseTo(0.4);
    expect(d.thermalBleedAt(...at(1, 1))).toBe(true);

    expect(d.destroyCoverAt(1, 1)).toBe(true);

    expect(d.multiplierAt(...at(1, 1))).toBe(1);
    expect(d.coverTypeAt(...at(1, 1))).toBeUndefined();
    expect(d.thermalBleedAt(...at(1, 1))).toBe(false);
  });

  it("leaves other cover tiles untouched and no-ops on a tile with none", () => {
    const d = new DetectionSystem(
      level([{ name: "cover", tiles: [cover(1, 1), cover(2, 1)] }]),
      TILE,
    );
    d.destroyCoverAt(1, 1);
    expect(d.coverTypeAt(...at(2, 1))).toBe("low");
    expect(d.destroyCoverAt(9, 9)).toBe(false);
  });

  it("is idempotent — destroying twice still just reports false the second time", () => {
    const d = new DetectionSystem(level([{ name: "cover", tiles: [cover(1, 1)] }]), TILE);
    expect(d.destroyCoverAt(1, 1)).toBe(true);
    expect(d.destroyCoverAt(1, 1)).toBe(false);
  });
});

/**
 * The half of a blackout guards can feel.
 *
 * `Lighting` decides whether the player can see; this decides whether they can
 * be seen. A breaker that moved only one of them would be a lie in one direction
 * or the other, so `GameScene.setCircuit` always calls both.
 */
describe("setCircuit", () => {
  it("drops a killed circuit's lights out of the multiplier", () => {
    const d = new DetectionSystem(
      level([{ name: "light_sources", tiles: [light(4, 4, 3.5, 1.6)] }]),
      TILE,
    );
    expect(d.multiplierAt(...at(4, 4))).toBeCloseTo(1.6);

    d.setCircuit("light_overhead1", false);
    // Standing under a dead lamp is standing in the dark: no bonus at all.
    expect(d.multiplierAt(...at(4, 4))).toBe(1);

    d.setCircuit("light_overhead1", true);
    expect(d.multiplierAt(...at(4, 4))).toBeCloseTo(1.6);
  });

  it("only touches the circuit it names", () => {
    // One breaker feeds one tile-def ref. A second fixture type in the same room
    // has its own switch, and must not go out with it.
    const d = new DetectionSystem(
      level([
        {
          name: "light_sources",
          tiles: [light(4, 4, 3.5, 1.6), light(20, 20, 3.5, 1.6, "light_overhead2")],
        },
      ]),
      TILE,
    );
    d.setCircuit("light_overhead1", false);
    expect(d.multiplierAt(...at(4, 4))).toBe(1);
    expect(d.multiplierAt(...at(20, 20))).toBeCloseTo(1.6);
  });

  it("cuts every fixture sharing the ref, which is the whole mechanic", () => {
    // `light_overhead1` is one tile def the shipped map places fifty times, so
    // main1's single breaker takes the deck's entire overhead lighting with it.
    const tiles = [light(4, 4, 3.5, 1.6), light(4, 20, 3.5, 1.6), light(20, 4, 3.5, 1.6)];
    const d = new DetectionSystem(level([{ name: "light_sources", tiles }]), TILE);
    d.setCircuit("light_overhead1", false);
    for (const [tx, ty] of [
      [4, 4],
      [4, 20],
      [20, 4],
    ]) {
      expect(d.multiplierAt(...at(tx, ty)), `${tx},${ty}`).toBe(1);
    }
  });
});

describe("thermalRadiusFor", () => {
  it("passes the base radius through, and zeroes it while masked", () => {
    const d = new DetectionSystem(level([]), TILE);
    expect(d.thermalRadiusFor(4, false)).toBe(4);
    expect(d.thermalRadiusFor(4, true)).toBe(0);
  });
});

describe("DetectionSystem.refsWithin — what a hacked terminal reaches", () => {
  const near = light(10, 10, 4, 1.6, "z_near");
  const far = light(30, 30, 4, 1.6, "z_far");

  it("names the circuits with a fixture inside the radius", () => {
    const d = new DetectionSystem(level([{ name: "light_sources", tiles: [near, far] }]), TILE);
    expect(d.refsWithin(10.5 * TILE, 10.5 * TILE, 6 * TILE)).toEqual(["z_near"]);
  });

  it("measures to the fixture, not to the edge of its pool", () => {
    // A lamp whose glow spills into the room is not a lamp *in* the room. Its
    // radius-4 pool reaches within 6 tiles of the origin here; the lamp does not.
    const spill = light(0, 0, 20, 1.6, "z_spill");
    const d = new DetectionSystem(level([{ name: "light_sources", tiles: [spill] }]), TILE);
    expect(d.refsWithin(10.5 * TILE, 10.5 * TILE, 6 * TILE)).toEqual([]);
  });

  it("names a circuit once however many fixtures it owns", () => {
    const tiles = [light(9, 9, 4, 1.6, "z"), light(10, 10, 4, 1.6, "z"), light(11, 11, 4, 1.6, "z")];
    const d = new DetectionSystem(level([{ name: "light_sources", tiles }]), TILE);
    expect(d.refsWithin(10.5 * TILE, 10.5 * TILE, 6 * TILE)).toEqual(["z"]);
  });

  it("skips a circuit that is already dark", () => {
    const d = new DetectionSystem(level([{ name: "light_sources", tiles: [near] }]), TILE);
    d.setCircuit("z_near", false);
    expect(d.refsWithin(10.5 * TILE, 10.5 * TILE, 6 * TILE)).toEqual([]);
  });

  it("is empty on a level with no lights at all", () => {
    const d = new DetectionSystem(level([]), TILE);
    expect(d.refsWithin(0, 0, 99 * TILE)).toEqual([]);
  });
});
