import { describe, it, expect } from "vitest";
import { AlertState } from "./AlertState";
import {
  accrueDetection,
  canSense,
  DETECTION_DECAY_PER_SECOND,
  type DetectionWorld,
  type Eye,
  type SensingWorld,
} from "./Sensing";

const TILE = 32;

/** An eye at the origin looking east, 10 tiles of 90° cone, no heat sense. */
function eye(over: Partial<Eye> = {}): Eye {
  return {
    x: 0,
    y: 0,
    facing: 0,
    rangeTiles: 10,
    coneDegrees: 90,
    thermalTiles: 0,
    ...over,
  };
}

/** A world with clear sight everywhere and nothing suppressing the eye. */
function world(over: Partial<SensingWorld> = {}): SensingWorld {
  return {
    grid: { hasLineOfSight: () => true },
    tileSize: TILE,
    player: { x: 5 * TILE, y: 0 },
    playerConcealed: false,
    playerCompliant: false,
    playerThermalConcealed: false,
    chaffZone: null,
    thermalRadiusMultiplier: (base) => base,
    ...over,
  };
}

describe("canSense — cone", () => {
  it("sees a player straight ahead and in range", () => {
    expect(canSense(eye(), world())).toBe(true);
  });

  it("does not see past its range", () => {
    expect(canSense(eye({ rangeTiles: 4 }), world())).toBe(false);
  });

  it("sees just inside the cone edge and not just outside it", () => {
    // 90° cone => 45° each side. Place the player on a 44° and a 46° bearing.
    const r = 5 * TILE;
    const at = (deg: number) =>
      world({ player: { x: Math.cos((deg * Math.PI) / 180) * r, y: Math.sin((deg * Math.PI) / 180) * r } });
    expect(canSense(eye(), at(44))).toBe(true);
    expect(canSense(eye(), at(46))).toBe(false);
    expect(canSense(eye(), at(-44))).toBe(true);
    expect(canSense(eye(), at(-46))).toBe(false);
  });

  it("measures the cone across the -pi/pi seam rather than the long way round", () => {
    // Eye looking due west (pi); player one degree the other side of the seam.
    const r = 5 * TILE;
    const deg = 179;
    const p = { x: Math.cos((-deg * Math.PI) / 180) * r, y: Math.sin((-deg * Math.PI) / 180) * r };
    expect(canSense(eye({ facing: Math.PI }), world({ player: p }))).toBe(true);
  });

  it("is blocked by a wall between the eye and the player", () => {
    expect(canSense(eye(), world({ grid: { hasLineOfSight: () => false } }))).toBe(false);
  });

  it("is blind to a concealed player even in the open", () => {
    expect(canSense(eye(), world({ playerConcealed: true }))).toBe(false);
  });
});

describe("canSense — walk surfaces", () => {
  it("cannot see a player who has climbed to the other surface", () => {
    // Clear line of sight, dead ahead, well in range — and still nothing, because
    // a gantry is a separate room that happens to share a skybox.
    expect(canSense(eye({ plane: 0 }), world({ playerPlane: 1 }))).toBe(false);
    expect(canSense(eye({ plane: 1 }), world({ playerPlane: 0 }))).toBe(false);
  });

  it("sees them normally once both are on the same surface", () => {
    expect(canSense(eye({ plane: 1 }), world({ playerPlane: 1 }))).toBe(true);
  });

  it("defaults both to the floor, so a single-plane level is unaffected", () => {
    expect(canSense(eye(), world())).toBe(true);
  });
});

describe("canSense — suppression", () => {
  it("clears a compliant player at any range, cone or thermal", () => {
    const w = world({ playerCompliant: true, player: { x: TILE, y: 0 } });
    expect(canSense(eye({ thermalTiles: 8 }), w)).toBe(false);
  });

  it("is blinded while inside a live chaff zone", () => {
    const w = world({ chaffZone: { x: 0, y: 0, radiusPx: 2 * TILE } });
    expect(canSense(eye(), w)).toBe(false);
  });

  it("still sees when the chaff zone does not reach it", () => {
    const w = world({ chaffZone: { x: 20 * TILE, y: 0, radiusPx: 2 * TILE } });
    expect(canSense(eye(), w)).toBe(true);
  });
});

