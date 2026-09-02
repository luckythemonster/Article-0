import { str } from "../systems/EntityStats";
import { routeFromLayer, type PatrolRoute } from "../systems/PatrolRoute";
import { transitionClassOf } from "../systems/TransitionGraph";
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

/**
 * The three guards a board can describe.
 *
 * `security` is a **human** and the other two are silicates, which is not a
 * cosmetic distinction in this setting — the Shared Field merges only with
 * silicates, and being cornered by one is the mesh-prune ending. Anything that
 * asks "is this a silicate" has to ask it of the kind, not of the class.
 */
export type GuardKind = "enforcer" | "drone" | "security";


/** One guard's board: the route it walks and the stats it carries. */
export interface GuardRoute {
  /**
   * Which guard walks this board. All three share the same AI — see
   * `src/entities/Enforcer.ts`, and `Drone`/`SecurityGuard` beside it.
   */
  kind: GuardKind;
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
  /** Power breakers — see `src/systems/PowerGrid.ts`. */
  breakers: GameTile[];
  /** Wall switches, one per lit zone — see `src/entities/LightSwitch.ts`. */
  lightSwitches: GameTile[];
  /** Body-stash containers — see `src/entities/Locker.ts`. Engine-added. */
  lockers: GameTile[];
  /** Tiles claimed by one of the above; `bakeTileLayers` must skip them. */
  claimed: Set<GameTile>;
}

/** Component types the index reads, post-normalisation by `EdplayLoader`. */
const HUMAN = "human";
const SILICATE = "silicate";
const SENSOR = "sensor";
const ENEMY_SPAWN = "enemyspawn";

/**
 * `Human.Job` values that decide which human a human is.
 *
 * The map's `Job` enum has three entries — `SECURITY`, `ORDERLY`, `TECHNICIAN` —
 * and two of them are cast. `TECHNICIAN` is deliberately absent: nothing in the
 * game is one yet, and inventing a fourth character to catch the name would put
 * a body on the map that no design asked for. It falls through to the enforcer
 * branch below, which is where it has always landed.
 */
const JOB_ORDERLY = "ORDERLY";
const JOB_SECURITY = "SECURITY";

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
function bodyKindOf(bodies: readonly GameTile[]): GuardKind | "orderly" | undefined {
  if (bodies.length === 0) return undefined;
  if (bodies.every((t) => has(t, SILICATE))) return "drone";
  if (!bodies.every((t) => has(t, HUMAN))) return undefined;
  const jobs = bodies.map((t) => str(t.components, HUMAN, "Job", ""));
  if (jobs.every((j) => j === JOB_ORDERLY)) return "orderly";
  // A human on a `Job: SECURITY` board is a security guard, and used to be an
  // enforcer: the old rule was "any human who isn't an orderly", which handed
  // the map's four `security_guard_*` boards to the silicate skin and the
  // silicate stats. Four people were patrolling as machines.
  if (jobs.every((j) => j === JOB_SECURITY)) return "security";
  // Anything else all-human and orderly-free keeps the old fallback, which is
  // what `TECHNICIAN` and an unset `Job` land on.
  if (!jobs.some((j) => j === JOB_ORDERLY || j === JOB_SECURITY)) return "enforcer";
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
    breakers: [],
    lightSwitches: [],
    lockers: [],
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
    //
    // Unless the board is one the engine already reads for something else. A
    // board is one character only when the board *is* that character; `verticals`
    // is the level's ways out, and `main2vault` files two stairwell guard posts on
    // it beside the stair itself. Those are two men watching a stairwell, not one
    // man shuffling between two adjacent tiles — and an author who wanted a beat
    // there would have given it its own board, as every other route on the map
    // has. Same reasoning as `indexFixtures` below: what a shared board's tiles
    // mean depends on the board.
    const spawns = layer.tiles.filter((t) => has(t, ENEMY_SPAWN));
    if (spawns.length > 0) {
      if (transitionClassOf(layer.name)) {
        for (const tile of spawns) {
          out.guards.push({
            kind: "enforcer",
            route: [{ x: tile.x, y: tile.y }],
            components: tile.components,
          });
          out.claimed.add(tile);
        }
      } else {
        const route = routeFromLayer({ ...layer, tiles: spawns });
        out.guards.push({ kind: "enforcer", route, components: spawns[0].components });
        claim(spawns);
      }
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
  // `power` is the clearest mixed board on the map — main1 files a door that
  // stays art beside the breaker that does not — which is why it is deliberately
  // absent from GameScene's `ENTITY_LAYERS` and why claiming per tile matters:
  // the breaker must not be baked into the level texture *and* drawn as a sprite.
  take(board("power"), "power_grid", index.breakers);
  // Almost always the engine's own board (`src/map/AutoLight.ts` derives one switch
  // per lit zone), but claimed by component like everything else so a map is free to
  // author its own plates on it beside them.
  take(board("light_switches"), "light_switch", index.lightSwitches);
  // Lockers carry no component to test — they are engine-added clones of map
  // furniture, and `src/map/Lockers.ts` owns the board wholesale. So the board
  // itself is the claim, which is safe here in a way it would not be for a map
  // board: nothing but the generator ever writes to it.
  for (const tile of board("lockers")) {
    index.lockers.push(tile);
    index.claimed.add(tile);
  }
}
