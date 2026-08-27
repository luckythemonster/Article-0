import { describe, it, expect } from "vitest";
import { catalogedNames, itemInfo } from "./ItemCatalog";
import {
  CHEST_DEFAULTS,
  keycardName,
  CONSUMABLE_ORDER,
  KNOWN_ITEMS,
  LOG_ALPHA_ITEM,
  LOG_BETA_ITEM,
  RATION_HEAL,
  RATION_PACK_ITEM,
} from "./EntityStats";

/**
 * Items the engine can grant that are *not* described here, and are expected not to be.
 *
 * The two log-cache halves are granted by `TerminalHacks` and shown under KEY ITEMS with
 * no blurb — a real gap, and a pre-existing one: it predates the chest wiring and is not
 * caused by it. Named here rather than silently omitted so the exactness check below stays
 * honest about what it is letting through, and so closing the gap is a matter of deleting
 * a line from this list and watching the test tell you what to write.
 */
const UNCATALOGUED = [LOG_ALPHA_ITEM, LOG_BETA_ITEM];

/**
 * Every item name the engine can actually put in the player's hands.
 *
 * Derived from {@link KNOWN_ITEMS} rather than hand-listed again. It used to be its own
 * copy, which is one list of item names too many: the chest loader needs the same set to
 * resolve authored spellings against, and two hand-maintained copies of "what is an item"
 * drift the first time somebody adds one to only one of them.
 */
const ALL_ITEMS = KNOWN_ITEMS.filter((name) => !UNCATALOGUED.includes(name));

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

  it("describes a keycard of any clearance, without an entry per number", () => {
    // Keycards are an open-ended family — a map may lock a door on any id — so they
    // are described dynamically rather than catalogued. Copy still has to be real:
    // an item the player holds and the menu cannot explain is the gap this file exists
    // to close.
    for (const clearance of [1, 2, 5, 42]) {
      const info = itemInfo(keycardName(clearance));
      expect(info, `no description for clearance ${clearance}`).toBeDefined();
      expect(info!.blurb.length).toBeGreaterThan(0);
      expect(info!.effect).toContain(String(clearance));
    }
  });

  it("keeps keycards out of the catalogue itself", () => {
    // The exactness check above compares against KNOWN_ITEMS, and neither list can
    // hold an open-ended family. If a keycard ever lands in CATALOG, one number got
    // special-cased and the rest quietly stopped being described.
    expect(catalogedNames().some((n) => n.startsWith("Keycard"))).toBe(false);
  });
});
