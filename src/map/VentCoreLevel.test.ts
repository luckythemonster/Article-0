import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { EdplayLoader, type ParsedMap } from "./EdplayLoader";
import { planFor } from "./MapPlan";
import type { EdPlayFile, GameMap } from "./types";
import { TransitionGraph } from "../systems/TransitionGraph";
import { appendVentCore, VENT_CORE_LEVEL } from "./VentCoreLevel";
import { chestStatsFor, STAPLER_ITEM } from "../systems/EntityStats";

/**
 * Integration test on the real shipped map.
 *
 * NW-SMAC-01 authors its own `vent_core`, so `appendVentCore` takes the *adopt*
 * path (`src/map/AdoptAuthored.ts`) rather than generating one from scratch —
 * the generator's own board list, wall-ring geometry and hatch coordinate never
 * come into play here. `AdoptAuthored.test.ts` covers that mechanism on hand-made
 * fixtures; this file's job is to check the real data actually goes through it
 * correctly, one level up.
 */
describe("VentCoreLevel — real map, adopt path", () => {
  let parsed: ParsedMap;

  beforeAll(() => {
    const raw = JSON.parse(
      readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
    ) as EdPlayFile;
    parsed = EdplayLoader.parse(raw, raw.SpriteSheets.map((s) => s.RelativePath));
    appendVentCore(parsed.map, planFor(parsed.map).ventCoreHost);
  });

  it("adopts the authored level rather than generating one", () => {
    const level = parsed.map.levels.find((l) => l.name === VENT_CORE_LEVEL);
    expect(level).toBeDefined();
    // The authored dimensions, not the generator's fixed 40×45.
    expect(level!.width).toBe(36);
    expect(level!.height).toBe(18);
    const names = level!.layers.map((l) => l.name);
    for (const board of [
      "floor",
      "walls",
      "catwalks",
      "verticals",
      "vents",
      "items",
      "winches",
      "energy",
      "substations",
      "vent_hub",
      "steam",
      "columns",
      "pitons",
      "drips",
      "grates",
    ]) {
      expect(names, board).toContain(board);
    }
  });

  it("links duct2 to vent_core by the real coordinate the map authored, on foot", () => {
    // Both ends are stair art on the `verticals` board at (33,16) — no injected
    // hatch, and no (18,34): the old generator's entry point describes an arena
    // this map doesn't have. Stair art triggers on contact.
    const graph = new TransitionGraph(parsed.map);
    expect(graph.at("duct2", 33, 16)).toEqual({
      toLevel: VENT_CORE_LEVEL,
      toX: 33,
      toY: 16,
      kind: "stairs",
    });
    expect(graph.at(VENT_CORE_LEVEL, 33, 16)).toEqual({
      toLevel: "duct2",
      toX: 33,
      toY: 16,
      kind: "stairs",
    });
  });

  it("leaves duct2's own link to duct1 untouched", () => {
    // duct2's sibling link on this map is to duct1, not main1 — this map's route is
    // main1 -> duct1 -> duct2 -> vent_core, with no direct duct2/main1 link at all.
    const graph = new TransitionGraph(parsed.map);
    expect(graph.at("duct2", 1, 7)?.toLevel).toBe("duct1");
    expect(graph.at("duct1", 1, 7)?.toLevel).toBe("duct2");
  });

  it("is idempotent — the registry-cached map must not grow twice", () => {
    const levelCount = parsed.map.levels.length;
    const substationCount = parsed.map.levels
      .find((l) => l.name === VENT_CORE_LEVEL)!
      .layers.find((l) => l.name === "substations")!.tiles.length;
    appendVentCore(parsed.map, planFor(parsed.map).ventCoreHost);
    expect(parsed.map.levels.length).toBe(levelCount);
    expect(
      parsed.map.levels
        .find((l) => l.name === VENT_CORE_LEVEL)!
        .layers.find((l) => l.name === "substations")!.tiles.length,
    ).toBe(substationCount);
  });

  it("paints only frames the parse already registered", () => {
    const known = new Set(parsed.uniqueFrames.map((f) => f.frameKey));
    const level = parsed.map.levels.find((l) => l.name === VENT_CORE_LEVEL)!;
    for (const layer of level.layers) {
      for (const tile of layer.tiles) {
        if (tile.frame) expect(known.has(tile.frame.frameKey)).toBe(true);
      }
    }
  });

  it("extracts the four authored pressure capacitors as sub-stations, framed", () => {
    // Moved off their own board (not cloned) so the tile bake stops painting them
    // where the entity now draws its own sprite — see AdoptAuthored.adoptVentCore.
    const level = parsed.map.levels.find((l) => l.name === VENT_CORE_LEVEL)!;
    const subs = level.layers.find((l) => l.name === "substations")!.tiles;
    expect(subs.map((t) => ({ x: t.x, y: t.y }))).toEqual([
      { x: 13, y: 16 },
      { x: 24, y: 16 },
      { x: 13, y: 1 },
      { x: 24, y: 1 },
    ]);
    for (const s of subs) expect(s.frame).toBeDefined();
    expect(level.layers.find((l) => l.name === "VENT-4_capacitors")!.tiles).toHaveLength(0);
  });

  it("anchors the hub between the two authored turbines", () => {
    const level = parsed.map.levels.find((l) => l.name === VENT_CORE_LEVEL)!;
    const hub = level.layers.find((l) => l.name === "vent_hub")!.tiles;
    expect(hub).toHaveLength(1);
    // turbine1 (17,9) and turbine2 (19,9), so the arena turns about (18,9).
    expect({ x: hub[0].x, y: hub[0].y }).toEqual({ x: 18, y: 9 });
  });

  it("furnishes the supply chest the author drew but never wired up", () => {
    // `vent_core`'s `items` board carries one tile drawn with the chest sprite's own
    // frames — and, in the raw map, no DataComponents at all. `indexFixtures` gates on
    // `has(t, "chest")`, so it walked straight past, and the Rail-Stapler behind it was
    // unobtainable in normal play: VENT-4's JAMMED phase had nothing to answer it.
    const level = parsed.map.levels.find((l) => l.name === VENT_CORE_LEVEL)!;
    const chests = (level.layers.find((l) => l.name === "items")?.tiles ?? []).filter((t) =>
      t.components.some((c) => c.type === "chest"),
    );
    expect(chests).toHaveLength(1);
    expect(chestStatsFor(chests[0].components).items).toContain(STAPLER_ITEM);
  });

  it("furnishes it in place, keeping the tile the author drew", () => {
    // Adding the missing component rather than cloning a donor chest over the top: the
    // sprite frames and collider are the author's and must survive.
    const level = parsed.map.levels.find((l) => l.name === VENT_CORE_LEVEL)!;
    const chest = level.layers.find((l) => l.name === "items")!.tiles[0];
    // Still the author's `item_chest5`, with its own art and collider — not a clone of
    // some other level's chest dropped over the top.
    expect(chest).toMatchObject({ x: 32, y: 12, ref: "item_chest5" });
    expect(chest.frame).toBeDefined();
    expect(chest.stateFrames?.empty).toBeDefined();
  });

  it("keeps every derived anchor on the level", () => {
    // The generator's constants describe a 40×45 arena; this one is 36×18, so an
    // unfiltered fallback aims the mechanic at tiles no player can reach.
    const level = parsed.map.levels.find((l) => l.name === VENT_CORE_LEVEL)!;
    for (const board of ["pitons", "drips", "grates", "columns", "steam", "winches"]) {
      const tiles = level.layers.find((l) => l.name === board)!.tiles;
      expect(tiles.length, board).toBeGreaterThan(0);
      for (const t of tiles) {
        expect(t.x, `${board} x`).toBeGreaterThanOrEqual(0);
        expect(t.x, `${board} x`).toBeLessThan(level.width);
        expect(t.y, `${board} y`).toBeGreaterThanOrEqual(0);
        expect(t.y, `${board} y`).toBeLessThan(level.height);
      }
    }
  });

  describe("when the map can't host it", () => {
    /** A minimal map with no maintenance level and none of the prototype boards. */
    const bareMap = (): GameMap =>
      ({
        name: "bare",
        tileWidth: 32,
        tileHeight: 32,
        sheetTextureKeys: [],
        levels: [
          {
            name: "only",
            width: 10,
            height: 10,
            layers: [{ name: "floor", tiles: [{ x: 1, y: 1, ref: "f", components: [] }] }],
          },
        ],
      }) as unknown as GameMap;

    it("skips generation instead of throwing when there is no host", () => {
      const m = bareMap();
      // This used to throw ("duct2 level missing from map") and, because BootScene calls it
      // unconditionally, took the whole boot down for any map but the shipped one.
      expect(() => appendVentCore(m, null)).not.toThrow();
      expect(appendVentCore(m, null)).toBe(false);
      expect(m.levels.map((l) => l.name)).toEqual(["only"]);
    });

    it("skips when the named host is absent, or can't furnish the prototypes", () => {
      const m = bareMap();
      expect(appendVentCore(m, "nonexistent")).toBe(false);
      // "only" exists but has no walls/terminals/cover/... to clone from.
      expect(() => appendVentCore(m, "only")).not.toThrow();
      expect(appendVentCore(m, "only")).toBe(false);
      expect(m.levels).toHaveLength(1);
    });

    it("reports true for the shipped map, which adopts its own arena", () => {
      expect(planFor(parsed.map).ventCoreHost).toBe("duct2");
      // Already adopted in beforeAll, so this is the idempotent path.
      expect(appendVentCore(parsed.map, "duct2")).toBe(true);
    });
  });
});
