import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { EdplayLoader, type ParsedMap } from "./EdplayLoader";
import { planFor } from "./MapPlan";
import type { EdPlayFile, GameMap } from "./types";
import { TransitionGraph } from "../systems/TransitionGraph";
import { appendVentCore, VENT_CORE_LEVEL } from "./VentCoreLevel";

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
    expect(level!.width).toBe(48);
    expect(level!.height).toBe(36);
    const names = level!.layers.map((l) => l.name);
    for (const board of [
      "VENT-4",
      "floor",
      "walls",
      "catwalks",
      "stairs",
      "ramps",
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
    // duct2's stairs and vent_core's stairs share (43,1) — no injected hatch, no
    // (18,34): the old generator's entry point describes an arena this map doesn't
    // have. This one connects on a `stairs` board, so it triggers on contact.
    const graph = new TransitionGraph(parsed.map);
    expect(graph.at("duct2", 43, 1)).toEqual({
      toLevel: VENT_CORE_LEVEL,
      toX: 43,
      toY: 1,
      kind: "stairs",
    });
    expect(graph.at(VENT_CORE_LEVEL, 43, 1)).toEqual({
      toLevel: "duct2",
      toX: 43,
      toY: 1,
      kind: "stairs",
    });
  });

  it("leaves duct2's own link to duct1 untouched", () => {
    // duct2's sibling link on this map is to duct1, not main1 — this map's route is
    // main1 -> duct1 -> duct2 -> vent_core, with no direct duct2/main1 link at all.
    const graph = new TransitionGraph(parsed.map);
    expect(graph.at("duct2", 1, 1)?.toLevel).toBe("duct1");
    expect(graph.at("duct1", 1, 1)?.toLevel).toBe("duct2");
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

  it("extracts the five authored sub-stations off the energy board, framed", () => {
    // Moved off `energy` (not cloned) so the tile bake stops painting them where
    // the entity now draws its own sprite — see AdoptAuthored.adoptVentCore.
    const level = parsed.map.levels.find((l) => l.name === VENT_CORE_LEVEL)!;
    const subs = level.layers.find((l) => l.name === "substations")!.tiles;
    expect(subs.map((t) => ({ x: t.x, y: t.y }))).toEqual([
      { x: 10, y: 4 },
      { x: 9, y: 31 },
      { x: 44, y: 7 },
      { x: 33, y: 33 },
      { x: 44, y: 15 },
    ]);
    for (const s of subs) expect(s.frame).toBeDefined();
    // The fusion core is not a sub-station and stays on `energy`.
    const energy = level.layers.find((l) => l.name === "energy")!.tiles;
    expect(energy.some((t) => t.ref === "VENT-4_fusion_core")).toBe(true);
  });

  it("anchors the hub on the authored VENT-4 chassis", () => {
    const level = parsed.map.levels.find((l) => l.name === VENT_CORE_LEVEL)!;
    const hub = level.layers.find((l) => l.name === "vent_hub")!.tiles;
    expect(hub).toHaveLength(1);
    expect({ x: hub[0].x, y: hub[0].y }).toEqual({ x: 22, y: 18 });
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
