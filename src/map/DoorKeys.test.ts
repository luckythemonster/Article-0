import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { EdplayLoader, type ParsedMap } from "./EdplayLoader";
import {
  doorIsLocked,
  doorOpensWith,
  doorStatsFor,
  keycardName,
  type DoorStats,
} from "../systems/EntityStats";
import type { EdPlayFile } from "./types";

/**
 * Integration test on the real shipped map: which doors ask for a credential.
 *
 * Keycards exist because doors have always locked on a numeric `key` while nothing in
 * the engine read an item to answer it. These assertions pin what the map actually
 * authors, so a re-export that moves the numbering fails here rather than silently
 * leaving a door nothing can open.
 */
describe("Door keys — the real shipped map", () => {
  let parsed: ParsedMap;
  /** Every locked door, as `level (x,y)` -> its stats. */
  let locked: Map<string, DoorStats>;

  beforeAll(() => {
    const raw = JSON.parse(
      readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
    ) as EdPlayFile;
    parsed = EdplayLoader.parse(raw, raw.SpriteSheets.map((s) => s.RelativePath));
    locked = new Map();
    for (const level of parsed.map.levels) {
      for (const layer of level.layers) {
        for (const t of layer.tiles) {
          if (!t.components.some((c) => c.type === "door")) continue;
          const stats = doorStatsFor(t.components);
          if (doorIsLocked(stats)) locked.set(`${level.name} (${t.x},${t.y})`, stats);
        }
      }
    }
  });

  it("locks exactly six doors, every one of them on clearance 2", () => {
    expect(locked.size).toBe(6);
    for (const [where, stats] of locked) {
      expect(stats.key, `${where} is locked on an unexpected clearance`).toBe(2);
    }
  });

  it("seals none of them outright — every lock names a clearance that can answer it", () => {
    // A `LOCKED` door with `key: 0` would be openable only by a terminal hack, and none
    // of these six has one within the 6-tile unlock radius. That would be impassable.
    for (const [where, stats] of locked) {
      expect(doorOpensWith(stats, [keycardName(2)]), `${where} refuses its own card`).toBe(true);
    }
  });

  it("refuses all six to the Keycard 1 that main1 actually hands out", () => {
    // The state this change deliberately ships: main1's authored "Key1" is a real
    // credential now, and it opens nothing, because placing a Keycard 2 is a separate
    // decision. If that changes, this test is the one that should be updated with it.
    for (const stats of locked.values()) {
      expect(doorOpensWith(stats, [keycardName(1)])).toBe(false);
    }
  });

  it("leaves every other door hand-openable", () => {
    let unlocked = 0;
    for (const level of parsed.map.levels) {
      for (const layer of level.layers) {
        for (const t of layer.tiles) {
          if (!t.components.some((c) => c.type === "door")) continue;
          const stats = doorStatsFor(t.components);
          if (doorIsLocked(stats)) continue;
          expect(doorOpensWith(stats, [])).toBe(true);
          unlocked++;
        }
      }
    }
    expect(unlocked).toBeGreaterThan(0);
  });
});
