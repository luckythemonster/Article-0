import { describe, it, expect } from "vitest";
import { PowerControl, type PowerWorld } from "./PowerControl";
import {
  initialPowerGrid,
  isCircuitClosed,
  isHacked,
  type PowerGridState,
} from "../../systems/PowerGrid";
import { emergencyRef } from "../../map/AutoLight";
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
function spyWorld(
  circuits: Record<string, string[]> = {},
  plates: LightSwitch[] = [],
): {
  world: PowerWorld;
  lit: Map<string, boolean>;
  seen: Map<string, boolean>;
  grid: PowerGridState;
  noises: { x: number; y: number; radius: number }[];
  violations: number;
  plates: LightSwitch[];
} {
  const lit = new Map<string, boolean>();
  const seen = new Map<string, boolean>();
  const grid = initialPowerGrid();
  const noises: { x: number; y: number; radius: number }[] = [];
  const state = { violations: 0 };
  // The reverse of `circuits`, which is what `PowerControl` reads to find the wing
  // above a zone — see `PowerWorld.zoneWings`.
  const wings = new Map<string, string>();
  for (const [wing, zones] of Object.entries(circuits)) {
    for (const zone of zones) wings.set(zone, wing);
  }

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
    zoneWings: () => wings,
    lightSwitches: () => plates,
  };
  return {
    world,
    lit,
    seen,
    grid,
    noises,
    plates,
    get violations() {
      return state.violations;
    },
  };
}

/**
 * A plate with the two bits the real one carries: its own position, and whether
 * anything is feeding it. `PowerControl` writes the second and reads neither.
 */
const fakeSwitch = (target: string, closed = true): LightSwitch => {
  let position = closed;
  let live = true;
  return {
    x: 32,
    y: 48,
    stats: { target, closed },
    get isClosed() {
      return position;
    },
    get isLive() {
      return live;
    },
    setLive: (next: boolean) => {
      live = next;
    },
    toggle: () => {
      position = !position;
      return position;
    },
  } as unknown as LightSwitch;
};

/** A zone wired under one wing, with a plate on it — the shape a derived deck has. */
const WING = "duct1__wing_00";
const ZONE = "duct1__z0_0";
const OTHER = "duct1__z1_0";
const EMERGENCY = emergencyRef(ZONE);
const wired = { [WING]: [ZONE, OTHER] };

/** What the lighting was last told about one zone: its overhead and its lamp. */
const readZone = (w: ReturnType<typeof spyWorld>, zone = ZONE) => ({
  overhead: w.lit.get(zone),
  emergency: w.lit.get(emergencyRef(zone)),
});

describe("PowerControl — the two bits a zone carries", () => {
  /**
   * The whole mechanic, as a table. A zone's plate can be off, and a zone can have
   * no power reaching it at all, and those are independent — collapsing them into
   * one boolean is exactly what made a switched-off room and a blacked-out one look
   * identical, and it is what a future change would most easily undo.
   */
  it("plate on, powered: overhead on, lamp off", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    new PowerControl(w.world).restore("duct1");
    expect(readZone(w)).toEqual({ overhead: true, emergency: false });
  });

  it("plate off, powered: overhead off, lamp ON — the room goes dim, not dark", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    new PowerControl(w.world).flipSwitch(w.plates[0]);
    expect(readZone(w)).toEqual({ overhead: false, emergency: true });
  });

  it("plate on, wing dead: both off — a breaker takes the lamp with it", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    new PowerControl(w.world).setCircuit(WING, false);
    expect(readZone(w)).toEqual({ overhead: false, emergency: false });
  });

  it("plate off, wing dead: both off — the lamp needs power like anything else", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    const control = new PowerControl(w.world);
    control.flipSwitch(w.plates[0]);
    control.setCircuit(WING, false);
    expect(readZone(w)).toEqual({ overhead: false, emergency: false });
  });

  it("plate on, hacked: both off", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    new PowerControl(w.world).cutCircuits([ZONE]);
    expect(readZone(w)).toEqual({ overhead: false, emergency: false });
  });

  it("plate off, hacked: both off — a hack outranks the plate under it", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    const control = new PowerControl(w.world);
    control.flipSwitch(w.plates[0]);
    control.cutCircuits([ZONE]);
    expect(readZone(w)).toEqual({ overhead: false, emergency: false });
  });

  it("restoring the wing brings a switched-off room back to its lamp, not its overhead", () => {
    // The plate's own position survives the wing going out and coming back — that
    // is what makes the two bits independent rather than one masking the other.
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    const control = new PowerControl(w.world);
    control.flipSwitch(w.plates[0]);
    control.setCircuit(WING, false);
    control.setCircuit(WING, true);
    expect(readZone(w)).toEqual({ overhead: false, emergency: true });
  });

  it("moves the visible half and the mechanical half together, always", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    const control = new PowerControl(w.world);
    control.restore("duct1");
    control.flipSwitch(w.plates[0]);
    control.setCircuit(WING, false);
    // A blackout that moved only one of these would be a lie in one direction.
    expect([...w.seen.entries()].sort()).toEqual([...w.lit.entries()].sort());
  });
});

