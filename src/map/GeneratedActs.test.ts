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
import { typeInertTerminals } from "./InertTerminals";

/** The level v0.4 draws the Alignment vault as, rather than a corner of main2. */
const VAULT_LEVEL = "main2vault";

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

/** The export, parsed exactly as `main.ts` boots it. */
function parseShipped(): ReturnType<typeof EdplayLoader.parse> {
  const raw = JSON.parse(
    readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
  );
  typeInertTerminals(raw);
  return EdplayLoader.parse(raw, raw.SpriteSheets.map((s: { RelativePath: string }) => s.RelativePath));
}

function buildMap(): GameMap {
  const parsed = parseShipped();
  const plan = planFor(parsed.map);
  appendVentCore(parsed.map, plan.ventCoreHost);
  appendLogCacheBeta(parsed.map, plan.ventCoreHost);
  appendAlignmentVault(parsed.map, plan.vaultHost);
  appendRoofArray(parsed.map, plan.extractionLevel);
  return parsed.map;
}

beforeAll(() => {
  frames = new Set(parseShipped().uniqueFrames.map((f) => f.frameKey));
  map = buildMap();
});

describe("generated acts", () => {
  it("all four report success on the shipped map", () => {
    const parsed = parseShipped();
    const plan = planFor(parsed.map);
    // All four are authored on v0.4, so "success" means adopted rather than
    // generated — AdoptAuthored.test.ts covers the mechanism on fixtures; this
    // confirms it fires against the real export.
    expect(appendVentCore(parsed.map, plan.ventCoreHost)).toBe(true);
    expect(appendLogCacheBeta(parsed.map, plan.ventCoreHost)).toBe(true);
    expect(appendAlignmentVault(parsed.map, plan.vaultHost)).toBe(true);
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
      nodes: tilesOn(VAULT_LEVEL, "vault_nodes").length,
      substations: tilesOn(VENT_CORE_LEVEL, "substations").length,
    };
    appendVentCore(map, plan.ventCoreHost);
    appendLogCacheBeta(map, plan.ventCoreHost);
    appendAlignmentVault(map, plan.vaultHost);
    appendRoofArray(map, plan.extractionLevel);
    expect(map.levels.length).toBe(before.levels);
    expect(tilesOn("duct2", "terminals")).toHaveLength(before.beta);
    expect(tilesOn(VAULT_LEVEL, "vault_nodes")).toHaveLength(before.nodes);
    expect(tilesOn(VENT_CORE_LEVEL, "substations")).toHaveLength(before.substations);
  });

  it("routes the run through the map's own declarations", () => {
    const plan = planFor(map);
    expect(plan.startLevel).toBe("main1"); // the `spawn` board
    expect(plan.extractionLevel).toBe(ROOF_ARRAY_LEVEL); // the `extraction` board
    expect(plan.vaultHost).toBe(VAULT_LEVEL); // the `EIRA-7` board
    expect(plan.ventCoreHost).toBe("duct2");
  });

  it("never routes a run into a level the engine generated", () => {
    // The rule is about the flag, not the name. v0.4 authors its own vent_core
    // *and* its own roof_array — and nominates the roof as the extraction deck by
    // putting an `extraction` board on it, so the old "never roof_array" reading
    // of this rule is now the map declaring the opposite. What must stay true is
    // that nothing the *engine* built is ever routed into.
    const plan = planFor(map);
    for (const name of [plan.startLevel, plan.extractionLevel, plan.vaultHost, plan.ventCoreHost ?? ""]) {
      expect(map.levels.find((l) => l.name === name)?.generated, name).toBeFalsy();
    }
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
    expect(terminals[0]).toMatchObject({ x: 19, y: 11, ref: "terminal2" });

    const term = level("duct2")
      .layers.find((l) => l.name === "terminals")!
      .tiles[0].components.find((c) => c.type === "terminal");
    expect(term?.values.type).toBe("LOG_CACHE_BETA");
  });

  it("keeps the promotion when the map has no beam to clone", () => {
    // The flanking beams are decoration on the approach and are cloned from a
    // board named `lasers`. v0.4 has none — its laser fixtures sit on duct2's
    // `sensors` board and are found by ref — so no beam is placed, and the point
    // is that the terminal promotion is not lost along with it.
    expect(tilesOn("duct2", "lasers")).toHaveLength(0);
    const term = tilesOn("duct2", "terminals")[0] as unknown as {
      components: { type: string; values: Record<string, string> }[];
    };
    expect(term.components.find((c) => c.type === "terminal")?.values.type).toBe("LOG_CACHE_BETA");
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
  it("adopts the authored room rather than deriving a layout in main2", () => {
    // v0.4 draws the vault as a level of its own, so none of this is derived: the
    // core is EIRA-7 where the author stood her, the nodes are the four
    // correction terminals around her, and the racks are the room's own cover.
    const blocked = blockedTiles(level(VAULT_LEVEL));
    for (const p of [...tilesOn(VAULT_LEVEL, "vault_core"), ...tilesOn(VAULT_LEVEL, "vault_nodes")]) {
      expect(blocked.has(`${p.x},${p.y}`), `(${p.x},${p.y}) is a wall`).toBe(false);
    }
    expect(tilesOn(VAULT_LEVEL, "vault_core")).toMatchObject([{ x: 25, y: 7 }]);
    expect(tilesOn(VAULT_LEVEL, "vault_nodes")).toHaveLength(4);
    expect(tilesOn(VAULT_LEVEL, "vault_racks")).toHaveLength(8);
    // main2 keeps its own shape — the vault is no longer grafted into it.
    expect(tilesOn("main2", "vault_core")).toHaveLength(0);
  });

  it("leaves the racks on the cover board, so the room keeps its cover", () => {
    const racks = tilesOn(VAULT_LEVEL, "vault_racks").map((t) => `${t.x},${t.y}`).sort();
    const cover = tilesOn(VAULT_LEVEL, "cover").map((t) => `${t.x},${t.y}`).sort();
    expect(racks).toEqual(cover);
  });

  it("puts the racks further from the core than the nodes", () => {
    // The merge is meant to cost a walk across the room, not a step sideways —
    // the invariant the derived layout is built to preserve.
    const core = tilesOn(VAULT_LEVEL, "vault_core")[0];
    const dist = (p: { x: number; y: number }): number => Math.hypot(p.x - core.x, p.y - core.y);
    const nearestRack = Math.min(...tilesOn(VAULT_LEVEL, "vault_racks").map(dist));
    const nearestNode = Math.min(...tilesOn(VAULT_LEVEL, "vault_nodes").map(dist));
    expect(nearestRack).toBeGreaterThan(nearestNode);
  });

  it("gives every node its own tile, so one hold can't finish two", () => {
    const nodes = tilesOn(VAULT_LEVEL, "vault_nodes");
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
    expect(dish).toMatchObject({ x: 15, y: 7 });
    expect(tilesOn(ROOF_ARRAY_LEVEL, "relay_pedestals")).toHaveLength(2);
  });

  it("moves the pedestals off terminals so they stop counting as log caches", () => {
    // Authored typed LOG_CACHE — moving them means they only count as hold fixtures.
    expect(tilesOn(ROOF_ARRAY_LEVEL, "terminals")).toHaveLength(0);
  });

  it("links to main2 by ladder, in both directions", () => {
    // main2's `ladder_up5` and the roof's `access_hatch5` share (30,6) on the
    // `verticals` board — the plain coordinate pairing, no numbering needed.
    const graph = new TransitionGraph(map);
    expect(graph.at("main2", 30, 6)?.toLevel).toBe(ROOF_ARRAY_LEVEL);
    expect(graph.at(ROOF_ARRAY_LEVEL, 30, 6)?.toLevel).toBe("main2");
  });

  it("does not disturb the vent core's existing link", () => {
    const graph = new TransitionGraph(map);
    expect(graph.at("duct2", 33, 16)?.toLevel).toBe(VENT_CORE_LEVEL);
    expect(graph.at(VENT_CORE_LEVEL, 33, 16)?.toLevel).toBe("duct2");
  });

  it("reaches every level the map authored", () => {
    // The whole point of the migration: v0.3 stranded six of nine levels, and a
    // run that cannot reach the extraction deck cannot be won.
    const graph = new TransitionGraph(map);
    const seen = new Set(["main1"]);
    const queue = ["main1"];
    while (queue.length > 0) {
      for (const exit of graph.exitsOn(queue.shift()!)) {
        if (seen.has(exit.transition.toLevel)) continue;
        seen.add(exit.transition.toLevel);
        queue.push(exit.transition.toLevel);
      }
    }
    expect([...map.levels.map((l) => l.name)].filter((n) => !seen.has(n))).toEqual([]);
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
