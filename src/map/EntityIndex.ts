import { str } from "../systems/EntityStats";
import { routeFromLayer, type PatrolRoute } from "../systems/PatrolRoute";
import type { GameLayer, GameLevel, GameTile } from "./types";

/**
 * Which tiles on a level are cast and fixtures rather than art, and what kind.
 *
 * ### Why this exists
 *
 * The scene used to find its cast by board *name*: `enforcers`, `drones`,
 * `orderlies`, `security`. NW-SMAC-01 has had none of those since v0.2 was
 * retired, so no guard spawned on the shipped map at all — silently, because a
 * board that isn't there reads the same as a board with nobody on it.
 *
 * v0.4 types its cast by **component** instead, and names each board for the
 * route it describes (`security_guard_A`…`_D`, `drone_A`, `drone_B`). Those
 * names are the author's, not a vocabulary the engine can enumerate, so the
 * classification has to come off the components.
 *
 * ### Why it also returns `claimed`
 *
 * A tile that becomes an entity must not also be baked into the level texture,
 * or it draws twice. `ENTITY_LAYERS` did that job at board granularity, which
 * v0.4 breaks in both directions: its route boards are map-specific names the
 * constant cannot list, and several of its boards mix art with entities —
 * `main2vault`'s `verticals` (a stair plus two stairwell pieces that are guard
 * posts), its `terminals` (four terminals plus a `security_node1` that is
 * scenery), `main1`'s `power` (a door plus a breaker). Skipping those wholesale
 * either double-draws the entities or erases the art.
 *
 * So the guard is per tile: everything spawned from here lands in `claimed`, and
 * `bakeTileLayers` skips exactly those. A mixed board keeps its art.
 *
 * Pure — no Phaser — so the classification is unit-testable on its own.
 */

/** One guard's board: the route it walks and the stats it carries. */
export interface GuardRoute {
  /** Enforcer skin or drone skin — the two share all their AI. */
  kind: "enforcer" | "drone";
  /** Waypoints in authored order, walked as a loop. */
  route: PatrolRoute;
  /** The board's own components, read for this guard's stats. */
  components: GameTile["components"];
}

/** Everything on a level that spawns rather than bakes. */
export interface EntityIndex {
  guards: GuardRoute[];
  orderlies: GameTile[];
  sensors: GameTile[];
  doors: GameTile[];
  terminals: GameTile[];
  chests: GameTile[];
  /** Tiles claimed by one of the above; `bakeTileLayers` must skip them. */
  claimed: Set<GameTile>;
}

/** Component types the index reads, post-normalisation by `EdplayLoader`. */
const HUMAN = "human";
const SILICATE = "silicate";
const SENSOR = "sensor";
const ENEMY_SPAWN = "enemyspawn";

/** `Human.Job` values that decide which human a human is. */
const JOB_ORDERLY = "ORDERLY";

const has = (tile: GameTile, type: string): boolean =>
  tile.components.some((c) => c.type === type);

/**
 * What a whole board is, when every entity on it is the same kind of body.
 *
 * Guards are classified per *board* because a board is one guard's route — see
 * `docs/MAP_AUTHORING.md` §3.1 and `routeFromLayer`. Fixtures are classified per
 * *tile*, because the boards they sit on are shared with art.
 */
function guardKindOf(layer: GameLayer): GuardRoute["kind"] | undefined {
  const bodies = layer.tiles.filter((t) => has(t, HUMAN) || has(t, SILICATE));
  if (bodies.length === 0 || bodies.length !== layer.tiles.length) return undefined;
  if (bodies.every((t) => has(t, SILICATE))) return "drone";
  if (bodies.every((t) => has(t, HUMAN) && str(t.components, HUMAN, "Job", "") !== JOB_ORDERLY)) {
    return "enforcer";
  }
  return undefined;
}

/** True for a board of humans whose job is portering, not guarding. */
function isOrderlyBoard(layer: GameLayer): boolean {
  return (
    layer.tiles.length > 0 &&
    layer.tiles.every(
      (t) => has(t, HUMAN) && str(t.components, HUMAN, "Job", "") === JOB_ORDERLY,
    )
  );
}

/**
 * Reads a level's cast and fixtures out of its components.
 *
 * @param legacyBoards board names the engine's own generators still use, which
 *   are read by name because their tiles carry no components to read instead.
 */
export function indexEntities(level: GameLevel, legacyBoards: ReadonlySet<string>): EntityIndex {
  const out: EntityIndex = {
    guards: [],
    orderlies: [],
    sensors: [],
    doors: [],
    terminals: [],
    chests: [],
    claimed: new Set<GameTile>(),
  };

  const claim = (tiles: readonly GameTile[]): void => {
    for (const t of tiles) out.claimed.add(t);
  };

  for (const layer of level.layers) {
    // A board the engine generated says what it is by its name; its tiles are
    // clones of map art and carry no components of their own.
    if (legacyBoards.has(layer.name)) continue;

    const guard = guardKindOf(layer);
    if (guard) {
      const route = routeFromLayer(layer);
      if (route.length > 0) {
        out.guards.push({ kind: guard, route, components: layer.tiles[0].components });
        claim(layer.tiles);
      }
      continue;
    }

    if (isOrderlyBoard(layer)) {
      // One orderly per tile, not a route: `Orderly` wanders around a home spot
      // and has no waypoints to walk. The board's numbering is kept for the
      // author's sake even though nothing reads it yet.
      out.orderlies.push(...layer.tiles);
      claim(layer.tiles);
      continue;
    }

    for (const tile of layer.tiles) {
      // A spawn point with no wave system behind it is a guard standing post —
      // strictly better than a spawner that never spawns. `spawnTime` is
      // exported but never non-empty, so there is nothing to schedule.
      if (has(tile, ENEMY_SPAWN)) {
        out.guards.push({
          kind: "enforcer",
          route: [{ x: tile.x, y: tile.y }],
          components: tile.components,
        });
        out.claimed.add(tile);
        continue;
      }
      if (has(tile, SENSOR)) {
        out.sensors.push(tile);
        out.claimed.add(tile);
      }
    }
  }

  return out;
}

/**
 * The fixtures, which stay board-scoped.
 *
 * Deliberately *not* component-driven, unlike the cast above. `roof_array` and
 * `vent_core` file the elevator car's two `LOCKED key:2` doors on the elevator
 * board, and both of them are the one-tile car's only exits — made real, they
 * would seal the player inside. The `doors` board is the author saying "this one
 * opens", and that is the distinction worth keeping.
 */
export function indexFixtures(level: GameLevel, index: EntityIndex): void {
  const board = (name: string): GameTile[] =>
    level.layers.find((l) => l.name === name)?.tiles ?? [];

  const take = (tiles: GameTile[], type: string, into: GameTile[]): void => {
    for (const t of tiles) {
      if (!has(t, type)) continue;
      into.push(t);
      index.claimed.add(t);
    }
  };

  take(board("doors"), "door", index.doors);
  take(board("terminals"), "terminal", index.terminals);
  take(board("items"), "chest", index.chests);
}
