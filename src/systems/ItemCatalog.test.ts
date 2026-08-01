import { describe, it, expect } from "vitest";
import { catalogedNames, itemInfo } from "./ItemCatalog";
import {
  ACCESS_CHIT_ITEM,
  BATTERY_ITEM,
  CERT_ITEM,
  CHAFF_PACK_ITEM,
  CHEST_DEFAULTS,
  CONSUMABLE_ORDER,
  EIRA7_LOG_ITEM,
  FLASHLIGHT_ITEM,
  RATION_HEAL,
  RATION_PACK_ITEM,
  SACK_LUNCH_ITEM,
  STAPLER_ITEM,
  STUN_ROUNDS_ITEM,
  THERMAL_GEL_ITEM,
} from "./EntityStats";

/** Every item name the engine can actually put in the player's hands. */
const ALL_ITEMS = [
  CHAFF_PACK_ITEM,
  THERMAL_GEL_ITEM,
  RATION_PACK_ITEM,
  BATTERY_ITEM,
  STUN_ROUNDS_ITEM,
  SACK_LUNCH_ITEM,
  FLASHLIGHT_ITEM,
  ACCESS_CHIT_ITEM,
  EIRA7_LOG_ITEM,
  CERT_ITEM,
  STAPLER_ITEM,
];

describe("ItemCatalog", () => {
  it("describes every item the engine can grant", () => {
    for (const name of ALL_ITEMS) {
      const info = itemInfo(name);
      expect(info, `no catalog entry for "${name}"`).toBeDefined();
      expect(info!.blurb.length).toBeGreaterThan(0);
      expect(info!.effect.length).toBeGreaterThan(0);
    }
  });

  it("describes every hotkey consumable", () => {
    for (const name of CONSUMABLE_ORDER) {
      expect(itemInfo(name), `no catalog entry for consumable "${name}"`).toBeDefined();
    }
  });

  it("describes the default chest loot, so a searched container never reads blank", () => {
    for (const name of CHEST_DEFAULTS.items) {
      expect(itemInfo(name), `no catalog entry for chest loot "${name}"`).toBeDefined();
    }
  });

  it("catalogues nothing the engine can't grant", () => {
    // Guards the other direction: a renamed constant would otherwise leave a
    // stale entry behind that no held item ever matches.
    expect(catalogedNames().sort()).toEqual([...ALL_ITEMS].sort());
  });

  it("takes its numbers from the tuning constants rather than restating them", () => {
    expect(itemInfo(RATION_PACK_ITEM)!.effect).toContain(String(RATION_HEAL));
  });

  it("returns undefined for an unknown name instead of throwing", () => {
    expect(itemInfo("Bag of Holding")).toBeUndefined();
  });
});
