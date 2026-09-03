import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { EdplayLoader } from "./EdplayLoader";
import { appendClearanceCards, CARD_HOST, CLEARANCE_CARD } from "./ClearanceCards";
import { POSTED_CLEARANCE } from "./AutoClearance";
import {
  chestStatsFor,
  doorIsLocked,
  doorOpensWith,
  doorStatsFor,
  keycardName,
} from "../systems/EntityStats";
import type { EdPlayFile, GameMap } from "./types";

/**
 * The credential that answers the derived restricted ground, against the real map.
 *
 * The failure this guards is total rather than cosmetic: `AutoClearance` restricts
 * ground on eight of the nine decks, and if this graft stops landing then nothing the
 * player can find clears any of it. A restriction with no answer is a wall, and the
 * mechanic would read as broken rather than as hard.
 *
 * It re-parses per test because the graft mutates the chest's component in place, and
 * a shared map would let one case see another's card.
 */

let map: GameMap;

const chestOn = (name: string) => {
  const level = map.levels.find((l) => l.name === name);
  for (const layer of level?.layers ?? []) {
    for (const tile of layer.tiles) {
      if (tile.components.some((c) => c.type === "chest")) return tile;
    }
  }
  return undefined;
};

const lootOn = (name: string): string[] => {
  const chest = chestOn(name);
  return chest ? chestStatsFor(chest.components).items : [];
};

beforeEach(() => {
  const raw = JSON.parse(readFileSync("public/assets/edplay.json", "utf8")) as EdPlayFile;
  map = EdplayLoader.parse(
    raw,
    raw.SpriteSheets.map((s) => s.RelativePath),
  ).map;
});

describe("appendClearanceCards — the real shipped map", () => {
  it("puts the card in the host level's chest", () => {
    expect(appendClearanceCards(map)).toBe(true);
    expect(lootOn(CARD_HOST)).toContain(CLEARANCE_CARD);
  });

  it("carries the clearance the derivation actually posts ground at", () => {
    // The two constants have to agree or the card opens nothing it was placed for.
    expect(CLEARANCE_CARD).toBe(keycardName(POSTED_CLEARANCE));
  });

  it("keeps the author's own loot rather than replacing it", () => {
    // Writing the `item1/2/3` slots instead would have capped this chest at three and
    // silently dropped whatever the author wrote past that.
    const before = lootOn(CARD_HOST);
    expect(before.length).toBeGreaterThan(0);
    appendClearanceCards(map);
    const after = lootOn(CARD_HOST);
    for (const item of before) expect(after).toContain(item);
    expect(after).toHaveLength(before.length + 1);
  });

  it("adds nothing anywhere else", () => {
    const others = map.levels.map((l) => l.name).filter((n) => n !== CARD_HOST);
    const before = new Map(others.map((n) => [n, lootOn(n).join("|")]));
    appendClearanceCards(map);
    for (const name of others) expect(lootOn(name).join("|"), name).toBe(before.get(name));
  });

  it("refuses to add a second card to a chest that already has one", () => {
    // Idempotence matters because boot is not the only caller a future refactor could
    // give this, and two credentials in one box reads as a bug.
    expect(appendClearanceCards(map)).toBe(true);
    expect(appendClearanceCards(map)).toBe(false);
    expect(lootOn(CARD_HOST).filter((i) => i === CLEARANCE_CARD)).toHaveLength(1);
  });

  it("leaves main1's authored Keycard 1 alone, which still opens nothing", () => {
    // The map's own credential stays exactly as authored. It is clearance 1 and every
    // lock on this map is clearance 2, so it remains the inert card it has always
    // been — this graft answers the doors, it does not retro-fit the author's.
    appendClearanceCards(map);
    expect(lootOn("main1")).toContain(keycardName(1));
    expect(lootOn("main1")).not.toContain(CLEARANCE_CARD);
  });

  it("bails without throwing when the host level is absent", () => {
    expect(appendClearanceCards(map, "no_such_level")).toBe(false);
  });
});

describe("the card against the doors it exists for", () => {
  it("opens every locked door on the map, which nothing did before", () => {
    appendClearanceCards(map);
    const inventory = lootOn(CARD_HOST);

    let locked = 0;
    for (const level of map.levels) {
      for (const layer of level.layers) {
        for (const tile of layer.tiles) {
          if (!tile.components.some((c) => c.type === "door")) continue;
          const stats = doorStatsFor(tile.components);
          if (!doorIsLocked(stats)) continue;
          locked++;
          expect(
            doorOpensWith(stats, inventory),
            `${level.name} (${tile.x},${tile.y}) refuses the clearance card`,
          ).toBe(true);
        }
      }
    }
    expect(locked).toBe(6);
  });
});
