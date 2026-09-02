import { describe, it, expect } from "vitest";
import { PowerControl, type PowerWorld } from "./PowerControl";
import { initialPowerGrid, isCircuitClosed, type PowerGridState } from "../../systems/PowerGrid";
import type { LightSwitch } from "../../entities/LightSwitch";

/**
 * The three ways the lights go out, and the one funnel they all go through.
 *
 * The wiring these cover is the whole reason `PowerControl` grew past a two-line
 * pass-through: a breaker names a *wing* and a switch names a *zone*, but `Lighting`
 * and `DetectionSystem` only know how to match one ref at a time. The expansion has
 * to happen here, and it has to happen for both halves or a blackout is a lie in one
 * direction — pitch dark but still easy to spot, or fully lit but unseeable.
 */

/** Records what each half was told, so the two can be compared. */
function spyWorld(circuits: Record<string, string[]> = {}): {
  world: PowerWorld;
  lit: Map<string, boolean>;
  seen: Map<string, boolean>;
  grid: PowerGridState;
  noises: { x: number; y: number; radius: number }[];
  violations: number;
} {
  const lit = new Map<string, boolean>();
  const seen = new Map<string, boolean>();
  const grid = initialPowerGrid();
  const noises: { x: number; y: number; radius: number }[] = [];
  const state = { violations: 0 };

  const world: PowerWorld = {
    tileSize: () => 16,
    levelName: () => "duct1",
    lighting: () =>
      ({ setCircuit: (ref: string, on: boolean) => lit.set(ref, on) }) as never,
    detection: () =>
      ({ setCircuit: (ref: string, on: boolean) => seen.set(ref, on) }) as never,
    orderlies: () => [],
    noise: () =>
      ({ emitAt: (x: number, y: number, radius: number) => noises.push({ x, y, radius }) }) as never,
    powerGrid: () => grid,
    violateUnauthorized: () => {
      state.violations += 1;
    },
    circuitsFor: (target) => circuits[target] ?? [target],
  };
  return {
    world,
    lit,
    seen,
    grid,
    noises,
    get violations() {
      return state.violations;
    },
  };
}

const fakeSwitch = (target: string, closed = true): LightSwitch => {
  let state = closed;
  return {
    x: 32,
    y: 48,
    stats: { target, closed },
    get isClosed() {
      return state;
    },
    toggle: () => {
      state = !state;
      return state;
    },
  } as unknown as LightSwitch;
};

describe("PowerControl.setCircuit — a wing is several circuits", () => {
  it("expands a wing target into every zone under it", () => {
    const w = spyWorld({ "duct1__wing_00": ["duct1__z0_0", "duct1__z1_0", "duct1__z0_1"] });
    new PowerControl(w.world).setCircuit("duct1__wing_00", false);

    expect([...w.lit.entries()].sort()).toEqual([
      ["duct1__z0_0", false],
      ["duct1__z0_1", false],
      ["duct1__z1_0", false],
    ]);
  });

  it("moves the visible half and the mechanical half together", () => {
    const w = spyWorld({ "duct1__wing_00": ["duct1__z0_0", "duct1__z1_0"] });
    new PowerControl(w.world).setCircuit("duct1__wing_00", false);
    // A blackout that moved only one of these would be a lie in one direction.
    expect([...w.seen.entries()].sort()).toEqual([...w.lit.entries()].sort());
  });

  it("passes a target that names no wing straight through as its own circuit", () => {
    // Which is every target on a map with no derived lighting — `main1`'s breaker
    // still names `light_overhead1`, and this layer must cost it nothing.
    const w = spyWorld();
    new PowerControl(w.world).setCircuit("light_overhead1", false);
    expect([...w.lit.entries()]).toEqual([["light_overhead1", false]]);
  });
});

