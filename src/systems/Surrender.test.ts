import { describe, it, expect } from "vitest";
import {
  aimedAt,
  canHoldUp,
  escortPoint,
  SurrenderAim,
  type Aimer,
  type Surrenderable,
  type SurrenderWorld,
} from "./Surrender";
import {
  ESCORT_STANDOFF_TILES,
  HOLD_UP_REACH_TILES,
  HOLD_UP_RELEASE_TILES,
  STAPLER_ITEM,
  STUN_ROUNDS_ITEM,
} from "./EntityStats";

const TILE = 32;

/** A world with the given line-of-sight answer for every ray. */
function world(hasLos: boolean): SurrenderWorld {
  return { tileSize: TILE, grid: { hasLineOfSight: () => hasLos } };
}

/** Rowan at the origin, facing due east unless told otherwise. */
function rowan(facing = 0): Aimer {
  return { x: 0, y: 0, facing };
}

function orderly(x: number, y: number, canSurrender = true): Surrenderable {
  return { x, y, canSurrender };
}

describe("aimedAt", () => {
  it("finds nobody when nobody is in front of you", () => {
    expect(aimedAt(rowan(), [], world(true))).toBeNull();
  });

  it("takes the nearest eligible orderly inside the arc", () => {
    const near = orderly(TILE, 0);
    const far = orderly(2 * TILE, 0);
    expect(aimedAt(rowan(), [far, near], world(true))).toBe(near);
  });

  it("ignores one standing behind Rowan's shoulder", () => {
    const behind = orderly(-TILE, 0);
    expect(aimedAt(rowan(), [behind], world(true))).toBeNull();
  });

  it("ignores one through a wall — you cannot point a weapon at a rumour", () => {
    const unseen = orderly(TILE, 0);
    expect(aimedAt(rowan(), [unseen], world(false))).toBeNull();
  });

  it("ignores one out past the reach: a threat is made close, or not at all", () => {
    const justInside = orderly((HOLD_UP_REACH_TILES - 0.5) * TILE, 0);
    expect(aimedAt(rowan(), [justInside], world(true))).toBe(justInside);

    const justOutside = orderly((HOLD_UP_REACH_TILES + 0.5) * TILE, 0);
    expect(aimedAt(rowan(), [justOutside], world(true))).toBeNull();
  });

  it("ignores one who cannot surrender — already reported you, or already frozen", () => {
    const spent = orderly(TILE, 0, false);
    expect(aimedAt(rowan(), [spent], world(true))).toBeNull();
  });

  it("holds someone standing on top of you, rather than asking which way east is", () => {
    const underfoot = orderly(0, 0);
    expect(aimedAt(rowan(), [underfoot], world(true))).toBe(underfoot);
  });
});

describe("aimedAt, with an established hold", () => {
  it("keeps the orderly it acquired even when a second wanders closer", () => {
    const held = orderly(2 * TILE, 0);
    const interloper = orderly(TILE, 0);
    expect(aimedAt(rowan(), [interloper, held], world(true), held)).toBe(held);
  });

  it("keeps a hold that drifts past the acquire reach but not past the release reach", () => {
    const drifted = orderly((HOLD_UP_REACH_TILES + 1) * TILE, 0);
    expect(HOLD_UP_REACH_TILES + 1).toBeLessThan(HOLD_UP_RELEASE_TILES);
    expect(aimedAt(rowan(), [drifted], world(true), drifted)).toBe(drifted);

    const gone = orderly((HOLD_UP_RELEASE_TILES + 1) * TILE, 0);
    expect(aimedAt(rowan(), [gone], world(true), gone)).toBeNull();
  });

  it("keeps a hold that swings wide rounding a corner, past the acquire arc", () => {
    // 60° off Rowan's axis: outside the 90° acquire arc, inside the 160° release arc.
    const wide = orderly(TILE * Math.cos(Math.PI / 3), TILE * Math.sin(Math.PI / 3));
    expect(aimedAt(rowan(), [wide], world(true))).toBeNull();
    expect(aimedAt(rowan(), [wide], world(true), wide)).toBe(wide);
  });

  it("drops the target the instant a wall comes between them", () => {
    const held = orderly(TILE, 0);
    expect(aimedAt(rowan(), [held], world(false), held)).toBeNull();
  });
});

