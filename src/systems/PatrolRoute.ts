import type { GameLayer, GameTile } from "../map/types";
import type { PathNode } from "./Pathfinder";

/**
 * Reads a guard board as one guard's patrol route.
 *
 * The map's `enforcers` and `drones` boards were authored as **ordered
 * waypoints**, not as a headcount. The engine had been reading them the other
 * way — one guard per tile, each then wandering at random — which is why
 * `main1` fielded four enforcers milling about instead of one walking a beat.
 *
 * Read as waypoints the shipped map makes obvious sense. `main1`'s four tiles
 * (`enforcer0..3`) trace a circuit down the level's spine: the central hall at
 * (18,25), the row-30 corridor at (14,30) and (22,30), then the south hall at
 * (17,38). `duct1`'s two (`drone0`, `drone1`) sit at opposite ends of the *same*
 * one-tile vertical shaft at x=21 — a patrol up and down a corridor, which is
 * not a thing two independent guards would ever have been placed to do.
 *
 * Ordering comes from the trailing number on each tile's `ref`, which the
 * loader already resolves from the map's TileDefs (`EdplayLoader`). That is the
 * only ordering the map actually carries; a board whose refs have no numeric
 * suffix keeps its file order, which is at least stable.
 */

/** One guard's route: waypoints in tile coordinates, walked as a loop. */
export type PatrolRoute = PathNode[];

/**
 * Extracts the ordered waypoint list from a guard layer.
 *
 * Returns an empty array for a missing or empty layer, which callers read as
 * "no guard on this level" — `duct2`, `main2` and the generated vent core all
 * legitimately field none.
 */
export function routeFromLayer(layer: GameLayer | undefined): PatrolRoute {
  if (!layer || layer.tiles.length === 0) return [];
  return [...layer.tiles]
    .map((tile, fileIndex) => ({ tile, fileIndex, order: refOrder(tile) }))
    .sort((a, b) => {
      // Tiles with a numbered ref lead, in that order; the rest hold file order
      // behind them. Comparing on fileIndex second keeps the sort stable across
      // engines rather than relying on the runtime's sort being stable.
      if (a.order !== b.order) return a.order - b.order;
      return a.fileIndex - b.fileIndex;
    })
    .map(({ tile }) => ({ x: tile.x, y: tile.y }));
}

/**
 * The numeric suffix of a tile's ref (`enforcer2` → 2), or
 * `Number.MAX_SAFE_INTEGER` when it has none, which sorts unnumbered tiles to
 * the back rather than silently interleaving them at zero.
 */
function refOrder(tile: GameTile): number {
  const match = /(\d+)$/.exec(tile.ref ?? "");
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}
