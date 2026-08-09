import { describe, it, expect } from "vitest";
import { adoptRoofArray, adoptVentCore, graftExtractionEntrance } from "./AdoptAuthored";
import { MissingProto, requireClear } from "./generate";
import type { GameLevel, GameMap, GameTile } from "./types";

const tile = (x: number, y: number, ref = "", components: unknown[] = []): GameTile =>
  ({ x, y, ref, handle: 1, colSpan: 1, rowSpan: 1, offsetX: 0, offsetY: 0, components }) as GameTile;

/** A full-floor level of `w`×`h`, plus whatever boards the case needs. */
function levelOf(name: string, boards: Record<string, GameTile[]>, w = 48, h = 36): GameLevel {
  const floor: GameTile[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) floor.push(tile(x, y, "floor0"));
  return {
    name,
    width: w,
    height: h,
    layers: [{ name: "floor", tiles: floor }, ...Object.entries(boards).map(([n, t]) => ({ name: n, tiles: t }))],
  } as unknown as GameLevel;
}

const mapOf = (levels: GameLevel[]): GameMap =>
  ({ name: "t", tileWidth: 32, tileHeight: 32, sheetTextureKeys: [], levels }) as unknown as GameMap;

const board = (l: GameLevel, name: string): GameTile[] =>
  l.layers.find((b) => b.name === name)?.tiles ?? [];

describe("adoptVentCore", () => {
  const arena = (): GameLevel =>
    levelOf("vent_core", {
      "VENT-4": [tile(22, 18, "tdVent_4_Chassis1"), tile(13, 13, "Steam_Vent1")],
      energy: [tile(9, 31, "substation_energy_vertical1"), tile(21, 17, "VENT-4_fusion_core")],
      walls: [tile(18, 15, "Concrete_Wall")],
      winches: [tile(7, 4, "tdWinch1")],
    });

  it("moves sub-stations off the art board so they aren't drawn twice", () => {
    const l = arena();
    expect(adoptVentCore(l)).toBe(true);
    expect(board(l, "substations").map((t) => t.ref)).toEqual(["substation_energy_vertical1"]);
    // The fusion core is not a sub-station and stays where the author put it.
    expect(board(l, "energy").map((t) => t.ref)).toEqual(["VENT-4_fusion_core"]);
  });

  it("anchors the hub on the authored chassis and derives what isn't authored", () => {
    const l = arena();
    adoptVentCore(l);
    expect(board(l, "vent_hub").map((t) => ({ x: t.x, y: t.y }))).toEqual([{ x: 22, y: 18 }]);
    expect(board(l, "steam")).toHaveLength(1);
    for (const derived of ["pitons", "drips", "grates", "columns"]) {
      expect(board(l, derived).length, derived).toBeGreaterThan(0);
    }
    // Derived anchors land inside the level, not off the edge of it.
    for (const b of ["pitons", "drips", "grates"]) {
      for (const t of board(l, b)) {
        expect(t.x, `${b} x`).toBeGreaterThanOrEqual(0);
        expect(t.x, `${b} x`).toBeLessThan(l.width);
        expect(t.y, `${b} y`).toBeLessThan(l.height);
      }
    }
  });

  it("keeps anything the author placed themselves", () => {
    const l = arena();
    l.layers.push({ name: "pitons", tiles: [tile(1, 1, "mine")] });
    adoptVentCore(l);
    expect(board(l, "pitons").map((t) => t.ref)).toEqual(["mine"]);
  });

  it("declines an arena with no turbine, rather than claiming a boss", () => {
    const l = levelOf("vent_core", { energy: [tile(9, 31, "substation_energy_vertical1")] });
    expect(adoptVentCore(l)).toBe(false);
  });

  it("declines when nothing can serve as a sub-station", () => {
    const l = levelOf("vent_core", { "VENT-4": [tile(22, 18, "tdVent_4_Chassis1")] });
    expect(adoptVentCore(l)).toBe(false);
  });
});