describe("PowerControl — what the plate reads", () => {
  it("stays live while its own wing has power", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    new PowerControl(w.world).flipSwitch(w.plates[0]);
    expect(w.plates[0].isLive).toBe(true);
  });

  it("goes dead when the wing above it is thrown", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    new PowerControl(w.world).setCircuit(WING, false);
    expect(w.plates[0].isLive).toBe(false);
  });

  it("goes dead when a terminal cuts its zone", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    new PowerControl(w.world).cutCircuits([ZONE]);
    expect(w.plates[0].isLive).toBe(false);
  });

  it("comes back live when the breaker is put back", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    const control = new PowerControl(w.world);
    control.setCircuit(WING, false);
    control.setCircuit(WING, true);
    expect(w.plates[0].isLive).toBe(true);
  });

  it("never comes back from a hack — nothing in the game restores one", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    const control = new PowerControl(w.world);
    control.cutCircuits([ZONE]);
    control.setCircuit(WING, true);
    expect(w.plates[0].isLive).toBe(false);
  });

  it("leaves a plate on another zone alone", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE), fakeSwitch(OTHER)]);
    new PowerControl(w.world).cutCircuits([ZONE]);
    expect(w.plates[1].isLive).toBe(true);
  });
});

describe("PowerControl.setCircuit — a wing is several zones", () => {
  it("expands a wing target into every zone under it", () => {
    const w = spyWorld({ [WING]: [ZONE, OTHER, "duct1__z0_1"] });
    new PowerControl(w.world).setCircuit(WING, false);
    expect([ZONE, OTHER, "duct1__z0_1"].map((z) => w.lit.get(z))).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("records the lever it moved, so a level rebuild finds it", () => {
    const w = spyWorld(wired);
    new PowerControl(w.world).setCircuit(WING, false);
    expect(isCircuitClosed(w.grid, "duct1", WING, true)).toBe(false);
  });

  it("passes a target that names no wing straight through as its own circuit", () => {
    // Which is every target on a map with no derived lighting — `main1`'s breaker
    // still names `light_overhead1`, and this layer must cost it nothing. With no
    // wing above it there is nothing to fail, so its own lever decides everything.
    const w = spyWorld();
    new PowerControl(w.world).setCircuit("light_overhead1", false);
    expect(w.lit.get("light_overhead1")).toBe(false);
  });
});

describe("PowerControl.flipSwitch — the quiet control", () => {
  it("touches only the zone it names", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    new PowerControl(w.world).flipSwitch(w.plates[0]);
    expect(w.lit.get(OTHER)).toBeUndefined();
  });

  it("charges nobody and calls nobody — that is what it buys", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    const control = new PowerControl(w.world);
    control.flipSwitch(w.plates[0]);

    // No breach: touching a light switch is not evidence of anything.
    expect(w.violations).toBe(0);
    // And nobody is dispatched, so there is no reset to run down. A breaker
    // leaves one outstanding here; a switch must not.
    control.updateResets(9999);
    expect(readZone(w)).toEqual({ overhead: false, emergency: true });
  });

  it("is heard, but only just", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    new PowerControl(w.world).flipSwitch(w.plates[0]);
    expect(w.noises).toHaveLength(1);
    // Two tiles at 16px — a fifth of the breaker's seven, and quieter than a door.
    expect(w.noises[0].radius).toBe(32);
  });

  it("persists the throw, so the room is still dim on the way back", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    new PowerControl(w.world).flipSwitch(w.plates[0]);
    expect(isCircuitClosed(w.grid, "duct1", ZONE, true)).toBe(false);
    // Level-scoped: the same zone name on another deck is a different circuit.
    expect(isCircuitClosed(w.grid, "duct2", ZONE, true)).toBe(true);
  });

  it("flips back on a second tap", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    const control = new PowerControl(w.world);
    control.flipSwitch(w.plates[0]);
    control.flipSwitch(w.plates[0]);
    expect(readZone(w)).toEqual({ overhead: true, emergency: false });
  });
});

