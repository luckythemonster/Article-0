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

/** One orderly's board: the round it walks and the stats it carries. */
export interface OrderlyRoute {
  /** Waypoints in authored order, walked as a loop. */
  route: PatrolRoute;
  /** The board's own components, for parity with {@link GuardRoute}. */
  components: GameTile["components"];
}

/** Everything on a level that spawns rather than bakes. */
export interface EntityIndex {
  guards: GuardRoute[];
  orderlies: OrderlyRoute[];
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
 * The tiles on a board that carry a body, whatever else shares it.
 *
 * Classification used to require *every* tile on the board to be a body, which
 * meant one piece of scenery dragged onto a route board deleted the whole
 * character — silently, because a board that classifies as nothing reads exactly
 * like a board with nobody on it. That is the same failure mode the per-tile
 * `claimed` set was introduced to fix for fixtures, and v0.4 mixes art with
 * entities freely enough that a route board will eventually get the same
 * treatment. So the bodies decide the character, and the rest of the board stays
 * art: unclaimed, and painted into the level as usual.
 */
function bodiesOn(layer: GameLayer): GameTile[] {
  return layer.tiles.filter((t) => has(t, HUMAN) || has(t, SILICATE));
}

/**
 * What kind of body a board carries, or `undefined` for one that carries none.
 *
 * The cast is classified per *board* because a board is one character's route —
 * see `docs/MAP_AUTHORING.md` §3.1 and `routeFromLayer`. Fixtures are classified
 * per *tile*, because the boards they sit on are shared with art.
 *
 * Mixed kinds are refused rather than guessed: a board holding both a guard and
 * a drone describes no single route, and picking one would silently drop the
 * other.
 */
function bodyKindOf(bodies: readonly GameTile[]): "enforcer" | "drone" | "orderly" | undefined {
  if (bodies.length === 0) return undefined;
  if (bodies.every((t) => has(t, SILICATE))) return "drone";
  if (!bodies.every((t) => has(t, HUMAN))) return undefined;
  const orderlies = bodies.filter(
    (t) => str(t.components, HUMAN, "Job", "") === JOB_ORDERLY,
  ).length;
  if (orderlies === bodies.length) return "orderly";
  if (orderlies === 0) return "enforcer";
  return undefined;
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

    const bodies = bodiesOn(layer);
    const kind = bodyKindOf(bodies);
    if (kind) {
      const route = routeFromLayer({ ...layer, tiles: bodies });
      if (route.length > 0) {
        const components = bodies[0].components;
        if (kind === "orderly") out.orderlies.push({ route, components });
        else out.guards.push({ kind, route, components });
        claim(bodies);
      }
      continue;
    }

    // A spawn board is a route too. There is no wave system behind `enemySpawn`,
    // so its tiles are places an enforcer stands rather than times one appears —
    // which makes them waypoints, and makes the board one sentry's beat. A board
    // with a single tile still yields a single-waypoint post, which is what it
    // always did.
    const spawns = layer.tiles.filter((t) => has(t, ENEMY_SPAWN));
    if (spawns.length > 0) {
      const route = routeFromLayer({ ...layer, tiles: spawns });
      out.guards.push({ kind: "enforcer", route, components: spawns[0].components });
      claim(spawns);
    }

    for (const tile of layer.tiles) {
      // Cameras stay per tile: a sensor is bolted to a wall and has no round to
      // walk, so a board of them is a board of cameras, not one camera's route.
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