describe("adoptRoofArray", () => {
  const roof = (): GameLevel =>
    levelOf("roof_array", {
      uplink: [tile(25, 17, "tdSatellite_Dish1_0")],
      terminals: [
        tile(6, 4, "calibration_pedestal1", [{ type: "terminal", values: { type: "LOG_CACHE" } }]),
        tile(41, 30, "calibration_pedestal2"),
      ],
      entities: [tile(23, 5, "enforcer1")],
    });

  it("takes the pedestals off `terminals` so they stop counting as log caches", () => {
    const l = roof();
    expect(adoptRoofArray(mapOf([l]), l)).toBe(true);
    expect(board(l, "relay_pedestals")).toHaveLength(2);
    expect(board(l, "terminals")).toHaveLength(0);
  });

  it("anchors the dish, stands a feed, and uses the authored guards as siege mouths", () => {
    const l = roof();
    adoptRoofArray(mapOf([l]), l);
    expect(board(l, "relay_dish").map((t) => ({ x: t.x, y: t.y }))).toEqual([{ x: 25, y: 17 }]);
    expect(board(l, "relay_feed")).toHaveLength(1);
    expect(board(l, "siege_mouths").map((t) => ({ x: t.x, y: t.y }))).toEqual([{ x: 23, y: 5 }]);
    expect(board(l, "searchlights").length).toBeGreaterThan(0);
  });

  it("declines a roof with no dish to aim", () => {
    const l = levelOf("roof_array", { terminals: [tile(6, 4, "calibration_pedestal1")] });
    expect(adoptRoofArray(mapOf([l]), l)).toBe(false);
  });
});

describe("graftExtractionEntrance", () => {
  it("joins a dangling stair to an extraction level nothing reaches", () => {
    const vent = levelOf("vent_core", { stairs: [tile(3, 33, "stairs_up_west1")] });
    const main2 = levelOf("main2", { walls: [tile(3, 33, "Concrete_Wall")] });
    const m = mapOf([vent, main2]);

    expect(graftExtractionEntrance(m, "main2")).toBe(true);
    const arrival = board(main2, "stairs");
    expect(arrival).toHaveLength(1);
    // Not the donor's own coordinate — that one is a wall on this side.
    expect({ x: arrival[0].x, y: arrival[0].y }).not.toEqual({ x: 3, y: 33 });
    // Both ends carry the numbered convention that declares the link.
    expect(arrival[0].ref).toBe("ladder9");
    expect(board(vent, "stairs").some((t) => t.ref === "hatch9")).toBe(true);
  });

  it("does nothing when the extraction level is already reachable on foot", () => {
    const vent = levelOf("vent_core", { stairs: [tile(3, 33)] });
    const main2 = levelOf("main2", { stairs: [tile(9, 9)] });
    expect(graftExtractionEntrance(mapOf([vent, main2]), "main2")).toBe(false);
    expect(board(main2, "stairs")).toHaveLength(1);
  });

  it("does nothing when no stair dangles", () => {
    const a = levelOf("a", { stairs: [tile(4, 4)] });
    const b = levelOf("b", { stairs: [tile(4, 4)] });
    const main2 = levelOf("main2", {});
    expect(graftExtractionEntrance(mapOf([a, b, main2]), "main2")).toBe(false);
  });
});

describe("requireClear", () => {
  it("rejects a coordinate off the edge of the level", () => {
    // The vault's nodes reached y=37 on a level 36 tall and were waved through,
    // because nothing had built a wall out there to collide with.
    const l = levelOf("main2", {}, 48, 36);
    expect(() => requireClear(l, "main2", [{ x: 14, y: 37 }])).toThrow(MissingProto);
    expect(() => requireClear(l, "main2", [{ x: -1, y: 4 }])).toThrow(MissingProto);
    expect(() => requireClear(l, "main2", [{ x: 14, y: 30 }])).not.toThrow();
  });

  it("still rejects walls", () => {
    const l = levelOf("main2", { walls: [tile(8, 8)] });
    expect(() => requireClear(l, "main2", [{ x: 8, y: 8 }])).toThrow(MissingProto);
  });
});
