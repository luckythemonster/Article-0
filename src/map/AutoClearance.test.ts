import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { EdplayLoader } from "./EdplayLoader";
import { typeInertTerminals } from "./InertTerminals";
import { planFor } from "./MapPlan";
import { appendVentCore } from "./VentCoreLevel";
import { appendLogCacheBeta } from "./LogCacheBeta";
import { appendAlignmentVault } from "./AlignmentVault";
import { appendRoofArray } from "./RoofArrayLevel";
import { appendDestructibleCover } from "./DestructibleCover";
import { appendLockers } from "./Lockers";
import { autoLight } from "./AutoLight";
import {
  autoClearance,
  autoClearanceLevel,
  MIN_SEALED_TILES,
  POSTED_CLEARANCE,
  POSTED_RADIUS_TILES,
  RESTRICTED_BOARD,
} from "./AutoClearance";
import { graftExtractionEntrance } from "./AdoptAuthored";
import { clearanceAt, restrictedTileCount } from "../systems/Clearance";
import { doorIsLocked, doorStatsFor } from "../systems/EntityStats";
import type { EdPlayFile, GameLevel, GameMap, GameTile } from "./types";

/**
 * Derived restricted ground, tested against the **real** `edplay.json` — the same
 * approach `AutoLight.test.ts` takes, and for the same reason: this module exists to
 * make one specific export carry a mechanic it was never annotated for, and a fixture
 * map would only prove it fits the fixture.
 *
 * The numbers below are measurements, not targets. They were read off the shipped map
 * and they are here so that a re-export, or a change to the fill, has to explain itself
 * rather than silently restricting a different amount of the game.
 *
 * The half most worth pinning is what this refuses to do. Five of the six locked doors
 * on this map are **elevator car doors** sealing a single tile, and "the space behind a
 * locked door" is a perfectly good rule that would have made five lift cars into
 * restricted areas. The size floor is what stops it, and nothing else would.
 */

let map: GameMap;

function level(name: string): GameLevel {
  const l = map.levels.find((x) => x.name === name);
  if (!l) throw new Error(`no level "${name}"`);
  return l;
}

const tilesOf = (l: GameLevel): GameTile[] => l.layers.flatMap((x) => x.tiles);

const lockedDoorsOn = (l: GameLevel): GameTile[] =>
  tilesOf(l).filter((t) => {
    if (!t.components.some((c) => c.type === "door")) return false;
    return doorIsLocked(doorStatsFor(t.components));
  });

beforeAll(() => {
  const raw = JSON.parse(readFileSync("public/assets/edplay.json", "utf8")) as EdPlayFile;
  typeInertTerminals(raw);
  const parsed = EdplayLoader.parse(
    raw,
    raw.SpriteSheets.map((s) => s.RelativePath),
  );
  map = parsed.map;

  // The order boot uses. Derivation runs last, after every graft has finished changing
  // the walls, doors and fixtures it reads.
  const plan = planFor(map);
  appendVentCore(map, plan.ventCoreHost);
  appendLogCacheBeta(map, plan.startLevel);
  appendAlignmentVault(map, plan.vaultHost);
  appendRoofArray(map, plan.extractionLevel);
  graftExtractionEntrance(map, plan.extractionLevel);
  appendDestructibleCover(map, plan.startLevel);
  appendLockers(map, plan.startLevel);
  autoLight(map);
  autoClearance(map);
});

/**
 * Restricted tiles per level, as the shipped map derives them today.
 *
 * A change here is a change to how much of the game is restricted ground, which is the
 * one number that decides whether this mechanic is a place you notice or a state you
 * are permanently in. It should move deliberately.
 */
const EXPECTED: Record<string, number> = {
  main1: 14,
  duct1: 45,
  duct2: 9,
  secret1: 7,
  vent_core: 0,
  main2: 20,
  main2vault: 41,
  secret2: 12,
  roof_array: 59,
};

describe("autoClearance — the real shipped map", () => {
  it("gives every level a map, even the one with nothing restricted", () => {
    // `vent_core` derives nothing, and that has to be an empty map rather than an
    // absent one, or "nobody ran the derivation" and "nothing to restrict" become the
    // same state and a bug in the first would read as the second.
    for (const l of map.levels) expect(l.restricted, l.name).toBeDefined();
  });

  it.each(Object.entries(EXPECTED))("restricts %s to %i tiles", (name, tiles) => {
    expect(restrictedTileCount(level(name).restricted)).toBe(tiles);
  });

  it("leaves no deck mostly restricted", () => {
    // The failure this whole module is shaped to avoid: a leaked fill that turns a
    // level into one large no-go area, which reads as the mechanic being broken rather
    // than as a place. The worst deck today is duct1, the crawlspace full of racks.
    for (const l of map.levels) {
      const fraction = restrictedTileCount(l.restricted) / (l.width * l.height);
      expect(fraction, l.name).toBeLessThan(0.2);
    }
  });

  it("restricts eight of the nine decks, so the mechanic is not a late-game curiosity", () => {
    const covered = map.levels.filter((l) => restrictedTileCount(l.restricted) > 0);
    expect(covered.map((l) => l.name).sort()).toEqual([
      "duct1",
      "duct2",
      "main1",
      "main2",
      "main2vault",
      "roof_array",
      "secret1",
      "secret2",
    ]);
  });

  it("posts everything at one clearance, so a single card answers the facility", () => {
    // Two numbers would mean two collectibles to place, and a player who found one and
    // still could not tell why the readout stayed amber.
    for (const l of map.levels) {
      for (const required of l.restricted!.required) {
        if (required !== 0) expect(required, l.name).toBe(POSTED_CLEARANCE);
      }
    }
  });
});

