import { describe, it, expect } from "vitest";
import {
  BATTERY_ITEM,
  CHAFF_PACK_ITEM,
  consumableSlots,
  CONSUMABLE_ORDER,
  countConsumables,
  ARMED_POSTS_PER_LEVEL,
  chestStatsFor,
  CHEST_DEFAULTS,
  doorIsLocked,
  doorOpensWith,
  isKeycard,
  keycardName,
  keycardNumber,
  KNOWN_ITEMS,
  parseItemList,
  resolveItemName,
  STAPLER_ITEM,
  enforcerStatsFor,
  ENFORCER_DEFAULTS,
  FIREARMS_AUTHORIZATION_DELAY,
  flag,
  GUARD_MELEE_NOISE_TILES,
  GUARD_MELEE_STAGGER_MULTIPLIER,
  GUARD_MELEE_STAGGER_SECONDS,
  ENFORCER_FIRE_NOISE_TILES,
  ESCORT_SPEED_MULTIPLIER,
  ESCORT_WALK_TILES,
  HOLD_UP_ARC_DEGREES,
  HOLD_UP_GRACE_SECONDS,
  HOLD_UP_REACH_TILES,
  HOLD_UP_RELEASE_ARC_DEGREES,
  HOLD_UP_RELEASE_TILES,
  MAX_CONSUMABLES,
  paced,
  PLAYER_DEFAULTS,
  PLAYER_MELEE_NOISE_TILES,
  PLAYER_MELEE_REACH_TILES,
  PLAYER_WALK_TILES,
  securityGuardStatsFor,
  SECURITY_GUARD_DEFAULTS,
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
import type { DoorStats } from "./EntityStats";

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

describe("enforcerStatsFor — contact attack fields", () => {
  it("falls back to the engine defaults when the map carries no melee tuning", () => {
    const stats = enforcerStatsFor([]);
    expect(stats.meleeRange).toBe(ENFORCER_DEFAULTS.meleeRange);
    expect(stats.meleeCooldown).toBe(ENFORCER_DEFAULTS.meleeCooldown);
    expect(stats.meleeDamage).toBe(ENFORCER_DEFAULTS.meleeDamage);
  });

  it("picks up a non-zero map override", () => {
    const components: ComponentData[] = [
      {
        type: "enforcer",
        values: { MeleeRange: "3", MeleeCooldown: "0.4", MeleeDamage: "30" },
      },
    ];
    const stats = enforcerStatsFor(components);
    expect(stats.meleeRange).toBe(3);
    expect(stats.meleeCooldown).toBe(0.4);
    expect(stats.meleeDamage).toBe(30);
  });

  it("treats an authored 0 as unset, same as every other enforcer stat", () => {
    const components: ComponentData[] = [{ type: "enforcer", values: { MeleeRange: "0" } }];
    expect(enforcerStatsFor(components).meleeRange).toBe(ENFORCER_DEFAULTS.meleeRange);
  });
});

describe("Firearms are restricted by default", () => {
  it("leaves every guard unarmed when the map says nothing", () => {
    // The default *is* the restriction — see EnforcerStats.armed. If this ever flips,
    // every body on every level is carrying again and the whole gate is decorative.
    expect(enforcerStatsFor([]).armed).toBe(false);
    expect(securityGuardStatsFor([]).armed).toBe(false);
    expect(ENFORCER_DEFAULTS.armed).toBe(false);
    expect(SECURITY_GUARD_DEFAULTS.armed).toBe(false);
  });

  it("lets a board arm a post explicitly", () => {
    const components: ComponentData[] = [{ type: "enforcer", values: { Armed: "1" } }];
    expect(enforcerStatsFor(components).armed).toBe(true);
  });

  it("reads an absent, blank or zero flag as false", () => {
    // `num` treats 0 as unset, and for a boolean unset and false are the same answer.
    expect(flag([], "enforcer", "Armed")).toBe(false);
    expect(flag([{ type: "enforcer", values: { Armed: "" } }], "enforcer", "Armed")).toBe(false);
    expect(flag([{ type: "enforcer", values: { Armed: "0" } }], "enforcer", "Armed")).toBe(false);
    expect(flag([{ type: "enforcer", values: { Armed: "false" } }], "enforcer", "Armed")).toBe(false);
  });

  it("reads 1 and true as true", () => {
    expect(flag([{ type: "enforcer", values: { Armed: "1" } }], "enforcer", "Armed")).toBe(true);
    expect(flag([{ type: "enforcer", values: { Armed: "true" } }], "enforcer", "Armed")).toBe(true);
  });

  it("keeps the per-level allowance scarce", () => {
    // The number is the design. A cap of 0 would make firearms absent rather than
    // restricted, and anything above 1 stops reading as scarcity on a level this size.
    expect(ARMED_POSTS_PER_LEVEL).toBe(1);
  });

  it("can be reached inside a single ALERT window", () => {
    // AlertState's own ALERT_DURATION is 8s. A delay at or past it could never be
    // crossed, which would make firearms unreachable rather than restricted.
    expect(FIREARMS_AUTHORIZATION_DELAY).toBeLessThan(8);
    expect(FIREARMS_AUTHORIZATION_DELAY).toBeGreaterThan(0);
  });
});

describe("Guard melee — balance against the capture that follows it", () => {
  it("staggers for less time than a capture takes to land", () => {
    // The relationship the whole exchange rests on: a silicate prods at 1.6 tiles and
    // seizes at 1.3, so a stagger outlasting `captureTime` would make one connection a
    // run-ender. Eating two is a mistake you can see coming; eating one is a coin flip.
    expect(GUARD_MELEE_STAGGER_SECONDS).toBeLessThan(PLAYER_DEFAULTS.captureTime);
  });

  it("prods from outside the capture radius, so the strike lands before the seizure", () => {
    expect(ENFORCER_DEFAULTS.meleeRange).toBeGreaterThan(PLAYER_DEFAULTS.captureRadius);
  });

  it("slows Rowan without stopping him", () => {
    // Above a sneak (0.45) and below a walk: the strike buys the guard his closing
    // distance, it does not decide the exchange on its own.
    expect(GUARD_MELEE_STAGGER_MULTIPLIER).toBeGreaterThan(0.45);
    expect(GUARD_MELEE_STAGGER_MULTIPLIER).toBeLessThan(1);
  });

  it("lands a staggered sprint between the two purge speeds", () => {
    // The asymmetry the whole cast is built on: the humans hurt you, the silicates
    // take you in. A staggered Rowan still out-runs a man with a stick, and does not
    // out-run a sentry — which is how a prod feeds the capture that ends the run.
    // 1.6 is the run multiplier in `Player.update`; both sides are paced, so the
    // unpaced ratio is the truth.
    const staggeredSprint = PLAYER_WALK_TILES * 1.6 * GUARD_MELEE_STAGGER_MULTIPLIER;
    expect(staggeredSprint).toBeGreaterThan(SECURITY_GUARD_DEFAULTS.purgeSpeed);
    expect(staggeredSprint).toBeLessThan(ENFORCER_DEFAULTS.purgeSpeed);
  });

  it("is much quieter than gunfire", () => {
    // The mechanical argument for the facility preferring hands: a scuffle does not
    // call the floor the way a shot does.
    expect(GUARD_MELEE_NOISE_TILES).toBeLessThan(ENFORCER_FIRE_NOISE_TILES);
  });

  it("hits harder as a man than as a sentry, and reaches less far", () => {
    // He has no capture to follow it with, so the strike is his whole answer.
    expect(SECURITY_GUARD_DEFAULTS.meleeDamage).toBeGreaterThan(ENFORCER_DEFAULTS.meleeDamage);
    expect(SECURITY_GUARD_DEFAULTS.meleeRange).toBeLessThan(ENFORCER_DEFAULTS.meleeRange);
  });
});

describe("Rowan's takedown — balance against the two things it sits between", () => {
  it("is contact reach, well under the hold-up's", () => {
    // Pointing something at a man works from across the room; putting hands on him
    // means walking all the way in with nothing in them.
    expect(PLAYER_MELEE_REACH_TILES).toBeLessThan(HOLD_UP_REACH_TILES);
  });

  it("is louder than a hold-up and quieter than a dart", () => {
    // The three ways off the board stay ordered by what they cost to use. The hold-up
    // has no noise constant at all, and that absence is documented as the mechanic.
    expect(PLAYER_MELEE_NOISE_TILES).toBeGreaterThan(0);
    expect(PLAYER_MELEE_NOISE_TILES).toBeLessThan(2);
  });

  it("reaches less far than an orderly can see", () => {
    // Closing to arm's length means standing well inside his eyeline to do it.
    expect(PLAYER_MELEE_REACH_TILES).toBeLessThan(5);
  });
});

/** A `chest` component carrying the map's single-string loot schema. */
const authoredChest = (items: string): ComponentData[] => [
  { type: "chest", values: { items } },
];

describe("parseItemList — the map's authored loot schema", () => {
  it("splits a quoted, comma-separated list", () => {
    expect(parseItemList('"Battery", "EMP Grenade", "Thermal Gel"')).toEqual([
      "Battery",
      "EMP Grenade",
      "Thermal Gel",
    ]);
  });

  it("is forgiving about spacing", () => {
    expect(parseItemList('  "Battery"   ,"Medkit"  ')).toEqual(["Battery", "Medkit"]);
  });

  it("tolerates the unterminated quote the shipped map's schema default carries", () => {
    // `main2vault` and `secret2` inherit the Chest DataStructure's own DefaultValues,
    // which are written `"Medkit", "Battery` — the closing quote is genuinely missing
    // in edplay.json. Those two chests are the only thing that depends on this.
    expect(parseItemList('"Medkit", "Battery')).toEqual(["Medkit", "Battery"]);
  });

  it("yields nothing for an empty or quote-only field", () => {
    expect(parseItemList("")).toEqual([]);
    expect(parseItemList('  ,  ""  , ')).toEqual([]);
  });
});

describe("resolveItemName", () => {
  it("passes a name the game already spells the same way", () => {
    expect(resolveItemName("Stun Rounds")).toBe(STUN_ROUNDS_ITEM);
  });

  it("rescues main1's spacing variant", () => {
    // The only Stun Rounds reachable before `secret1`, and what enables the hold-up.
    expect(resolveItemName("StunRounds")).toBe(STUN_ROUNDS_ITEM);
  });

  it("ignores case", () => {
    expect(resolveItemName("emp grenade")).toBe(CHAFF_PACK_ITEM);
  });

  it("returns undefined for a name with no engine meaning", () => {
    expect(resolveItemName("Bag of Holding")).toBeUndefined();
    expect(resolveItemName("")).toBeUndefined();
  });

  it("reads the map's key spellings as keycards", () => {
    // `main1` authors "Key1". It was dropped on the floor until keycards existed —
    // now it is a real credential, whatever the door numbering turns out to want.
    expect(resolveItemName("Key1")).toBe(keycardName(1));
    expect(resolveItemName("Key 2")).toBe(keycardName(2));
    expect(resolveItemName("keycard03")).toBe(keycardName(3));
  });

  it("refuses key-shaped names that name no clearance", () => {
    // A door with `key: 0` is unlocked, so Keycard 0 would open nothing by definition.
    expect(resolveItemName("Keycard 0")).toBeUndefined();
    expect(resolveItemName("Key")).toBeUndefined();
    expect(resolveItemName("Keyfoo")).toBeUndefined();
  });
});

describe("chestStatsFor — loot from either schema", () => {
  it("reads the map's authored items list", () => {
    expect(chestStatsFor(authoredChest('"Stun Rounds", "EMP Grenade"')).items).toEqual([
      STUN_ROUNDS_ITEM,
      CHAFF_PACK_ITEM,
    ]);
  });

  it("resolves every name main1 authors, keycard included", () => {
    expect(chestStatsFor(authoredChest('"StunRounds", "Battery", "Key1", "Medkit"')).items).toEqual(
      [STUN_ROUNDS_ITEM, BATTERY_ITEM, keycardName(1), RATION_PACK_ITEM],
    );
  });

  it("still drops authored names the game does not know", () => {
    expect(chestStatsFor(authoredChest('"Battery", "Bag of Holding"')).items).toEqual([
      BATTERY_ITEM,
    ]);
  });

  it("falls back to the default table for a chest with no loot field at all", () => {
    expect(chestStatsFor([{ type: "chest", values: {} }]).items).toEqual([...CHEST_DEFAULTS.items]);
  });

  it("treats a list of nothing but unknown names as unset rather than as an empty chest", () => {
    expect(chestStatsFor(authoredChest('"Nonsense", "Also Nonsense"')).items).toEqual([
      ...CHEST_DEFAULTS.items,
    ]);
  });

  it("lets engine-written slots win over an inherited items list", () => {
    // Load-bearing: `cloneWithComponent` merges onto a *prototype's* component, so a
    // generated chest inherits the donor tile's authored list whether anyone wanted it
    // or not. Without this precedence the vent core hands out the donor's loot instead
    // of the Rail-Stapler.
    const inherited: ComponentData[] = [
      { type: "chest", values: { items: '"Battery", "Medkit"', item1: STAPLER_ITEM } },
    ];
    expect(chestStatsFor(inherited).items[0]).toBe(STAPLER_ITEM);
  });

  it("keeps engine-written slots unfiltered, and fills blank ones per slot", () => {
    // Two behaviours, both deliberate and both pre-existing.
    //
    // Unfiltered: the slot schema is written by the engine, which only ever writes names
    // it means, so it is not resolved against KNOWN_ITEMS the way hand-authored text is.
    // Filtering it would silently drop the vent core's flavour loot.
    //
    // Per-slot: a blank slot takes *that slot's* default rather than emptying the chest —
    // which is why `VentCoreLevel` fills all three deliberately. The default table is two
    // entries since the Access Chit became a keycard, so the third slot has nothing to
    // fall back to and drops out.
    const generated: ComponentData[] = [
      { type: "chest", values: { item1: "Anything At All", item2: "", item3: "" } },
    ];
    expect(chestStatsFor(generated).items).toEqual([
      "Anything At All",
      ...CHEST_DEFAULTS.items.slice(1),
    ]);
  });
});

describe("KNOWN_ITEMS", () => {
  it("has no duplicates", () => {
    expect(new Set(KNOWN_ITEMS).size).toBe(KNOWN_ITEMS.length);
  });

  it("has no two names that normalise to the same key", () => {
    // `resolveItemName` matches on a case- and space-insensitive key and takes the
    // first hit, so a collision would make one of the two items unauthorable with no
    // sign that anything was wrong.
    const keys = KNOWN_ITEMS.map((n) => n.toLowerCase().replace(/\s+/g, ""));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers the default chest loot", () => {
    for (const name of CHEST_DEFAULTS.items) expect(resolveItemName(name)).toBe(name);
  });

  it("covers every consumable", () => {
    for (const name of CONSUMABLE_ORDER) expect(resolveItemName(name)).toBe(name);
  });
});

describe("Keycards and the doors they answer", () => {
  const door = (key: number, state = "closed"): DoorStats => ({
    key,
    state,
    operationNoise: 4,
  });

  it("names a card per clearance, and reads the number back", () => {
    expect(keycardName(2)).toBe("Keycard 2");
    expect(keycardNumber(keycardName(7))).toBe(7);
    expect(isKeycard(keycardName(1))).toBe(true);
    expect(isKeycard(STUN_ROUNDS_ITEM)).toBe(false);
  });

  it("opens an unlocked door for anybody, empty-handed", () => {
    expect(doorOpensWith(door(0), [])).toBe(true);
  });

  it("refuses a keyed door to a man with no card", () => {
    expect(doorOpensWith(door(2), [])).toBe(false);
    expect(doorOpensWith(door(2), [STUN_ROUNDS_ITEM])).toBe(false);
  });

  it("opens a keyed door to the matching clearance only", () => {
    expect(doorOpensWith(door(2), [keycardName(2)])).toBe(true);
    // Every locked door on the shipped map is key 2, and main1 authors a Keycard 1 —
    // so this mismatch is the one the player actually meets.
    expect(doorOpensWith(door(2), [keycardName(1)])).toBe(false);
    expect(doorOpensWith(door(2), [keycardName(3)])).toBe(false);
  });

  it("keeps a sealed door sealed however well equipped he is", () => {
    // `LOCKED` with no id names no clearance, so no card can answer it. A terminal
    // hack is the only way through, and it force-opens without consulting any of this.
    const sealed = door(0, "locked");
    expect(doorIsLocked(sealed)).toBe(true);
    expect(doorOpensWith(sealed, [keycardName(1), keycardName(2)])).toBe(false);
  });

  it("does not care what order the bag is in", () => {
    expect(doorOpensWith(door(2), [STUN_ROUNDS_ITEM, keycardName(2), BATTERY_ITEM])).toBe(true);
  });

  it("treats a keyed door as locked even when its state says closed", () => {
    // The two fields are independent: a key alone locks it.
    expect(doorIsLocked(door(2, "closed"))).toBe(true);
    expect(doorIsLocked(door(0, "closed"))).toBe(false);
  });
});
