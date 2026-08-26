import { describe, it, expect } from "vitest";
import {
  BATTERY_ITEM,
  CHAFF_PACK_ITEM,
  consumableSlots,
  CONSUMABLE_ORDER,
  countConsumables,
  enforcerStatsFor,
  ENFORCER_DEFAULTS,
  ESCORT_SPEED_MULTIPLIER,
  ESCORT_WALK_TILES,
  HOLD_UP_ARC_DEGREES,
  HOLD_UP_GRACE_SECONDS,
  HOLD_UP_REACH_TILES,
  HOLD_UP_RELEASE_ARC_DEGREES,
  HOLD_UP_RELEASE_TILES,
  MAX_CONSUMABLES,
  paced,
  PLAYER_WALK_TILES,
  RATION_PACK_ITEM,
  SACK_LUNCH_ITEM,
  STAPLER_FIELD_MAX_CHARGES,
  STAPLER_FIELD_RANGE_TILES,
  STAPLER_PIN_DURATION,
  STUN_ROUND_DURATION,
  STUN_ROUND_REACH_TILES,
  STUN_ROUNDS_ITEM,
  THERMAL_GEL_ITEM,
  WEAPON_ARC_DEGREES,
} from "./EntityStats";
import type { ComponentData } from "../map/types";

describe("enforcerStatsFor — ranged attack fields", () => {
  it("falls back to the engine defaults when the map carries no fire tuning", () => {
    const stats = enforcerStatsFor([]);
    expect(stats.fireRange).toBe(ENFORCER_DEFAULTS.fireRange);
    expect(stats.fireCooldown).toBe(ENFORCER_DEFAULTS.fireCooldown);
    expect(stats.fireDamage).toBe(ENFORCER_DEFAULTS.fireDamage);
  });

  it("picks up a non-zero map override", () => {
    const components: ComponentData[] = [
      {
        type: "enforcer",
        values: { FireRange: "8", FireCooldown: "0.5", FireDamage: "40" },
      },
    ];
    const stats = enforcerStatsFor(components);
    expect(stats.fireRange).toBe(8);
    expect(stats.fireCooldown).toBe(0.5);
    expect(stats.fireDamage).toBe(40);
  });

  it("treats an authored 0 as unset, same as every other enforcer stat", () => {
    const components: ComponentData[] = [
      { type: "enforcer", values: { FireRange: "0" } },
    ];
    expect(enforcerStatsFor(components).fireRange).toBe(ENFORCER_DEFAULTS.fireRange);
  });
});

describe("Rail-Stapler field mode — balance vs. Stun Rounds", () => {
  it("never out-ranges or out-lasts the consumable it's the closest analog to", () => {
    // The field mode used to strictly dominate Stun Rounds (longer reach, longer
    // hold, *and* unlimited use). It's still a viable tool via STAPLER_FIELD_MAX_CHARGES,
    // but the per-shot numbers shouldn't make it a strictly better weapon.
    expect(STAPLER_FIELD_RANGE_TILES).toBeLessThanOrEqual(STUN_ROUND_REACH_TILES);
    expect(STAPLER_PIN_DURATION).toBeLessThanOrEqual(STUN_ROUND_DURATION);
  });

  it("has a finite per-run charge pool", () => {
    expect(STAPLER_FIELD_MAX_CHARGES).toBeGreaterThan(0);
    expect(Number.isFinite(STAPLER_FIELD_MAX_CHARGES)).toBe(true);
  });
});

