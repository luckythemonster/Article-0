import type Phaser from "phaser";
import { Chest } from "../../entities/Chest";
import { Cover } from "../../entities/Cover";
import { Door } from "../../entities/Door";
import { Drone } from "../../entities/Drone";
import { SecurityGuard } from "../../entities/SecurityGuard";
import { Locker } from "../../entities/Locker";
import { Enforcer } from "../../entities/Enforcer";
import { ENFORCER_SKIN } from "../../entities/EnforcerAnimations";
import { Laser } from "../../entities/Laser";
import { Orderly } from "../../entities/Orderly";
import { Player } from "../../entities/Player";
import { Breaker } from "../../entities/Breaker";
import { breakerStatsFor } from "../../systems/EntityStats";
import { isCircuitClosed, type PowerGridState } from "../../systems/PowerGrid";
import { Sensor } from "../../entities/Sensor";
import { Terminal } from "../../entities/Terminal";
import { indexEntities, indexFixtures, type EntityIndex } from "../../map/EntityIndex";
import {
  bakePlanes,
  buildDeckEdgeBodies,
  buildWallBodies,
  type BakedPlane,
  type CoverBody,
} from "../../map/TileBake";
import type { GameLevel, GameTile } from "../../map/types";
import { deckCells, deckPlaneAt, PLANE_UPPER } from "../../map/planes";
import type { CollisionGrid } from "../../systems/CollisionGrid";
import type { DetectionSystem } from "../../systems/DetectionSystem";
import { str } from "../../systems/EntityStats";
import { routeFromLayer } from "../../systems/PatrolRoute";

/**
 * Everything that turns a parsed level into live objects: the tile bake, the
 * cast, the interactables, and the collision fix-ups that have to happen
 * between them.
 *
 * This is the half of `GameScene.create()` that only ever runs once per level.
 * Keeping it here leaves the scene's `create` reading as a sequence of steps
 * rather than two hundred lines of construction, and it puts the ordering
 * constraints that actually matter — grid before doors, terminals before the
 * qualia rack — in one place where they can be stated.
 *
 * Depth 120 is the floor for anything an entity owns; the baked tile art sits
 * below it. See {@link bakeTileLayers}.
 */

/** The live contents of a level, handed back to the scene to drive. */
export interface BuiltLevel {
  player: Player;
  /** Enforcers and drones together — they share the same AI. */
  guards: Enforcer[];
  orderlies: Orderly[];
  doors: Door[];
  terminals: Terminal[];
  sensors: Sensor[];
  /** Power breakers — see `src/systems/PowerGrid.ts`. */
  breakers: Breaker[];
  chests: Chest[];
  lasers: Laser[];
  /** Cover tiles the map (or a generator) marks `Destructible` — the rest of the
   * `cover` board stays baked art with no entity, exactly as before. */
  coverTiles: Cover[];
  /** Static bodies for the walls, merged into as few rectangles as possible. */
  wallBodies: Phaser.GameObjects.GameObject[];
  /**
   * Static bodies for the cover board — solid to a standing player, switched off
   * while he is crouched so he can squeeze into them. See `CRAWLABLE_BOARDS`.
   */
  coverBodies: Phaser.GameObjects.GameObject[];
  /** Arcade bodies for the closed doors, for the player collider. */
  doorBodies: Phaser.GameObjects.GameObject[];
  lockers: Locker[];
  /**
   * The level's baked art, one texture per walk surface plus the canopy — see
   * `bakePlanes`. A single-plane level has exactly one entry, at the depth the
   * engine has always drawn its tiles.
   */
  planes: BakedPlane[];
  /**
   * Static bodies that pen the player onto the upper walk surface, or empty on a
   * level with only one. `GameScene` swaps its collider to these when he steps up.
   */
  deckEdgeBodies: Phaser.GameObjects.GameObject[];
  /**
   * Tiles that became entities, and so were left out of the bake.
   *
   * Handed on so `src/ui/MemoryLayer.ts` can skip exactly the same tiles: what
   * the player remembers of a room is the art that was painted into it, never
   * the guard who happened to be standing there.
   */
  claimedTiles: ReadonlySet<GameTile>;
}

/**
 * Bakes the level's art and instantiates everything that lives in it.
 *
 * @param arriveTile where a level transition dropped the player, overriding the
 *   level's own `spawn` board.
 * @param entityLayers boards holding entities rather than paintable art; those
 *   are spawned here and must not be baked into the tile texture.
 */
