import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { EdplayLoader, type ParsedMap } from "./EdplayLoader";
import type { EdPlayFile } from "./types";
import { TransitionGraph } from "../systems/TransitionGraph";
import { STAPLER_ITEM } from "../systems/EntityStats";
import { chestStatsFor } from "../systems/EntityStats";
import {
  appendVentCore,
  VENT_CORE_ENTRY,
  VENT_CORE_LEVEL,
  VENT_CORE_SUBSTATIONS,
  ventCoreGrateTiles,
} from "./VentCoreLevel";

/**
 * Integration test on the real shipped map: the synthetic arena must slot into
 * the parsed model exactly like an authored level, and must not disturb any
 * existing transition link.
 */
describe("VentCoreLevel", () => {
  let parsed: ParsedMap;

  beforeAll(() => {
    const raw = JSON.parse(
      readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
    ) as EdPlayFile;
    parsed = EdplayLoader.parse(raw, raw.SpriteSheets.map((s) => s.RelativePath));
    appendVentCore(parsed.map);
  });

  it("appends the level with every expected board", () => {
    const level = parsed.map.levels.find((l) => l.name === VENT_CORE_LEVEL);
    expect(level).toBeDefined();
    const names = level!.layers.map((l) => l.name);
    for (const board of [
      "floor",
      "grates",
      "cover",
      "light_sources",
      "walls",
      "maintenance_access",
      "substations",
      "items",
      "spawn",
    ]) {
      expect(names).toContain(board);
    }
    expect(level!.width).toBe(40);
    expect(level!.height).toBe(45);
  });

  it("links duct2 (18,34) to vent_core and back, exactly", () => {
    const graph = new TransitionGraph(parsed.map);
    expect(graph.at("duct2", VENT_CORE_ENTRY.x, VENT_CORE_ENTRY.y)).toEqual({
      toLevel: VENT_CORE_LEVEL,
      toX: VENT_CORE_ENTRY.x,
      toY: VENT_CORE_ENTRY.y,
      kind: "maintenance_access",
    });
    expect(graph.at(VENT_CORE_LEVEL, VENT_CORE_ENTRY.x, VENT_CORE_ENTRY.y)).toEqual({
      toLevel: "duct2",
      toX: VENT_CORE_ENTRY.x,
      toY: VENT_CORE_ENTRY.y,
      kind: "maintenance_access",
    });
  });

  it("leaves the existing duct2 <-> main1 links untouched", () => {
    const graph = new TransitionGraph(parsed.map);
    expect(graph.at("duct2", 2, 34)?.toLevel).toBe("main1");
    expect(graph.at("duct2", 35, 34)?.toLevel).toBe("main1");
    expect(graph.at("main1", 2, 34)?.toLevel).toBe("duct2");
    expect(graph.at("main1", 35, 34)?.toLevel).toBe("duct2");
  });

  it("is idempotent (the parsed map is registry-cached and must not grow twice)", () => {
    const levelCount = parsed.map.levels.length;
    const duct2Access = parsed.map.levels
      .find((l) => l.name === "duct2")!
      .layers.find((l) => l.name === "maintenance_access")!;
    const accessCount = duct2Access.tiles.length;
    appendVentCore(parsed.map);
    expect(parsed.map.levels.length).toBe(levelCount);
    expect(duct2Access.tiles.length).toBe(accessCount);
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

  it("places three framed sub-stations and a stapler chest", () => {
    const level = parsed.map.levels.find((l) => l.name === VENT_CORE_LEVEL)!;
    const subs = level.layers.find((l) => l.name === "substations")!.tiles;
    expect(subs.map((t) => ({ x: t.x, y: t.y }))).toEqual(VENT_CORE_SUBSTATIONS);
    for (const s of subs) expect(s.frame).toBeDefined();

    const chest = level.layers.find((l) => l.name === "items")!.tiles[0];
    expect(chest.components.some((c) => c.type === "chest")).toBe(true);
    expect(chestStatsFor(chest.components).items).toEqual([
      STAPLER_ITEM,
      "Sealant Tape",
      "Q0 Filter Mask",
    ]);
  });

  it("keeps the walls closed and the hatch inside them", () => {
    const level = parsed.map.levels.find((l) => l.name === VENT_CORE_LEVEL)!;
    const walls = new Set(
      level.layers.find((l) => l.name === "walls")!.tiles.map((t) => `${t.x},${t.y}`),
    );
    for (let x = 6; x <= 34; x++) {
      expect(walls.has(`${x},6`)).toBe(true);
      expect(walls.has(`${x},36`)).toBe(true);
    }
    for (let y = 6; y <= 36; y++) {
      expect(walls.has(`6,${y}`)).toBe(true);
      expect(walls.has(`34,${y}`)).toBe(true);
    }
    expect(walls.has(`${VENT_CORE_ENTRY.x},${VENT_CORE_ENTRY.y}`)).toBe(false);
    // Grates never sit on blocked or entity tiles.
    for (const g of ventCoreGrateTiles()) {
      expect(walls.has(`${g.x},${g.y}`)).toBe(false);
    }
  });
});