describe("autoClearance — what it refuses to seal", () => {
  it("derives nothing from the five elevator-car doors", () => {
    // Every locked door on this map is clearance 2, and five of the six are lift cars
    // on `vent_core` and `roof_array` — neither of which has a terminal either, so any
    // restricted ground on those decks could only have come from an elevator.
    for (const name of ["vent_core", "roof_array"]) {
      expect(lockedDoorsOn(level(name)).length, name).toBeGreaterThan(0);
    }
    expect(restrictedTileCount(level("vent_core").restricted)).toBe(0);
  });

  it("seals main2's room, the one locked door that seals a room at all", () => {
    // main2 fields no terminal and no rack, so all 20 of its restricted tiles are the
    // room behind the door at (29,3) — which makes this level the clean test of the
    // sealed half on its own.
    const l = level("main2");
    expect(restrictedTileCount(l.restricted)).toBe(20);
    expect(restrictedTileCount(l.restricted)).toBeGreaterThanOrEqual(MIN_SEALED_TILES);
  });

  it("keeps a sealed room's ground contiguous with the door that seals it", () => {
    // A sanity check on the fill rather than on the count: the restricted tiles must
    // touch the locked door, or the "smaller side" picked was not the side behind it.
    const l = level("main2");
    const door = lockedDoorsOn(l).find((t) => t.x === 29 && t.y === 3);
    expect(door).toBeDefined();
    const near = [
      clearanceAt(l.restricted, door!.x - 1, door!.y),
      clearanceAt(l.restricted, door!.x + 1, door!.y),
      clearanceAt(l.restricted, door!.x, door!.y - 1),
      clearanceAt(l.restricted, door!.x, door!.y + 1),
    ];
    expect(near.some((c) => c !== 0)).toBe(true);
  });
});

describe("autoClearanceLevel — a declared board", () => {
  /** A bare 6x3 level with a floor, so the fill has open ground to work on. */
  const bare = (): GameLevel => ({
    name: "test",
    width: 6,
    height: 3,
    layers: [
      {
        name: "floor",
        tiles: Array.from({ length: 18 }, (_, i) => tile(i % 6, Math.floor(i / 6), [])),
      },
    ],
  });

  const tile = (
    x: number,
    y: number,
    components: GameTile["components"],
  ): GameTile => ({
    x,
    y,
    handle: 0,
    ref: "test",
    colSpan: 1,
    rowSpan: 1,
    offsetX: 0,
    offsetY: 0,
    flipY: false,
    tint: 0xffffff,
    components,
  });

  it("marks exactly the declared tiles at the clearance they name", () => {
    const l = bare();
    l.layers.push({
      name: RESTRICTED_BOARD,
      tiles: [tile(2, 1, [{ type: "restricted", values: { clearance: "3" } }])],
    });
    autoClearanceLevel(l, 32);
    expect(clearanceAt(l.restricted, 2, 1)).toBe(3);
    expect(restrictedTileCount(l.restricted)).toBe(1);
  });

  it("ignores a declared tile that names no clearance", () => {
    // `num()` reads a blank field as unset and a 0 means open ground, so a marker with
    // nothing on it restricts nothing rather than defaulting to some clearance the
    // author never asked for.
    const l = bare();
    l.layers.push({
      name: RESTRICTED_BOARD,
      tiles: [tile(2, 1, [{ type: "restricted", values: {} }])],
    });
    autoClearanceLevel(l, 32);
    expect(restrictedTileCount(l.restricted)).toBe(0);
  });

  it("suppresses derivation entirely on a level that declares its own", () => {
    // The point of the rule: an author who marked one room must not also get an apron
    // round every terminal they did not mark, or their board becomes an addition to
    // something they cannot see and cannot unmark.
    const l = bare();
    l.layers.push({
      name: "terminals",
      tiles: [tile(4, 1, [{ type: "terminal", values: {} }])],
    });
    autoClearanceLevel(l, 32);
    const derived = restrictedTileCount(l.restricted);
    expect(derived).toBeGreaterThan(0);

    l.layers.push({
      name: RESTRICTED_BOARD,
      tiles: [tile(0, 0, [{ type: "restricted", values: { clearance: "2" } }])],
    });
    autoClearanceLevel(l, 32);
    expect(restrictedTileCount(l.restricted)).toBe(1);
    expect(clearanceAt(l.restricted, 4, 1)).toBe(0);
  });

  it("reaches POSTED_RADIUS_TILES from a fixture and no further", () => {
    const l = bare();
    l.layers.push({
      name: "terminals",
      tiles: [tile(0, 1, [{ type: "terminal", values: {} }])],
    });
    autoClearanceLevel(l, 32);
    expect(clearanceAt(l.restricted, POSTED_RADIUS_TILES, 1)).toBe(POSTED_CLEARANCE);
    expect(clearanceAt(l.restricted, POSTED_RADIUS_TILES + 1, 1)).toBe(0);
  });

  it("does not bleed through a wall into the room next door", () => {
    // The reason this is a bounded fill rather than a radius check. A plain distance
    // test would put restricted ground on the far side of a wall the player cannot see
    // the terminal through, with nothing on screen to explain it.
    const l = bare();
    l.layers.push({
      name: "walls",
      tiles: [tile(1, 0, []), tile(1, 1, []), tile(1, 2, [])],
    });
    l.layers.push({
      name: "terminals",
      tiles: [tile(0, 1, [{ type: "terminal", values: {} }])],
    });
    autoClearanceLevel(l, 32);
    expect(clearanceAt(l.restricted, 0, 1)).toBe(POSTED_CLEARANCE);
    expect(clearanceAt(l.restricted, 2, 1)).toBe(0);
  });
});