export function buildLevel(
  scene: Phaser.Scene,
  level: GameLevel,
  tileSize: number,
  grid: CollisionGrid,
  detection: DetectionSystem,
  arriveTile: { x: number; y: number } | undefined,
  entityLayers: ReadonlySet<string>,
  powerGrid: PowerGridState,
): BuiltLevel {
  // Who lives here, decided before anything is drawn: the bake has to know which
  // individual tiles are about to become entities so it can leave them out.
  const index = indexEntities(level, entityLayers);
  indexFixtures(level, index);

  const planes = bakePlanes(scene, level, tileSize, entityLayers, index.claimed);
  // Destructible cover stamps itself back into the art it was cut from, and cover
  // is floor-plane furniture, so it belongs to the floor's texture.
  const tileTexture = planes[0].texture;
  const { wallBodies, coverBodies: coverBodyEntries } = buildWallBodies(scene, level, tileSize);
  const deckEdgeBodies =
    planes.length > 1 && planes[1].plane === PLANE_UPPER
      ? buildDeckEdgeBodies(scene, level, tileSize)
      : [];

  const built: BuiltLevel = {
    player: spawnPlayer(scene, level, tileSize, arriveTile),
    guards: [],
    orderlies: [],
    doors: [],
    terminals: [],
    sensors: [],
    chests: [],
    breakers: [],
    lasers: [],
    coverTiles: [],
    wallBodies,
    coverBodies: coverBodyEntries.map((e) => e.body),
    doorBodies: [],
    lockers: [],
    claimedTiles: index.claimed,
    planes,
    deckEdgeBodies,
  };

  spawnCast(scene, level, tileSize, index, built);
  spawnInteractables(scene, level, tileSize, grid, index, built, powerGrid);
  spawnDestructibleCover(scene, level, tileSize, grid, detection, tileTexture, coverBodyEntries, built);
  return built;
}

/**
 * The `cover` board's `Destructible` tiles — the rest of the board stays
 * baked art with no entity, since it never changes.
 */
function spawnDestructibleCover(
  scene: Phaser.Scene,
  level: GameLevel,
  tileSize: number,
  grid: CollisionGrid,
  detection: DetectionSystem,
  tileTexture: Phaser.GameObjects.RenderTexture,
  coverBodyEntries: CoverBody[],
  out: BuiltLevel,
): void {
  const coverLayer = level.layers.find((l) => l.name === "cover");
  if (!coverLayer) return;
  const floorLayer = level.layers.find((l) => l.name === "floor");
  for (const t of coverLayer.tiles) {
    if (str(t.components, "cover", "Destructible", "false") !== "true") continue;
    const floorTile = floorLayer?.tiles.find((f) => f.x === t.x && f.y === t.y);
    // undefined on a board that was never solid (the rooftop's crates) — there is
    // no body to hand over, and `Cover.destroy` treats that as nothing to disable.
    const body = coverBodyEntries.find((e) => e.tileX === t.x && e.tileY === t.y)?.body;
    out.coverTiles.push(
      new Cover(scene, detection, grid, tileTexture, tileSize, t, floorTile?.frame, body),
    );
  }
}

/** Places the player on the arrival tile, the level's spawn, or its centre. */
function spawnPlayer(
  scene: Phaser.Scene,
  level: GameLevel,
  tileSize: number,
  arriveTile: { x: number; y: number } | undefined,
): Player {
  const half = tileSize / 2;
  // Arriving via a transition overrides the level's own spawn point.
  const spawn = level.layers.find((l) => l.name === "spawn")?.tiles[0];
  const tile = arriveTile ?? spawn;
  const px = tile ? tile.x * tileSize + half : level.width * half;
  const py = tile ? tile.y * tileSize + half : level.height * half;
  return new Player(scene, px, py, tileSize);
}

/**
 * Guards, drones and orderlies.
 *
 * Two sources, because two map generations. `EntityIndex` reads the component-
 * typed cast v0.4 authors — one board per route, named for the route rather than
 * for the engine. The legacy `enforcers` / `drones` / `orderlies` boards are
 * still read by name, since the engine's own generators emit them and their
 * tiles carry no components to classify.
 */
