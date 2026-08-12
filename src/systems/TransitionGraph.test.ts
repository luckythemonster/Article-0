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

  it("lets a numbered pair beat coordinate matching", () => {
    // vent_core's stair at (3,33) has no twin anywhere; the grafted
    // `hatch9`/`ladder9` is what says where it actually goes.
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

describe("TransitionGraph — the consolidated `verticals` board", () => {
  it("links two levels sharing a coordinate, and reads the trigger off the art", () => {
    // NW-SMAC-01 v0.4 files every way out on one board and aligns both ends on
    // the same tile, so the board name no longer has to carry the trigger style
    // — the ref does. Stairs are walked over; hatches and ladders prompt.
    const g = new TransitionGraph(
      mapOf([
        ["main1", { verticals: [tile(10, 14, "access_hatch1")] }],
        ["duct1", { verticals: [tile(10, 14, "ladder_up1"), tile(33, 16, "stairs_down_east_metal1")] }],
        ["vent_core", { verticals: [tile(33, 16, "stairs_up_west_rails_double_metal1")] }],
      ]),
    );
    expect(g.at("main1", 10, 14)).toEqual({
      toLevel: "duct1",
      toX: 10,
      toY: 14,
      kind: "maintenance_access",
    });
    expect(g.at("duct1", 33, 16)).toEqual({
      toLevel: "vent_core",
      toX: 33,
      toY: 16,
      kind: "stairs",
    });
  });

  it("ignores art and guard posts sharing the board", () => {
    // main2vault files two `stairwell1` tiles carrying `enemySpawn` on `verticals`
    // beside the real stair. Without the ref filter, walking onto a guard post
    // teleports the player off the level.
    const g = new TransitionGraph(
      mapOf([
        ["main2", { verticals: [tile(25, 14, "stairs_down_south_cement1")] }],
        [
          "main2vault",
          {
            verticals: [
              tile(25, 14, "stairs_down_north_cement1"),
              tile(25, 15, "stairwell1"),
              tile(25, 16, "stairwell1"),
            ],
          },
        ],
      ]),
    );
    expect(g.at("main2vault", 25, 15)).toBeUndefined();
    expect(g.at("main2vault", 25, 16)).toBeUndefined();
    expect(g.exitsOn("main2vault")).toHaveLength(1);
  });

  it("rides a three-level elevator as a cycle rather than stranding a floor", () => {
    // Pairwise matching gives each car exactly one destination, which leaves the
    // last floor — the roof, and the extraction deck — with no way in at all.
    const car = (): unknown[] => [tile(5, 1, "elevator"), tile(6, 1, "door_elevator_vertical1")];
    const g = new TransitionGraph(
      mapOf([
        ["vent_core", { elevator_bottom: car() }],
        ["main2", { elevator: car() }],
        ["roof_array", { elevator: car() }],
      ]),
    );
    expect(g.at("vent_core", 5, 1)?.toLevel).toBe("main2");
    expect(g.at("main2", 5, 1)?.toLevel).toBe("roof_array");
    expect(g.at("roof_array", 5, 1)?.toLevel).toBe("vent_core");
    // The car's doors are art on the same board, not a second stop.
    expect(g.at("main2", 6, 1)).toBeUndefined();
  });

  it("bridges two unpartnered ends one tile apart on one axis", () => {
    // secret1's only hatch is a tile off duct1's, which strands the level.
    const g = new TransitionGraph(
      mapOf([
        ["duct1", { verticals: [tile(24, 13, "access_hatch4")] }],
        ["secret1", { verticals: [tile(23, 13, "access_hatch2")] }],
      ]),
    );
    expect(g.at("duct1", 24, 13)).toEqual({
      toLevel: "secret1",
      toX: 23,
      toY: 13,
      kind: "maintenance_access",
    });
    expect(g.at("secret1", 23, 13)?.toLevel).toBe("duct1");
  });

  it("leaves a lone dangling tile inert rather than guessing a destination", () => {
    // duct1's spare `ladder_up1` at (34,14) has no partner anywhere. The old
    // ragged-cluster fallback pointed exactly this kind of tile at whichever
    // level shared the most coordinates, dropping the player on an unrelated hatch.
    const g = new TransitionGraph(
      mapOf([
        ["main1", { verticals: [tile(10, 14, "access_hatch1")] }],
        ["duct1", { verticals: [tile(10, 14, "ladder_up1"), tile(34, 14, "ladder_up1")] }],
      ]),
    );
    expect(g.at("duct1", 34, 14)).toBeUndefined();
    expect(g.exitsOn("duct1")).toHaveLength(1);
  });

  it("does not bridge a diagonal miss, or one on another board class", () => {
    const g = new TransitionGraph(
      mapOf([
        ["duct1", { verticals: [tile(34, 14, "ladder_up1")] }],
        // one tile away, but diagonally
        ["vent_core", { verticals: [tile(35, 15, "ladder_up3")] }],
        // adjacent, but an elevator car is a different class
        ["main2", { elevator: [tile(34, 15, "elevator")] }],
      ]),
    );
    expect(g.exitsOn("duct1")).toEqual([]);
    expect(g.exitsOn("vent_core")).toEqual([]);
    expect(g.exitsOn("main2")).toEqual([]);
  });

  it("leaves intra-level ladder boards out of the graph entirely", () => {
    // vent_core's catwalk↔floor ladders share all three coordinates with each
    // other. They are one level's internal geometry, not a way out, and the
    // engine models no intra-level verticals — so they must classify as art.
    const g = new TransitionGraph(
      mapOf([
        [
          "vent_core",
          {
            catwalk_access_up: [tile(4, 17, "ladder_up3"), tile(35, 0, "ladder_up3")],
            floor_access_down: [tile(4, 17, "ladder_down1"), tile(35, 0, "ladder_down1")],
          },
        ],
        ["main2", { verticals: [tile(4, 17, "access_hatch3")] }],
      ]),
    );
    expect(g.exitsOn("vent_core")).toEqual([]);
    expect(g.exitsOn("main2")).toEqual([]);
  });
});