describe("canSense — thermal", () => {
  /** Behind the eye (due west), so only the 360° heat sense can find them. */
  const behind = () => world({ player: { x: -2 * TILE, y: 0 } });

  it("senses heat behind it, outside the cone entirely", () => {
    expect(canSense(eye({ thermalTiles: 4 }), behind())).toBe(true);
  });

  it("does not reach past the thermal radius", () => {
    expect(canSense(eye({ thermalTiles: 1 }), behind())).toBe(false);
  });

  it("is defeated by thermal concealment even at point blank", () => {
    const w = world({ player: { x: -2 * TILE, y: 0 }, playerThermalConcealed: true });
    expect(canSense(eye({ thermalTiles: 4 }), w)).toBe(false);
  });

  it("is zeroed when Thermal Gel scales the radius to nothing", () => {
    const w = world({ player: { x: -2 * TILE, y: 0 }, thermalRadiusMultiplier: () => 0 });
    expect(canSense(eye({ thermalTiles: 4 }), w)).toBe(false);
  });

  it("still needs line of sight", () => {
    const w = world({ player: { x: -2 * TILE, y: 0 }, grid: { hasLineOfSight: () => false } });
    expect(canSense(eye({ thermalTiles: 4 }), w)).toBe(false);
  });

  it("sees a concealed player through cover that leaks heat", () => {
    // Concealed from the cone, but ThermalBleed cover leaves thermal open.
    const w = world({ player: { x: -2 * TILE, y: 0 }, playerConcealed: true });
    expect(canSense(eye({ thermalTiles: 4 }), w)).toBe(true);
  });
});

describe("accrueDetection", () => {
  function detWorld(over: Partial<DetectionWorld> = {}): DetectionWorld {
    return {
      tileSize: TILE,
      player: { x: 3 * TILE, y: 4 * TILE },
      lightMultiplierAt: () => 1,
      alert: new AlertState(),
      ...over,
    };
  }

  it("fills from 0 to 1 over fillSeconds in neutral light", () => {
    expect(accrueDetection(0, true, 1, 2, detWorld())).toBeCloseTo(0.5);
    expect(accrueDetection(0.5, true, 1, 2, detWorld())).toBe(1);
  });

  it("fills faster in light and slower in shadow", () => {
    const bright = accrueDetection(0, true, 0.1, 2, detWorld({ lightMultiplierAt: () => 2 }));
    const dim = accrueDetection(0, true, 0.1, 2, detWorld({ lightMultiplierAt: () => 0.4 }));
    expect(bright).toBeCloseTo(0.1);
    expect(dim).toBeCloseTo(0.02);
    expect(bright).toBeGreaterThan(dim);
  });

  it("applies the caller's fill multiplier (a CAUTIOUS guard)", () => {
    expect(accrueDetection(0, true, 1, 2, detWorld(), 1.25)).toBeCloseTo(0.625);
  });

  it("decays when nothing is sensed, and never below zero", () => {
    expect(accrueDetection(0.5, false, 0.1, 2, detWorld())).toBeCloseTo(
      0.5 - 0.1 * DETECTION_DECAY_PER_SECOND,
    );
    expect(accrueDetection(0.01, false, 1, 2, detWorld())).toBe(0);
  });

  it("reports the sighting to the alert FSM on reaching 1, at the player's tile", () => {
    const alert = new AlertState();
    expect(alert.phase).toBe("INFILTRATION");
    accrueDetection(0.99, true, 1, 2, detWorld({ alert }));
    expect(alert.phase).toBe("ALERT");
    expect(alert.lastKnownTile).toEqual({ x: 3, y: 4 });
  });

  it("does not report while still filling", () => {
    const alert = new AlertState();
    accrueDetection(0, true, 0.1, 2, detWorld({ alert }));
    expect(alert.phase).toBe("INFILTRATION");
  });
});

