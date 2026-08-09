import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { EdplayLoader } from "./EdplayLoader";
import { planFor } from "./MapPlan";
import { appendVentCore, VENT_CORE_LEVEL } from "./VentCoreLevel";
import { appendLogCacheBeta } from "./LogCacheBeta";
import { appendAlignmentVault } from "./AlignmentVault";
import { appendRoofArray, ROOF_ARRAY_LEVEL } from "./RoofArrayLevel";
import { blockedTiles } from "./generate";
import { type GameLevel, type GameMap } from "./types";
import { TransitionGraph } from "../systems/TransitionGraph";

/**
 * The four acts the engine grafts onto or adopts from the shipped map, tested
 * against the *real* `edplay.json` — same approach as `VentCoreLevel.test.ts`,
 * and for the same reason: these modules exist to fit one specific export, and a
 * fixture map would only prove they fit the fixture.
 *
 * NW-SMAC-01 authors its own `vent_core` and `roof_array`, so those two take the
 * *adopt* path (`src/map/AdoptAuthored.ts`, covered on synthetic fixtures in its
 * own test file) rather than the generator's from-scratch build — this file
 * checks the real data goes through adoption correctly. The vault and log-cache
 * BETA still graft onto authored levels the way they always have; the vault's
 * fixed coordinates don't fit this map's `main2` (48×36, not 40×45), so it takes
 * its derived-layout fallback (covered on fixtures in `AlignmentVault.test.ts`)
 * and this file checks that the real `main2` lands there too.
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
  const parsed = EdplayLoader.parse(raw, raw.SpriteSheets.map((s: { RelativePath: string }) => s.RelativePath));
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
  const parsed = EdplayLoader.parse(raw, raw.SpriteSheets.map((s: { RelativePath: string }) => s.RelativePath));
  frames = new Set(parsed.uniqueFrames.map((f) => f.frameKey));
  map = buildMap();
});

describe("generated acts", () => {
  it("all four report success on the shipped map", () => {
    const fresh = JSON.parse(
      readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
    );
    const parsed = EdplayLoader.parse(fresh, fresh.SpriteSheets.map((s: { RelativePath: string }) => s.RelativePath));
    const plan = planFor(parsed.map);
    // For vent_core/roof_array, "success" now means adopted, not generated —
    // AdoptAuthored.test.ts covers the mechanism; this just confirms it fires.
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
      substations: tilesOn(VENT_CORE_LEVEL, "substations").length,
    };
    appendVentCore(map, plan.ventCoreHost);
    appendLogCacheBeta(map, plan.ventCoreHost);
    appendAlignmentVault(map, plan.extractionLevel);
    appendRoofArray(map, plan.extractionLevel);
    expect(map.levels.length).toBe(before.levels);
    expect(tilesOn("duct2", "terminals")).toHaveLength(before.beta);
    expect(tilesOn("main2", "vault_nodes")).toHaveLength(before.nodes);
    expect(tilesOn(VENT_CORE_LEVEL, "substations")).toHaveLength(before.substations);
  });

  it("never lets a plan route a run into vent_core or roof_array", () => {
    const plan = planFor(map);
    for (const name of [plan.startLevel, plan.extractionLevel, plan.ventCoreHost ?? ""]) {
      expect(name).not.toBe(VENT_CORE_LEVEL);
      expect(name).not.toBe(ROOF_ARRAY_LEVEL);
    }
    // Both are authored on this map, not engine-generated — MapPlan excludes them by
    // the `generated` flag the adopters leave unset, not by name. See MapPlan.test.ts
    // for the flag-vs-name distinction on synthetic fixtures.
    expect(level(VENT_CORE_LEVEL).generated).toBeFalsy();
    expect(level(ROOF_ARRAY_LEVEL).generated).toBeFalsy();
  });
});

describe("log-cache node BETA", () => {
  it("promotes duct2's own authored LOG_CACHE terminal in place", () => {
    // NW-SMAC-01 already has a plain LOG_CACHE terminal on duct2 — promoting it beats
    // injecting a second one a few tiles away, which is what an unconditional inject
    // did to this map: two log caches in one room, one of them ours.
    const terminals = tilesOn("duct2", "terminals");
    expect(terminals).toHaveLength(1);
    expect(terminals[0]).toMatchObject({ x: 42, y: 34, ref: "terminal2" });

    const term = level("duct2")
      .layers.find((l) => l.name === "terminals")!
      .tiles[0].components.find((c) => c.type === "terminal");
    expect(term?.values.type).toBe("LOG_CACHE_BETA");
  });

  it("flanks the promoted terminal with a beam wherever one fits", () => {
    // The offset beam positions are (38,34) and (46,34); (38,34) lands on a real wall
    // on this map's duct2, so only the one that actually fits gets placed — the
    // terminal promotion doesn't get lost along with it. See LogCacheBeta.ts.
    const lasers = tilesOn("duct2", "lasers");
    const original = ["1,11", "31,21", "12,10", "31,29", "28,34"];
    const added = lasers.map((l) => `${l.x},${l.y}`).filter((k) => !original.includes(k));
    expect(added).toEqual(["46,34"]);
  });

  it("uses a ref the laser reader will recognise", () => {
    // Lasers are found by ref containing "laser", not by board — see MAP_AUTHORING §3.
    for (const l of tilesOn("duct2", "lasers")) {
      expect(l.ref.toLowerCase()).toContain("laser");
    }
  });

  it("promotes only a terminal that's actually reachable", () => {
    const blocked = blockedTiles(level("duct2"));
    const terminals = tilesOn("duct2", "terminals");
    for (const t of terminals) {
      expect(blocked.has(`${t.x},${t.y}`), `(${t.x},${t.y}) is a wall`).toBe(false);
    }
  });
});

describe("the NW-SMAC-01 vault", () => {
  it("places the core, its nodes and the silicate racks on open floor", () => {
    // main2 is 48x36 on this map — the fixed VAULT_CORE/NODES/RACKS coordinates
    // (picked for the old 40x45 main2) don't fit, so this exercises the derived
    // fallback (`AlignmentVault.test.ts` covers that path directly on a fixture).
    const blocked = blockedTiles(level("main2"));
    for (const p of [...tilesOn("main2", "vault_core"), ...tilesOn("main2", "vault_nodes"), ...tilesOn("main2", "vault_racks")]) {
      expect(blocked.has(`${p.x},${p.y}`), `(${p.x},${p.y}) is a wall`).toBe(false);
    }
    expect(tilesOn("main2", "vault_core")).toHaveLength(1);
    expect(tilesOn("main2", "vault_nodes")).toHaveLength(4);
    expect(tilesOn("main2", "vault_racks")).toHaveLength(4);
  });

  it("puts the racks further from the core than the nodes", () => {
    // The merge is meant to cost a walk across the room, not a step sideways —
    // the invariant the derived layout is built to preserve.
    const core = tilesOn("main2", "vault_core")[0];
    const dist = (p: { x: number; y: number }): number => Math.hypot(p.x - core.x, p.y - core.y);
    const nearestRack = Math.min(...tilesOn("main2", "vault_racks").map(dist));
    const nearestNode = Math.min(...tilesOn("main2", "vault_nodes").map(dist));
    expect(nearestRack).toBeGreaterThan(nearestNode);
  });

  it("gives every node its own tile, so one hold can't finish two", () => {
    const nodes = tilesOn("main2", "vault_nodes");
    const seen = new Set(nodes.map((n) => `${n.x},${n.y}`));
    expect(seen.size).toBe(nodes.length);
  });
});

describe("the rooftop relay level", () => {
  it("adopts the authored deck with its dish, pedestals and feed", () => {
    const roof = level(ROOF_ARRAY_LEVEL);
    for (const board of ["relay_dish", "relay_pedestals", "relay_feed"]) {
      expect(roof.layers.some((l) => l.name === board), `missing ${board}`).toBe(true);
    }
    const dish = tilesOn(ROOF_ARRAY_LEVEL, "relay_dish")[0];
    expect(dish).toMatchObject({ x: 25, y: 17 });
    expect(tilesOn(ROOF_ARRAY_LEVEL, "relay_pedestals")).toHaveLength(2);
  });

  it("moves the pedestals off terminals so they stop counting as log caches", () => {
    // Authored typed LOG_CACHE — moving them means they only count as hold fixtures.
    expect(tilesOn(ROOF_ARRAY_LEVEL, "terminals")).toHaveLength(0);
  });

  it("links to main2 by the roof_access board, in both directions", () => {
    // main2's ladder (5,1) and the roof's hatch (6,30) don't share a coordinate —
    // this only resolves via the numbered hatch3/ladder3 pairing in TransitionGraph.
    const graph = new TransitionGraph(map);
    const up = graph.at("main2", 5, 1);
    expect(up?.toLevel).toBe(ROOF_ARRAY_LEVEL);
    expect(up?.kind).toBe("roof_access");
    const down = graph.at(ROOF_ARRAY_LEVEL, 6, 30);
    expect(down?.toLevel).toBe("main2");
  });

  it("does not disturb the vent core's existing link", () => {
    const graph = new TransitionGraph(map);
    expect(graph.at("duct2", 43, 1)?.toLevel).toBe(VENT_CORE_LEVEL);
    expect(graph.at(VENT_CORE_LEVEL, 43, 1)?.toLevel).toBe("duct2");
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
