import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { EdplayLoader } from "./EdplayLoader";
import { planFor } from "./MapPlan";
import { appendVentCore, VENT_CORE_LEVEL } from "./VentCoreLevel";
import { appendLogCacheBeta, BETA_BEAMS, BETA_TERMINAL } from "./LogCacheBeta";
import {
  appendAlignmentVault,
  VAULT_CORE,
  VAULT_NODES,
  VAULT_RACKS,
} from "./AlignmentVault";
import {
  appendRoofArray,
  DISH_CENTER_TILE,
  FEED_TERMINAL,
  ROOF_ACCESS,
  ROOF_ARRAY_LEVEL,
  ROOF_CATWALKS,
  ROOF_PEDESTALS,
  ROOF_SEARCHLIGHTS,
} from "./RoofArrayLevel";
import { blockedTiles } from "./generate";
import { GENERATED_LEVELS, isGeneratedLevel, type GameLevel, type GameMap } from "./types";
import { TransitionGraph } from "../systems/TransitionGraph";

/**
 * The three acts the engine grafts onto the shipped map, tested against the *real*
 * `edplay.json` — same approach as `VentCoreLevel.test.ts`, and for the same reason:
 * these generators exist to fit one specific export, and a fixture map would only prove
 * they fit the fixture.
 *
 * The two failures worth catching here are both silent at runtime. A tile cloned from
 * nowhere draws as a missing frame in the running game, not at boot; and a fixture placed
 * on a wall is simply unreachable, with nothing anywhere to say so.
 */

let map: GameMap;
let frames: Set<string>;

function level(name: string): GameLevel {
  const l = map.levels.find((x) => x.name === name);
  if (!l) throw new Error(`no level "${name}"`);
  return l;
}

function tilesOn(levelName: string, board: string): { x: number; y: number; ref: string }[] {
  return level(levelName).layers.find((l) => l.name === board)?.tiles ?? [];
}

function buildMap(): GameMap {
  const raw = JSON.parse(
    readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
  );
  const parsed = EdplayLoader.parse(raw, ["s0", "s1", "s2"]);
  const plan = planFor(parsed.map);
  appendVentCore(parsed.map, plan.ventCoreHost);
  appendLogCacheBeta(parsed.map, plan.ventCoreHost);
  appendAlignmentVault(parsed.map, plan.extractionLevel);
  appendRoofArray(parsed.map, plan.extractionLevel);
  return parsed.map;
}

beforeAll(() => {
  const raw = JSON.parse(
    readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
  );
  const parsed = EdplayLoader.parse(raw, ["s0", "s1", "s2"]);
  frames = new Set(parsed.uniqueFrames.map((f) => f.frameKey));
  map = buildMap();
});