describe("canHoldUp", () => {
  it("needs a weapon in the bag — a mop is not a threat", () => {
    expect(canHoldUp([])).toBe(false);
    expect(canHoldUp(["Medkit", "Battery"])).toBe(false);
  });

  it("takes either weapon, since either one is a thing pointed at a person", () => {
    expect(canHoldUp([STUN_ROUNDS_ITEM])).toBe(true);
    expect(canHoldUp([STAPLER_ITEM])).toBe(true);
  });
});

describe("escortPoint", () => {
  it("marches the escort a fixed standoff ahead of the aimer's facing", () => {
    const p = escortPoint(rowan(0), ESCORT_STANDOFF_TILES, TILE);
    expect(p.x).toBeCloseTo(ESCORT_STANDOFF_TILES * TILE);
    expect(p.y).toBeCloseTo(0);
  });

  it("swings with the facing, so pushing the stick pushes the man", () => {
    const p = escortPoint(rowan(Math.PI / 2), ESCORT_STANDOFF_TILES, TILE);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(ESCORT_STANDOFF_TILES * TILE);
  });
});

describe("SurrenderAim", () => {
  it("holds nobody until the aim goes down", () => {
    const aim = new SurrenderAim();
    const near = orderly(TILE, 0);
    const r = aim.update(0.1, false, rowan(), [near], world(true));
    expect(r.target).toBeNull();
    // Still advertised, so the prompt can offer the verb before the key is pressed.
    expect(r.candidate).toBe(near);
  });

  it("reports the acquisition once, not on every frame of the hold", () => {
    const aim = new SurrenderAim();
    const near = orderly(TILE, 0);
    expect(aim.update(0.1, true, rowan(), [near], world(true)).acquired).toBe(true);
    expect(aim.update(0.1, true, rowan(), [near], world(true)).acquired).toBe(false);
  });

  it("drops the target when the aim comes off, and holds nobody after", () => {
    const aim = new SurrenderAim();
    const near = orderly(TILE, 0);
    aim.update(0.1, true, rowan(), [near], world(true));
    expect(aim.update(0.1, false, rowan(), [near], world(true)).target).toBeNull();
    expect(aim.target).toBeNull();
  });

  it("banks held seconds only while the aim is on one person", () => {
    const aim = new SurrenderAim();
    const near = orderly(TILE, 0);
    aim.update(0.5, true, rowan(), [near], world(true));
    aim.update(0.5, true, rowan(), [near], world(true));
    expect(aim.heldSeconds).toBeCloseTo(1);

    aim.update(0.5, false, rowan(), [near], world(true));
    expect(aim.heldSeconds).toBe(0);
  });

  it("restarts the clock when the aim moves to somebody else", () => {
    const aim = new SurrenderAim();
    // Mutable, because the case being modelled is the *same man* becoming ineligible
    // mid-hold — which is how every real transition out of a hold happens (a dart, a
    // staple, an alarm already raised), and is what stickiness has to fall through on.
    const first: { x: number; y: number; canSurrender: boolean } = {
      x: TILE,
      y: 0,
      canSurrender: true,
    };
    const second = orderly(2 * TILE, 0);
    aim.update(0.5, true, rowan(), [first, second], world(true));
    aim.update(0.5, true, rowan(), [first, second], world(true));
    expect(aim.target).toBe(first);
    expect(aim.heldSeconds).toBeCloseTo(1);

    first.canSurrender = false; // darted out from under the aim
    const r = aim.update(0.5, true, rowan(), [first, second], world(true));
    expect(r.target).toBe(second);
    expect(r.acquired).toBe(true);
    expect(aim.heldSeconds).toBeCloseTo(0.5);
  });
});