function spawnCast(
  scene: Phaser.Scene,
  level: GameLevel,
  tileSize: number,
  index: EntityIndex,
  out: BuiltLevel,
): void {
  // A character belongs to whichever surface its first waypoint stands on. Per
  // cell rather than per board, because the boards the cast sits on say nothing
  // about height — see `deckPlaneAt`.
  const deck = deckCells(level, tileSize);
  const planeOf = (t: { x: number; y: number }): number => deckPlaneAt(deck, level, t.x, t.y);
  // A guard board is one guard's *route*, not a headcount — see
  // `routeFromLayer`. Each board therefore spawns a single guard standing on
  // waypoint 0 and walking the rest as a loop.
  for (const g of index.guards) {
    const start = g.route[0];
    const plane = planeOf(start);
    // Three subclasses of one AI, picked off the board's own components. The
    // switch is exhaustive on `GuardKind` so adding a fourth fails the build
    // rather than silently spawning an enforcer, which is exactly how the
    // security guard went unnoticed.
    switch (g.kind) {
      case "drone":
        out.guards.push(new Drone(scene, start.x, start.y, tileSize, g.components, g.route, plane));
        break;
      case "security":
        out.guards.push(
          new SecurityGuard(scene, start.x, start.y, tileSize, g.components, g.route, plane),
        );
        break;
      case "enforcer":
        out.guards.push(
          new Enforcer(scene, start.x, start.y, tileSize, g.components, ENFORCER_SKIN, g.route, plane),
        );
        break;
    }
  }
  // An orderly board is one orderly's round, the same way a guard board is one
  // guard's beat — it spawns on waypoint 0 and loiters its way round the rest.
  for (const o of index.orderlies) {
    const start = o.route[0];
    out.orderlies.push(new Orderly(scene, start.x, start.y, tileSize, o.route));
  }

  const enforcerLayer = level.layers.find((l) => l.name === "enforcers");
  const enforcerRoute = routeFromLayer(enforcerLayer);
  if (enforcerLayer && enforcerRoute.length > 0) {
    const start = enforcerRoute[0];
    out.guards.push(
      new Enforcer(
        scene,
        start.x,
        start.y,
        tileSize,
        enforcerLayer.tiles[0].components,
        ENFORCER_SKIN,
        enforcerRoute,
      ),
    );
  }

  const droneLayer = level.layers.find((l) => l.name === "drones");
  const droneRoute = routeFromLayer(droneLayer);
  if (droneLayer && droneRoute.length > 0) {
    const start = droneRoute[0];
    out.guards.push(
      new Drone(scene, start.x, start.y, tileSize, droneLayer.tiles[0].components, droneRoute),
    );
  }

  for (const t of level.layers.find((l) => l.name === "orderlies")?.tiles ?? []) {
    out.orderlies.push(new Orderly(scene, t.x, t.y, tileSize));
  }
}

/**
 * Doors, terminals, cameras, chests and lasers.
 *
 * Doors need the collision grid to already exist: they register their closed
 * cells on it as they are constructed.
 */
function spawnInteractables(
  scene: Phaser.Scene,
  level: GameLevel,
  tileSize: number,
  grid: CollisionGrid,
  index: EntityIndex,
  out: BuiltLevel,
  powerGrid: PowerGridState,
): void {
  const deck = deckCells(level, tileSize);
  const planeOf = (t: { x: number; y: number }): number => deckPlaneAt(deck, level, t.x, t.y);

  // The two silhouettes differ in art and nothing else, so which one a locker
  // wears is read off the tile's own ref rather than branched on anywhere below.
  for (const t of index.lockers) {
    out.lockers.push(
      new Locker(scene, t, tileSize, t.ref.includes("foot") ? "footlocker" : "locker"),
    );
  }

  for (const t of index.doors) {
    const door = new Door(scene, t, tileSize, grid);
    out.doors.push(door);
    if (door.body) out.doorBodies.push(door.body);
  }

  for (const t of index.terminals) out.terminals.push(new Terminal(scene, t, tileSize));
  for (const t of index.breakers) {
    // The persisted override if the player has thrown this one before, and the
    // map's authored `State` otherwise — so a deck they darkened is still dark
    // when they come back down the duct.
    const authored = breakerStatsFor(t.components);
    const closed = isCircuitClosed(powerGrid, level.name, authored.target, authored.closed);
    out.breakers.push(new Breaker(scene, t, tileSize, closed));
  }
  for (const t of index.chests) out.chests.push(new Chest(scene, t, tileSize));
  for (const t of index.sensors) {
    out.sensors.push(new Sensor(scene, t, tileSize, grid, planeOf(t)));
  }

  // Sensor cameras: the legacy `security` board holds fixed optical cameras (its
  // tiles use a laser-ref sprite but are reinterpreted as cameras here). v0.4's
  // cameras carry a `Sensor` component and come through the index above.
  for (const t of level.layers.find((l) => l.name === "security")?.tiles ?? []) {
    out.sensors.push(new Sensor(scene, t, tileSize, grid, planeOf(t)));
  }

  // Lasers can sit on several boards (a dedicated `lasers` board, `duct2`'s
  // `sensors`, a stray tile on `doors`), so gather them by ref across all layers
  // rather than a single board. The `security` board is skipped — its laser-ref
  // tiles are cameras, spawned above. A laser draws its beam procedurally over
  // its own baked art, so its tile is deliberately not claimed.
  for (const layer of level.layers) {
    if (layer.name === "security") continue;
    for (const t of layer.tiles) {
      if (t.ref.toLowerCase().includes("laser") && !index.sensors.includes(t)) {
        out.lasers.push(new Laser(scene, t, tileSize));
      }
    }
  }
}