describe("canSense — benchmark", () => {
  it("benchmarks execution time of canSense to document performance gains", () => {
    const e = eye();
    const w = world();
    const iterations = 100_000;

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      canSense(e, w);
    }
    const duration = performance.now() - start;
    console.log(`[BENCHMARK] canSense (${iterations} calls): ${duration.toFixed(2)}ms`);
    expect(duration).toBeGreaterThan(0);
  });
});

describe("canSense — the beam", () => {
  /** The eye is at the origin looking east; the beam range is 10 tiles of it. */
  const lit = (over: Partial<SensingWorld> = {}): SensingWorld =>
    world({ beamGiveawayPx: 10 * TILE, ...over });

  it("betrays a player standing behind the guard", () => {
    // The case the 1.8x multiplier never covered: `accrueDetection` is gated on
    // this function, so a beam shone past somebody facing away used to cost
    // nothing at all.
    const behind = lit({ player: { x: -5 * TILE, y: 0 } });
    expect(canSense(eye(), world({ player: { x: -5 * TILE, y: 0 } }))).toBe(false);
    expect(canSense(eye(), behind)).toBe(true);
  });

  it("betrays a player beyond the guard's own sight range", () => {
    // 8 tiles out, against a 6.5-tile eye. Light carries further than the thing
    // holding it, which is the whole reason the range is its own number.
    const far = { player: { x: 8 * TILE, y: 0 } };
    expect(canSense(eye({ rangeTiles: 6.5 }), world(far))).toBe(false);
    expect(canSense(eye({ rangeTiles: 6.5 }), lit(far))).toBe(true);
  });

  it("is not hidden by concealment — that is the point of the tradeoff", () => {
    // A torch shining out of the crate you are crouched behind is not the problem
    // concealment solves. Turning it off is meant to be the only counterplay.
    expect(canSense(eye(), lit({ playerConcealed: true }))).toBe(true);
    expect(canSense(eye(), world({ playerConcealed: true }))).toBe(false);
  });

  it("stops at its range", () => {
    expect(canSense(eye({ rangeTiles: 1 }), lit({ player: { x: 11 * TILE, y: 0 } }))).toBe(false);
    expect(canSense(eye({ rangeTiles: 1 }), lit({ player: { x: 9 * TILE, y: 0 } }))).toBe(true);
  });

  it("needs line of sight, like every other path", () => {
    const blind = { grid: { hasLineOfSight: () => false } };
    expect(canSense(eye(), lit({ ...blind, player: { x: -5 * TILE, y: 0 } }))).toBe(false);
  });

  it("does nothing while the beam is off", () => {
    // Absent and zero both mean off, and every eye on a level nobody carries a
    // torch on takes this path.
    const behind = { player: { x: -5 * TILE, y: 0 } };
    expect(canSense(eye(), world(behind))).toBe(false);
    expect(canSense(eye(), world({ ...behind, beamGiveawayPx: 0 }))).toBe(false);
  });

  it("still loses to compliance, and to an EMP", () => {
    // Both short-circuit above every path. A compliant Rowan holding a torch is
    // staff doing their job, and a blinded guard is blinded.
    expect(canSense(eye(), lit({ playerCompliant: true }))).toBe(false);
    expect(
      canSense(eye(), lit({ chaffZone: { x: 0, y: 0, radiusPx: 2 * TILE } })),
    ).toBe(false);
  });

  it("does not cross between walk surfaces", () => {
    expect(canSense(eye({ plane: 1 }), lit({ playerPlane: 0 }))).toBe(false);
  });
});
