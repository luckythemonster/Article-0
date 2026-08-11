import type Phaser from "phaser";
import { Chest } from "../../entities/Chest";
import { Cover } from "../../entities/Cover";
import { Door } from "../../entities/Door";
import { Drone } from "../../entities/Drone";
import { Enforcer } from "../../entities/Enforcer";
import { ENFORCER_SKIN } from "../../entities/EnforcerAnimations";
import { Laser } from "../../entities/Laser";
import { Orderly } from "../../entities/Orderly";
import { Player } from "../../entities/Player";
import { Sensor } from "../../entities/Sensor";
import { Terminal } from "../../entities/Terminal";
import { bakeTileLayers, buildWallBodies } from "../../map/TileBake";
import type { GameLevel, GameTile } from "../../map/types";
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

/** Depth for tile-anchored props: doors, terminals, chests, loose decor. */
const PROP_DEPTH = 120;

/** The live contents of a level, handed back to the scene to drive. */
export interface BuiltLevel {
  player: Player;
  /** Enforcers and drones together — they share the same AI. */
  guards: Enforcer[];
  orderlies: Orderly[];
  doors: Door[];
  terminals: Terminal[];
  sensors: Sensor[];
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
): BuiltLevel {
  const tileTexture = bakeTileLayers(scene, level, tileSize, entityLayers);
  const { wallBodies, coverBodies } = buildWallBodies(scene, level, tileSize);

  const built: BuiltLevel = {
    player: spawnPlayer(scene, level, tileSize, arriveTile),
    guards: [],
    orderlies: [],
    doors: [],
    terminals: [],
    sensors: [],
    chests: [],
    lasers: [],
    coverTiles: [],
    wallBodies,
    coverBodies,
    doorBodies: [],
  };

  spawnCast(scene, level, tileSize, built);
  spawnInteractables(scene, level, tileSize, grid, built);
  spawnDestructibleCover(scene, level, tileSize, detection, tileTexture, built);
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
  detection: DetectionSystem,
  tileTexture: Phaser.GameObjects.RenderTexture,
  out: BuiltLevel,
): void {
  const coverLayer = level.layers.find((l) => l.name === "cover");
  if (!coverLayer) return;
  const floorLayer = level.layers.find((l) => l.name === "floor");
  for (const t of coverLayer.tiles) {
    if (str(t.components, "cover", "Destructible", "false") !== "true") continue;
    const floorTile = floorLayer?.tiles.find((f) => f.x === t.x && f.y === t.y);
    out.coverTiles.push(new Cover(scene, detection, tileTexture, tileSize, t, floorTile?.frame));
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

/** Guards, drones and orderlies. */
function spawnCast(
  scene: Phaser.Scene,
  level: GameLevel,
  tileSize: number,
  out: BuiltLevel,
): void {
  // A guard board is one guard's *route*, not a headcount — see
  // `routeFromLayer`. Each board therefore spawns a single guard standing on
  // waypoint 0 and walking the rest as a loop.
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
  out: BuiltLevel,
): void {
  for (const t of level.layers.find((l) => l.name === "doors")?.tiles ?? []) {
    // Only tiles carrying a `door` component are real doors; the board can
    // also hold stray art. Laser tiles are handled below as Laser hazards;
    // anything else non-door stays decorative.
    if (!t.components.some((c) => c.type === "door")) {
      if (t.frame && !t.ref.toLowerCase().includes("laser")) drawProp(scene, t, tileSize);
      continue;
    }
    const door = new Door(scene, t, tileSize, grid);
    out.doors.push(door);
    if (door.body) out.doorBodies.push(door.body);
  }

  for (const t of level.layers.find((l) => l.name === "terminals")?.tiles ?? []) {
    if (!t.components.some((c) => c.type === "terminal")) continue;
    out.terminals.push(new Terminal(scene, t, tileSize));
  }

  // Sensor cameras: the `security` board holds fixed optical cameras (its
  // tiles use a laser-ref sprite but are reinterpreted as cameras here).
  for (const t of level.layers.find((l) => l.name === "security")?.tiles ?? []) {
    out.sensors.push(new Sensor(scene, t, tileSize, grid));
  }

  // Chests: the `items` board holds searchable supply containers.
  for (const t of level.layers.find((l) => l.name === "items")?.tiles ?? []) {
    if (!t.components.some((c) => c.type === "chest")) continue;
    out.chests.push(new Chest(scene, t, tileSize));
  }

  // Lasers can sit on several boards (a dedicated `lasers` board in main1, a
  // stray tile on the `doors` board in main2), so gather them by ref across
  // all layers rather than a single board. The `security` board is skipped —
  // its laser-ref tiles are cameras, spawned above.
  for (const layer of level.layers) {
    if (layer.name === "security") continue;
    for (const t of layer.tiles) {
      if (t.ref.toLowerCase().includes("laser")) out.lasers.push(new Laser(scene, t, tileSize));
    }
  }
}

/** A one-off decorative sprite from an entity board — no behaviour attached. */
function drawProp(scene: Phaser.Scene, tile: GameTile, tileSize: number): void {
  scene.add
    .image(
      tile.x * tileSize + tileSize / 2,
      tile.y * tileSize + tileSize / 2,
      tile.frame!.textureKey,
      tile.frame!.frameKey,
    )
    .setDepth(PROP_DEPTH);
}