describe("generated acts", () => {
  it("all four report success on the shipped map", () => {
    const fresh = JSON.parse(
      readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
    );
    const parsed = EdplayLoader.parse(fresh, ["s0", "s1", "s2"]);
    const plan = planFor(parsed.map);
    expect(appendVentCore(parsed.map, plan.ventCoreHost)).toBe(true);
    expect(appendLogCacheBeta(parsed.map, plan.ventCoreHost)).toBe(true);
    expect(appendAlignmentVault(parsed.map, plan.extractionLevel)).toBe(true);
    expect(appendRoofArray(parsed.map, plan.extractionLevel)).toBe(true);
  });

  it("paints only frames the parse already registered", () => {
    // The load-bearing constraint: SpriteAtlas registers exactly what the parse found in
    // use, so a generator that invented a frame would place an undrawable tile.
    for (const levelName of [ROOF_ARRAY_LEVEL, "duct2", "main2"]) {
      for (const layer of level(levelName).layers) {
        for (const tile of layer.tiles) {
          if (!tile.frame) continue;
          expect(frames.has(tile.frame.frameKey), `${levelName}/${layer.name} ${tile.ref}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("is idempotent — the registry-cached map must not grow twice", () => {
    const plan = planFor(map);
    const before = {
      levels: map.levels.length,
      beta: tilesOn("duct2", "terminals").length,
      nodes: tilesOn("main2", "vault_nodes").length,
      access: tilesOn("main2", "maintenance_access").length,
    };
    appendVentCore(map, plan.ventCoreHost);
    appendLogCacheBeta(map, plan.ventCoreHost);
    appendAlignmentVault(map, plan.extractionLevel);
    appendRoofArray(map, plan.extractionLevel);
    expect(map.levels.length).toBe(before.levels);
    expect(tilesOn("duct2", "terminals")).toHaveLength(before.beta);
    expect(tilesOn("main2", "vault_nodes")).toHaveLength(before.nodes);
    expect(tilesOn("main2", "maintenance_access")).toHaveLength(before.access);
  });

  it("never lets a plan route a run into a level it generated", () => {
    const plan = planFor(map);
    for (const name of [plan.startLevel, plan.extractionLevel, plan.ventCoreHost ?? ""]) {
      expect(isGeneratedLevel(name)).toBe(false);
    }
    // And the two generator modules agree with the canonical list in types.ts.
    expect([...GENERATED_LEVELS].sort()).toEqual([ROOF_ARRAY_LEVEL, VENT_CORE_LEVEL].sort());
  });
});

describe("log-cache node BETA", () => {
  it("places a BETA-typed terminal flanked by beams in the crawlspace", () => {
    const terminals = tilesOn("duct2", "terminals");
    expect(terminals).toHaveLength(1);
    expect(terminals[0]).toMatchObject({ x: BETA_TERMINAL.x, y: BETA_TERMINAL.y });

    const term = level("duct2")
      .layers.find((l) => l.name === "terminals")!
      .tiles[0].components.find((c) => c.type === "terminal");
    expect(term?.values.type).toBe("LOG_CACHE_BETA");

    const lasers = tilesOn("duct2", "lasers");
    expect(lasers).toHaveLength(BETA_BEAMS.length);
    for (const beam of BETA_BEAMS) {
      expect(lasers.some((l) => l.x === beam.x && l.y === beam.y)).toBe(true);
    }
  });

  it("uses a ref the laser reader will recognise", () => {
    // Lasers are found by ref containing "laser", not by board — see MAP_AUTHORING §3.
    for (const l of tilesOn("duct2", "lasers")) {
      expect(l.ref.toLowerCase()).toContain("laser");
    }
  });

  it("sits on the crawlway, and the beams gate every approach to it", () => {
    const blocked = blockedTiles(level("duct2"));
    for (const p of [BETA_TERMINAL, ...BETA_BEAMS]) {
      expect(blocked.has(`${p.x},${p.y}`), `(${p.x},${p.y}) is a wall`).toBe(false);
    }
    // duct2's reachable space is the single run along y=34 between its hatches, so
    // "between the beams" is a real claim about the only path there is.
    const xs = BETA_BEAMS.map((b) => b.x).sort((a, b) => a - b);
    expect(BETA_TERMINAL.y).toBe(34);
    expect(BETA_TERMINAL.x).toBeGreaterThan(xs[0]);
    expect(BETA_TERMINAL.x).toBeLessThan(xs[1]);
  });
});

describe("the NW-SMAC-01 vault", () => {
  it("places the core, its nodes and the silicate racks on open floor", () => {
    const blocked = blockedTiles(level("main2"));
    for (const p of [VAULT_CORE, ...VAULT_NODES, ...VAULT_RACKS]) {
      expect(blocked.has(`${p.x},${p.y}`), `(${p.x},${p.y}) is a wall`).toBe(false);
    }
    expect(tilesOn("main2", "vault_core")).toHaveLength(1);
    expect(tilesOn("main2", "vault_nodes")).toHaveLength(VAULT_NODES.length);
    expect(tilesOn("main2", "vault_racks")).toHaveLength(VAULT_RACKS.length);
  });

  it("puts the racks further from the core than the nodes", () => {
    // The merge is meant to cost a walk across the room, not a step sideways.
    const dist = (p: { x: number; y: number }): number =>
      Math.hypot(p.x - VAULT_CORE.x, p.y - VAULT_CORE.y);
    const nearestRack = Math.min(...VAULT_RACKS.map(dist));
    const nearestNode = Math.min(...VAULT_NODES.map(dist));
    expect(nearestRack).toBeGreaterThan(nearestNode);
  });

  it("gives every node its own tile, so one hold can't finish two", () => {
    const seen = new Set(VAULT_NODES.map((n) => `${n.x},${n.y}`));
    expect(seen.size).toBe(VAULT_NODES.length);
  });
});

describe("the rooftop relay level", () => {
  it("generates a walled deck with a spawn and the dish blocked out", () => {
    const roof = level(ROOF_ARRAY_LEVEL);
    for (const board of ["floor", "walls", "spawn", "maintenance_access", "relay_pedestals", "relay_feed"]) {
      expect(roof.layers.some((l) => l.name === board), `missing ${board}`).toBe(true);
    }
    const blocked = blockedTiles(roof);
    expect(blocked.has(`${DISH_CENTER_TILE.x},${DISH_CENTER_TILE.y}`)).toBe(true);
  });

  it("keeps every fixture off the parapet and off the dish", () => {
    const blocked = blockedTiles(level(ROOF_ARRAY_LEVEL));
    const fixtures = [
      ROOF_ACCESS,
      FEED_TERMINAL,
      ...ROOF_PEDESTALS,
      ...ROOF_SEARCHLIGHTS,
      ...ROOF_CATWALKS,
    ];
    for (const p of fixtures) {
      expect(blocked.has(`${p.x},${p.y}`), `(${p.x},${p.y}) is blocked`).toBe(false);
    }
  });

  it("spawns the player on the ladder they arrive by", () => {
    const spawn = tilesOn(ROOF_ARRAY_LEVEL, "spawn");
    expect(spawn).toHaveLength(1);
    expect(spawn[0]).toMatchObject({ x: ROOF_ACCESS.x, y: ROOF_ACCESS.y });
  });

  it("links to the host level in both directions", () => {
    // TransitionGraph pairs purely by identical (x,y) on a same-named board — the
    // classic silent failure is a coordinate that matches on only one side.
    const graph = new TransitionGraph(map);
    const up = graph.at("main2", ROOF_ACCESS.x, ROOF_ACCESS.y);
    expect(up?.toLevel).toBe(ROOF_ARRAY_LEVEL);
    const down = graph.at(ROOF_ARRAY_LEVEL, ROOF_ACCESS.x, ROOF_ACCESS.y);
    expect(down?.toLevel).toBe("main2");
    // A hatch/ladder, so it takes an interact rather than firing on contact.
    expect(up?.kind).toBe("maintenance_access");
  });

  it("does not disturb the vent core's existing link", () => {
    const graph = new TransitionGraph(map);
    expect(graph.at("duct2", 18, 34)?.toLevel).toBe(VENT_CORE_LEVEL);
    expect(graph.at(VENT_CORE_LEVEL, 18, 34)?.toLevel).toBe("duct2");
  });

  it("puts the two pedestals genuinely far apart", () => {
    const [a, b] = ROOF_PEDESTALS;
    // The calibration walk is the phase; adjacent pedestals would delete it.
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(20);
  });
});

describe("when the map can't host them", () => {
  /** A map with levels but none of the boards the generators clone from. */
  function bareMap(): GameMap {
    return {
      name: "bare",
      tileWidth: 32,
      tileHeight: 32,
      sheetTextureKeys: [],
      levels: [{ name: "only", width: 10, height: 10, layers: [{ name: "floor", tiles: [] }] }],
    };
  }

  it("declines rather than throwing, so boot survives an unfamiliar map", () => {
    const bare = bareMap();
    expect(appendLogCacheBeta(bare, "only")).toBe(false);
    expect(appendAlignmentVault(bare, "only")).toBe(false);
    expect(appendRoofArray(bare, "only")).toBe(false);
    expect(bare.levels).toHaveLength(1);
  });

  it("declines a null host without looking at the map at all", () => {
    const bare = bareMap();
    expect(appendLogCacheBeta(bare, null)).toBe(false);
    expect(appendAlignmentVault(bare, null)).toBe(false);
    expect(appendRoofArray(bare, null)).toBe(false);
  });

  it("declines a host level that isn't there", () => {
    const bare = bareMap();
    expect(appendLogCacheBeta(bare, "nope")).toBe(false);
    expect(appendAlignmentVault(bare, "nope")).toBe(false);
    expect(appendRoofArray(bare, "nope")).toBe(false);
  });
});
