import { describe, it, expect } from "vitest";
import { VENT4_DEFAULTS } from "./EntityStats";
import { suctionVelocity, Vent4PhysicsSystem, type Vent4Layout } from "./Vent4PhysicsSystem";

const TS = 32;
const HUB = { x: 20 * TS, y: 20 * TS };

function layout(partial: Partial<Vent4Layout> = {}): Vent4Layout {
  return { hub: HUB, columns: [], pitons: [], drips: [], ...partial };
}

const calm = { suction: false, purge: false, holdingPiton: false };
const sucking = { ...calm, suction: true };
const purging = { ...calm, purge: true };

describe("suctionVelocity", () => {
  it("points toward the hub", () => {
    const v = suctionVelocity(HUB.x - 5 * TS, HUB.y, HUB, TS);
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeCloseTo(0);
  });

  it("is zero at and beyond the suction radius, and ramps up toward the hub", () => {
    const atEdge = suctionVelocity(HUB.x - VENT4_DEFAULTS.suctionRadius * TS, HUB.y, HUB, TS);
    expect(atEdge).toEqual({ x: 0, y: 0 });
    const far = suctionVelocity(HUB.x - 9 * TS, HUB.y, HUB, TS);
    const near = suctionVelocity(HUB.x - 3 * TS, HUB.y, HUB, TS);
    expect(Math.hypot(near.x, near.y)).toBeGreaterThan(Math.hypot(far.x, far.y));
  });

  it("peaks at suctionMax from the hub-edge inward", () => {
    const v = suctionVelocity(HUB.x - VENT4_DEFAULTS.hubRadius * TS, HUB.y, HUB, TS);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(VENT4_DEFAULTS.suctionMax * TS);
  });
});

describe("Vent4PhysicsSystem", () => {
  it("applies no force and regenerates grip while suction is off", () => {
    const sys = new Vent4PhysicsSystem(layout(), TS);
    sys.grip = 0.5;
    const f = sys.update(1, HUB.x - 5 * TS, HUB.y, calm);
    expect(f.vx).toBe(0);
    expect(f.vy).toBe(0);
    expect(sys.grip).toBeGreaterThan(0.5);
  });

  it("pulls and drains grip under un-anchored suction; exhausted grip pulls harder", () => {
    const sys = new Vent4PhysicsSystem(layout(), TS);
    const px = HUB.x - 5 * TS;
    const f1 = sys.update(0.1, px, HUB.y, sucking);
    expect(f1.vx).toBeGreaterThan(0);
    expect(f1.anchored).toBe(false);
    expect(sys.grip).toBeLessThan(1);
    sys.grip = 0.0001; // one more tick exhausts it
    const weak = suctionVelocity(px, HUB.y, HUB, TS).x;
    const f2 = sys.update(0.1, px, HUB.y, sucking);
    expect(f2.vx).toBeCloseTo(weak * VENT4_DEFAULTS.exhaustedPullMultiplier, 3);
  });

  it("zeroes pull when hugging a steel column, and refills grip there", () => {
    const column = { x: HUB.x - 6 * TS, y: HUB.y };
    const sys = new Vent4PhysicsSystem(layout({ columns: [column] }), TS);
    sys.grip = 0.2;
    const f = sys.update(0.5, column.x + 1.05 * TS, column.y, sucking);
    expect(f.anchored).toBe(true);
    expect(f.vx).toBe(0);
    expect(sys.grip).toBeGreaterThan(0.2);
  });

  it("zeroes pull while holding a piton", () => {
    const sys = new Vent4PhysicsSystem(layout(), TS);
    const f = sys.update(0.5, HUB.x - 5 * TS, HUB.y, { ...sucking, holdingPiton: true });
    expect(f.anchored).toBe(true);
    expect(f.vx).toBe(0);
  });

  it("finds the nearest piton within range only", () => {
    const pitons = [
      { x: HUB.x - 10 * TS, y: HUB.y },
      { x: HUB.x - 4 * TS, y: HUB.y },
    ];
    const sys = new Vent4PhysicsSystem(layout({ pitons }), TS);
    expect(sys.nearestPiton(HUB.x - 5 * TS, HUB.y, 1.4)).toBe(1);
    expect(sys.nearestPiton(HUB.x - 20 * TS, HUB.y, 1.4)).toBeNull();
  });

  it("decays impulses toward zero across frames", () => {
    const sys = new Vent4PhysicsSystem(layout(), TS);
    sys.addImpulse(300, 0);
    const f1 = sys.update(0.016, HUB.x - 20 * TS, HUB.y, calm);
    expect(f1.vx).toBeGreaterThan(0);
    let last = f1.vx;
    for (let i = 0; i < 60; i++) last = sys.update(0.016, HUB.x - 20 * TS, HUB.y, calm).vx;
    expect(last).toBeLessThan(1);
  });

  it("builds heat during the purge and cools it twice as fast outside", () => {
    const sys = new Vent4PhysicsSystem(layout(), TS);
    sys.update(VENT4_DEFAULTS.heatTime / 2, HUB.x - 8 * TS, HUB.y, purging);
    expect(sys.heat).toBeCloseTo(0.5);
    sys.update(VENT4_DEFAULTS.heatTime, HUB.x - 8 * TS, HUB.y, purging);
    expect(sys.heat).toBe(1);
    sys.update(VENT4_DEFAULTS.heatTime / 4, HUB.x - 8 * TS, HUB.y, calm);
    expect(sys.heat).toBeCloseTo(0.5);
  });

  it("zeroes heat and thermal signature under a condensate drip", () => {
    const drip = { x: HUB.x - 8 * TS, y: HUB.y };
    const sys = new Vent4PhysicsSystem(layout({ drips: [drip] }), TS);
    sys.update(VENT4_DEFAULTS.heatTime, HUB.x - 12 * TS, HUB.y, purging);
    expect(sys.thermalVisible).toBe(true);
    sys.update(0.1, drip.x, drip.y, purging);
    expect(sys.heat).toBe(0);
    expect(sys.thermalVisible).toBe(false);
    expect(sys.thermalNullLeft).toBe(VENT4_DEFAULTS.dripCoolDuration);
    // The null window ticks away and heat rebuilds once off the drip.
    sys.update(VENT4_DEFAULTS.dripCoolDuration + VENT4_DEFAULTS.heatTime / 2, HUB.x - 12 * TS, HUB.y, purging);
    expect(sys.thermalVisible).toBe(true);
  });

  it("flags the intake damage zone only while suction is on", () => {
    const sys = new Vent4PhysicsSystem(layout(), TS);
    const px = HUB.x - VENT4_DEFAULTS.intakeRadius * TS * 0.5;
    expect(sys.update(0.016, px, HUB.y, sucking).inIntake).toBe(true);
    expect(sys.update(0.016, px, HUB.y, calm).inIntake).toBe(false);
    const outside = HUB.x - (VENT4_DEFAULTS.intakeRadius + 1) * TS;
    expect(sys.update(0.016, outside, HUB.y, sucking).inIntake).toBe(false);
  });
});
