import { describe, it, expect } from "vitest";
import { TransitionGraph } from "./TransitionGraph";
import type { GameMap } from "../map/types";

/** A tile at (x,y) with a ref — the only fields the graph reads. */
const tile = (x: number, y: number, ref = ""): unknown => ({ x, y, ref });

/** `name -> board -> tiles`, the shape the graph walks. */
function mapOf(levels: [string, Record<string, unknown[]>][]): GameMap {
  return {
    name: "t",
    tileWidth: 32,
    tileHeight: 32,
    sheetTextureKeys: [],
    levels: levels.map(([name, boards]) => ({
      name,
      width: 48,
      height: 36,
      layers: Object.entries(boards).map(([b, tiles]) => ({ name: b, tiles })),
    })),
  } as unknown as GameMap;
}

describe("TransitionGraph — numbered access pairs", () => {
  it("links hatchN to ladderN even when the two ends disagree on coordinates", () => {
    // The roof pair on NW-SMAC-01: main2 (5,1), roof_array (6,30), no shared
    // coordinate anywhere, which coordinate matching cannot bridge at all.
    const g = new TransitionGraph(
      mapOf([
        ["main2", { roof_access: [tile(5, 1, "ladder3")] }],
        ["roof_array", { roof_access: [tile(6, 30, "hatch3")] }],
      ]),
    );
    expect(g.at("main2", 5, 1)).toEqual({
      toLevel: "roof_array",
      toX: 6,
      toY: 30,
      kind: "roof_access",
    });
    expect(g.at("roof_array", 6, 30)).toEqual({
      toLevel: "main2",
      toX: 5,
      toY: 1,
      kind: "roof_access",
    });
  });

  it("finds a numbered tile filed on a board that isn't a transition board", () => {
    // main1's `hatch1` sits on `entities`, which left the start level with no exit.
    const g = new TransitionGraph(
      mapOf([
        ["main1", { entities: [tile(38, 27, "hatch1"), tile(9, 18, "security2")] }],
        ["duct1", { maintenance_access: [tile(38, 27, "ladder1")] }],
      ]),
    );
    // Treated as a hatch, so it prompts rather than teleporting anyone who walks over it.
    expect(g.at("main1", 38, 27)).toEqual({
      toLevel: "duct1",
      toX: 38,
      toY: 27,
      kind: "maintenance_access",
    });
    expect(g.at("main1", 9, 18)).toBeUndefined();
  });

  it("ignores intra-level ramp art that merely mentions stairs", () => {
    // The reason the rule is anchored on `^(hatch|ladder)N$` and not a loose
    // /stair/: these boards are full of art that would otherwise become exits.
    const g = new TransitionGraph(
      mapOf([
        [
          "vent_core",
          {
            catwalks: [tile(2, 2, "stair_rail_top_left1")],
            ramps: [tile(8, 10, "stairs_catwalk2"), tile(2, 4, "stairs_rail_bottom_left1")],
          },
        ],
        ["main2", { ramp: [tile(12, 8, "stairs_up_east2")] }],
      ]),
    );
    expect(g.exitsOn("vent_core")).toEqual([]);
    expect(g.exitsOn("main2")).toEqual([]);
  });

  it("leaves a number with only one end, or three, alone", () => {
    const g = new TransitionGraph(
      mapOf([
        ["a", { maintenance_access: [tile(1, 1, "hatch7")] }],
        ["b", { maintenance_access: [tile(4, 4, "hatch8")] }],
        ["c", { maintenance_access: [tile(5, 5, "ladder8")] }],
        ["d", { maintenance_access: [tile(6, 6, "hatch8")] }],
      ]),
    );
    // 7 has one end; 8 has three, so there is no telling which way it runs.
    expect(g.at("a", 1, 1)).toBeUndefined();
    expect(g.at("b", 4, 4)).toBeUndefined();
    expect(g.at("c", 5, 5)).toBeUndefined();
  });

  it("still pairs by coordinate when no numbering is present", () => {
    const g = new TransitionGraph(
      mapOf([
        ["duct2", { stairs: [tile(43, 1, "stairs_up_east1")] }],
        ["vent_core", { stairs: [tile(43, 1, "stairs_down_west1")] }],
      ]),
    );
    expect(g.at("duct2", 43, 1)).toEqual({
      toLevel: "vent_core",
      toX: 43,
      toY: 1,
      kind: "stairs",
    });
  });

  it("lets a numbered pair override the coordinate fallback", () => {
    // vent_core's dangling stair falls back to duct2 on affinity alone; the
    // grafted `hatch9`/`ladder9` says where it actually goes.
    const g = new TransitionGraph(
      mapOf([
        ["duct2", { stairs: [tile(43, 1)] }],
        ["vent_core", { stairs: [tile(43, 1), tile(3, 33), tile(3, 33, "hatch9")] }],
        ["main2", { stairs: [tile(5, 31, "ladder9")] }],
      ]),
    );
    expect(g.at("vent_core", 3, 33)?.toLevel).toBe("main2");
    expect(g.at("main2", 5, 31)?.toLevel).toBe("vent_core");
    // and the honest coordinate pair is untouched
    expect(g.at("vent_core", 43, 1)?.toLevel).toBe("duct2");
  });
});
