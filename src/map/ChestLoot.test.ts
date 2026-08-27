import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { EdplayLoader, type ParsedMap } from "./EdplayLoader";
import { planFor } from "./MapPlan";
import { appendVentCore } from "./VentCoreLevel";
import {
  chestStatsFor,
  CHEST_DEFAULTS,
  keycardName,
  STAPLER_ITEM,
  STUN_ROUNDS_ITEM,
} from "../systems/EntityStats";
import type { EdPlayFile } from "./types";

/**
 * Integration test on the real shipped map: what every searchable chest actually holds.
 *
 * The engine read `item1/2/3` while the map authors a single `items` string, and nothing
 * bridged the two — so all six authored chests silently yielded {@link CHEST_DEFAULTS}
 * and **no weapon was obtainable in normal play**. `canHoldUp()` was never true, neither
 * player weapon could fire, and VENT-4's capacitor phase was unreachable. Unit tests on
 * `chestStatsFor` cover the parsing rules; this file's job is to check the real data
 * comes out the other side as the author wrote it.
 */
describe("Chest loot — the real shipped map", () => {
  let parsed: ParsedMap;
  /** Level name -> what searching that level's chest gives. */
  let loot: Map<string, string[]>;

  beforeAll(() => {
    const raw = JSON.parse(
      readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
    ) as EdPlayFile;
    parsed = EdplayLoader.parse(raw, raw.SpriteSheets.map((s) => s.RelativePath));
    // The vent core's chest only exists once the authored arena has been adopted.
    appendVentCore(parsed.map, planFor(parsed.map).ventCoreHost);

    loot = new Map();
    for (const level of parsed.map.levels) {
      for (const t of level.layers.find((l) => l.name === "items")?.tiles ?? []) {
        if (t.components.some((c) => c.type === "chest")) {
          loot.set(level.name, chestStatsFor(t.components).items);
        }
      }
    }
  });

  it("finds a searchable chest on every level that authored one", () => {
    expect([...loot.keys()].sort()).toEqual(
      ["duct1", "main1", "main2", "main2vault", "secret1", "secret2", "vent_core"].sort(),
    );
  });

  it("yields the authored loot rather than the default table", () => {
    expect(loot.get("duct1")).toEqual(["Battery", "EMP Grenade", "Thermal Gel"]);
    expect(loot.get("secret1")).toEqual(["Stun Rounds", "EMP Grenade"]);
    expect(loot.get("main2")).toEqual(["EMP Grenade", "Medkit", "Thermal Gel", "Battery"]);
  });

  it("normalises main1's authored spellings, keycard included", () => {
    // Authored `"StunRounds", "Battery", "Key1", "Medkit"`. `Key1` was dropped on the
    // floor until keycards existed; it is now a real numbered credential.
    expect(loot.get("main1")).toEqual(["Stun Rounds", "Battery", keycardName(1), "Medkit"]);
  });

  it("puts Stun Rounds within reach on the first level, which is what enables the hold-up", () => {
    // The whole point of the fix: `canHoldUp()` gates on carrying a weapon, and before
    // this the player could never obtain one outside the debug give-item cheat.
    expect(loot.get("main1")).toContain(STUN_ROUNDS_ITEM);
  });

  it("puts the Rail-Stapler in the vent core, so VENT-4's jam has an answer", () => {
    expect(loot.get("vent_core")).toContain(STAPLER_ITEM);
  });

  it("falls back for the two chests the author left at the schema default", () => {
    // These inherit the Chest DataStructure's own DefaultValues — `"Medkit", "Battery`,
    // with the closing quote genuinely missing in edplay.json.
    expect(loot.get("main2vault")).toEqual(["Medkit", "Battery"]);
    expect(loot.get("secret2")).toEqual(["Medkit", "Battery"]);
  });

  it("never yields a name the game cannot describe or use", () => {
    for (const [level, items] of loot) {
      for (const name of items) {
        expect(name.trim(), `${level} yielded a blank item name`).not.toBe("");
        expect(name, `${level} yielded an unresolved name`).not.toMatch(/^"|"$/);
      }
    }
  });
});