describe("PowerControl.cutCircuits — the remote control", () => {
  it("records a hack rather than a lever position", () => {
    // The distinction is the mechanic: a lever would read `OFF` and come up on
    // emergency lighting, and a hacked room has to stay dark and read `NO_POWER`.
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    new PowerControl(w.world).cutCircuits([ZONE]);
    expect(isHacked(w.grid, "duct1", ZONE)).toBe(true);
    expect(isCircuitClosed(w.grid, "duct1", ZONE, true)).toBe(true);
  });

  it("maps an emergency lamp back to its zone", () => {
    // `refsWithin` reports whatever is *lit* near the panel, and in a room that is
    // already switched off that is the lamp. Cutting only the lamp would leave the
    // zone able to come back on.
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    const control = new PowerControl(w.world);
    control.flipSwitch(w.plates[0]);
    control.cutCircuits([EMERGENCY]);
    expect(isHacked(w.grid, "duct1", ZONE)).toBe(true);
    expect(readZone(w)).toEqual({ overhead: false, emergency: false });
  });

  it("cuts each zone once when both of its refs arrive together", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    new PowerControl(w.world).cutCircuits([ZONE, EMERGENCY]);
    expect(isHacked(w.grid, "duct1", ZONE)).toBe(true);
  });

  it("does nothing when the hack landed in an already-dark room", () => {
    const w = spyWorld(wired);
    new PowerControl(w.world).cutCircuits([]);
    expect(w.lit.size).toBe(0);
  });
});

describe("PowerControl.restore — what a level rebuild puts back", () => {
  it("turns every emergency lamp off, including on zones nobody has touched", () => {
    // The one `restore` exists for now: `Lighting` and `DetectionSystem` build every
    // fixture powered, so a lamp that should start dark has to be told.
    const w = spyWorld(wired);
    new PowerControl(w.world).restore("duct1");
    expect(w.lit.get(emergencyRef(ZONE))).toBe(false);
    expect(w.lit.get(emergencyRef(OTHER))).toBe(false);
    expect(w.lit.get(ZONE)).toBe(true);
  });

  it("re-applies a throw that had no fixture behind it", () => {
    // The bug this replaced: the old re-apply walked the *breakers*, so a zone
    // killed by a switch or a terminal came back lit on every level change.
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    const control = new PowerControl(w.world);
    control.cutCircuits([ZONE]);
    w.lit.clear();

    control.restore("duct1");
    expect(readZone(w)).toEqual({ overhead: false, emergency: false });
    expect(w.seen.get(ZONE)).toBe(false);
  });

  it("brings a switched-off zone back on its lamp", () => {
    const w = spyWorld(wired, [fakeSwitch(ZONE)]);
    const control = new PowerControl(w.world);
    control.flipSwitch(w.plates[0]);
    w.lit.clear();

    control.restore("duct1");
    expect(readZone(w)).toEqual({ overhead: false, emergency: true });
  });

  it("expands a persisted wing throw back over its zones", () => {
    const w = spyWorld(wired);
    const control = new PowerControl(w.world);
    control.setCircuit(WING, false);
    w.lit.clear();

    control.restore("duct1");
    expect([w.lit.get(ZONE), w.lit.get(OTHER)]).toEqual([false, false]);
  });

  it("leaves another deck's circuits alone", () => {
    const w = spyWorld();
    const control = new PowerControl(w.world);
    control.setCircuit("light_overhead1", false);
    w.lit.clear();

    control.restore("main1");
    expect(w.lit.size).toBe(0);
  });

  it("restores nothing on a level with neither zones nor overrides", () => {
    const w = spyWorld();
    new PowerControl(w.world).restore("duct1");
    expect(w.lit.size).toBe(0);
  });
});