describe("PowerControl.flipSwitch — the quiet control", () => {
  it("darkens only the zone it names", () => {
    const w = spyWorld({ "duct1__wing_00": ["duct1__z0_0", "duct1__z1_0"] });
    new PowerControl(w.world).flipSwitch(fakeSwitch("duct1__z0_0"));
    expect([...w.lit.entries()]).toEqual([["duct1__z0_0", false]]);
  });

  it("charges nobody and calls nobody — that is what it buys", () => {
    const w = spyWorld();
    const control = new PowerControl(w.world);
    control.flipSwitch(fakeSwitch("duct1__z0_0"));

    // No breach: touching a light switch is not evidence of anything.
    expect(w.violations).toBe(0);
    // And nobody is dispatched, so there is no reset to run down. A breaker
    // leaves one outstanding here; a switch must not.
    control.updateResets(9999);
    expect([...w.lit.entries()]).toEqual([["duct1__z0_0", false]]);
  });

  it("is heard, but only just", () => {
    const w = spyWorld();
    new PowerControl(w.world).flipSwitch(fakeSwitch("duct1__z0_0"));
    expect(w.noises).toHaveLength(1);
    // Two tiles at 16px — a fifth of the breaker's seven, and quieter than a door.
    expect(w.noises[0].radius).toBe(32);
  });

  it("persists the throw, so the room is still dark on the way back", () => {
    const w = spyWorld();
    new PowerControl(w.world).flipSwitch(fakeSwitch("duct1__z0_0"));
    expect(isCircuitClosed(w.grid, "duct1", "duct1__z0_0", true)).toBe(false);
    // Level-scoped: the same zone name on another deck is a different circuit.
    expect(isCircuitClosed(w.grid, "duct2", "duct1__z0_0", true)).toBe(true);
  });

  it("flips back on a second tap", () => {
    const w = spyWorld();
    const control = new PowerControl(w.world);
    const sw = fakeSwitch("duct1__z0_0");
    control.flipSwitch(sw);
    control.flipSwitch(sw);
    expect(w.lit.get("duct1__z0_0")).toBe(true);
    expect(isCircuitClosed(w.grid, "duct1", "duct1__z0_0", true)).toBe(true);
  });
});

describe("PowerControl.cutCircuits — the remote control", () => {
  it("cuts every circuit named and records each", () => {
    const w = spyWorld();
    new PowerControl(w.world).cutCircuits(["duct1__z0_0", "duct1__z1_0"]);
    expect([...w.lit.entries()].sort()).toEqual([
      ["duct1__z0_0", false],
      ["duct1__z1_0", false],
    ]);
    expect(isCircuitClosed(w.grid, "duct1", "duct1__z1_0", true)).toBe(false);
  });

  it("does nothing when the hack landed in an already-dark room", () => {
    const w = spyWorld();
    new PowerControl(w.world).cutCircuits([]);
    expect(w.lit.size).toBe(0);
  });
});

describe("PowerControl.restore — what a level rebuild puts back", () => {
  it("re-applies a throw that had no fixture behind it", () => {
    // The bug this replaced: the old re-apply walked the *breakers*, so a zone
    // killed by a switch or a terminal came back lit on every level change.
    const w = spyWorld();
    const control = new PowerControl(w.world);
    control.cutCircuits(["duct1__z2_1"]);
    w.lit.clear();

    control.restore("duct1");
    expect(w.lit.get("duct1__z2_1")).toBe(false);
    expect(w.seen.get("duct1__z2_1")).toBe(false);
  });

  it("expands a persisted wing throw back into its zones", () => {
    const w = spyWorld({ "duct1__wing_00": ["duct1__z0_0", "duct1__z1_0"] });
    const control = new PowerControl(w.world);
    control.cutCircuits(["duct1__wing_00"]);
    w.lit.clear();

    control.restore("duct1");
    expect([...w.lit.entries()].sort()).toEqual([
      ["duct1__z0_0", false],
      ["duct1__z1_0", false],
    ]);
  });

  it("leaves another deck's circuits alone", () => {
    const w = spyWorld();
    const control = new PowerControl(w.world);
    control.cutCircuits(["duct1__z0_0"]);
    w.lit.clear();

    control.restore("main1");
    expect(w.lit.size).toBe(0);
  });

  it("restores nothing on a level nobody has touched", () => {
    const w = spyWorld();
    new PowerControl(w.world).restore("duct1");
    expect(w.lit.size).toBe(0);
  });
});