describe("The hold-up — balance vs. the two weapons", () => {
  it("makes you close further than either weapon needs", () => {
    // The silent option is the one you walk up to. If it ever out-ranged a dart there
    // would be no reason left to fire one.
    expect(HOLD_UP_REACH_TILES).toBeLessThan(STUN_ROUND_REACH_TILES);
    expect(HOLD_UP_REACH_TILES).toBeLessThan(STAPLER_FIELD_RANGE_TILES);
  });

  it("aims narrower than the weapons spray, and lets go wider than it takes hold", () => {
    expect(HOLD_UP_ARC_DEGREES).toBeLessThan(WEAPON_ARC_DEGREES);
    // Hysteresis, both ways: a hold that broke on the same threshold it was acquired
    // at would strobe on the boundary while its subject is being marched.
    expect(HOLD_UP_RELEASE_ARC_DEGREES).toBeGreaterThan(HOLD_UP_ARC_DEGREES);
    expect(HOLD_UP_RELEASE_TILES).toBeGreaterThan(HOLD_UP_REACH_TILES);
  });

  it("is the shortest hold in the game, because it is the free one", () => {
    expect(HOLD_UP_GRACE_SECONDS).toBeLessThan(STUN_ROUND_DURATION);
    expect(HOLD_UP_GRACE_SECONDS).toBeLessThan(STAPLER_PIN_DURATION);
  });

  it("marches faster than an orderly walks, or the hostage cannot keep station", () => {
    // Rowan's escort pace is the player's 3.2 tiles/s scaled by the multiplier; a
    // hostage slower than that would fall out of the hold on every straight.
    expect(ESCORT_WALK_TILES).toBeGreaterThan(paced(PLAYER_WALK_TILES) * ESCORT_SPEED_MULTIPLIER);
  });
});

describe("Enforcer pace — balance vs. Rowan's three stances", () => {
  // The stance multipliers live in `Player.update`; mirrored here because the
  // relationship can only be asserted where both halves are in scope.
  const SNEAK = 0.45;
  const RUN = 1.6;

  it("out-walks a sneaking player, or a crouch would outrun a patrol", () => {
    expect(ENFORCER_DEFAULTS.patrolSpeed).toBeGreaterThan(PLAYER_WALK_TILES * SNEAK);
  });

  it("loses a walking player, so leaving calmly is a real escape", () => {
    expect(ENFORCER_DEFAULTS.purgeSpeed).toBeLessThan(PLAYER_WALK_TILES);
  });

  it("is outrun outright by a sprint", () => {
    expect(ENFORCER_DEFAULTS.purgeSpeed).toBeLessThan(PLAYER_WALK_TILES * RUN);
  });

  it("chases faster than it patrols", () => {
    expect(ENFORCER_DEFAULTS.purgeSpeed).toBeGreaterThan(ENFORCER_DEFAULTS.patrolSpeed);
  });
});

describe("consumableSlots — the item cursor's list", () => {
  it("lists every distinct held type, even when that's all six at once", () => {
    // MAX_CONSUMABLES (a total-unit cap) used to double as consumableSlots'
    // truncation point (a distinct-type count) — harmless only because the old
    // cap of 4 made holding 4+ distinct types impossible in the first place.
    // One of each of the six known consumables is 6 units, comfortably under
    // today's cap, and must come back as six slots, not get cut off early.
    expect(CONSUMABLE_ORDER.length).toBe(6);
    const oneOfEach = [...CONSUMABLE_ORDER];
    expect(oneOfEach.length).toBeLessThanOrEqual(MAX_CONSUMABLES);

    const slots = consumableSlots(oneOfEach);
    expect(slots.map((s) => s.name)).toEqual([...CONSUMABLE_ORDER]);
    expect(slots.every((s) => s.count === 1)).toBe(true);
  });

  it("skips types the player isn't carrying and numbers what's left in order", () => {
    const slots = consumableSlots([THERMAL_GEL_ITEM, RATION_PACK_ITEM, THERMAL_GEL_ITEM]);
    expect(slots).toEqual([
      { slot: 1, name: THERMAL_GEL_ITEM, count: 2 },
      { slot: 2, name: RATION_PACK_ITEM, count: 1 },
    ]);
  });

  it("counts total units, not distinct types, against MAX_CONSUMABLES", () => {
    const held = [
      CHAFF_PACK_ITEM,
      CHAFF_PACK_ITEM,
      BATTERY_ITEM,
      STUN_ROUNDS_ITEM,
      SACK_LUNCH_ITEM,
    ];
    expect(countConsumables(held)).toBe(held.length);
    expect(countConsumables(held)).toBeLessThanOrEqual(MAX_CONSUMABLES);
  });
});
