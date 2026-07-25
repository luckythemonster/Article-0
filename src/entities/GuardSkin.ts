import type Phaser from "phaser";
import type { SpriteCollider } from "./generated/playerCollider";

export const GUARD_DIRS = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const;
export type GuardDir = (typeof GUARD_DIRS)[number];

/**
 * Describes one guard's sprite sheet + display tuning, so the shared vision-
 * cone/patrol/pursue/detection AI in {@link Enforcer} can drive any reskin
 * (the security drone, the crawlspace drone, ...) without knowing its asset
 * layout. All guard skins use the same 8 directions.
 */
export interface GuardSkin {
  frameCount: number;
  frameRate: number;
  /** Display height as a multiple of tile size (e.g. 1.5 tiles). */
  displayTiles: number;
  /** Native pixel size of the (square) source art. */
  sourceSize: number;
  /**
   * Radius (in tiles) of the circular body this guard collides with walls by.
   * See {@link guardRadiusTiles} for how it's derived.
   */
  collisionRadiusTiles: number;
  frameKey(dir: GuardDir, frame: number): string;
  framePath(dir: GuardDir, frame: number): string;
  animKey(dir: GuardDir): string;
}

/**
 * Ceiling on a guard's collision radius, in tiles.
 *
 * A guard has to fit through the map's tightest gap: `main1` has 24 one-tile
 * passages and `duct1` is nothing *but* one-tile ducts. A circle centred in a
 * one-tile gap clears it only while its radius stays under half a tile, so this
 * leaves a sliver of margin under that limit for the body to slide along a wall
 * without snagging on the corner it just rounded.
 */
const MAX_GUARD_RADIUS_TILES = 0.42;

/**
 * A guard's collision radius: half its traced silhouette width at the skin's
 * display scale, capped by {@link MAX_GUARD_RADIUS_TILES}.
 *
 * Guards get a circle where the player gets an AABB, because a guard turns
 * through all 8 directions continuously and its silhouette changes shape as it
 * does — the enforcer measures 31×42 facing south but 37×40 facing east, so a
 * box traced from one frame is wrong for the other seven. A circle is also what
 * lets a guard slide around a corner instead of catching on it.
 *
 * Deriving this from the generated collider rather than hand-typing a number
 * means re-running `npm run gen:colliders` after an art change carries straight
 * through to collision. The trade is that the trace is taken from the *south*
 * frame, so a wider facing can overhang by a pixel or two; that is invisible in
 * play, and the alternative — sizing for the widest frame — is a body too fat
 * for the doorways it has to walk through.
 */
export function guardRadiusTiles(collider: SpriteCollider, displayTiles: number): number {
  const widthTiles = (collider.aabb.width * displayTiles) / collider.frameWidth;
  return Math.min(MAX_GUARD_RADIUS_TILES, widthTiles / 2);
}

const DIRECTION_ORDER: GuardDir[] = [
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
  "north",
  "north-east",
];

/** Snaps a facing angle (radians) to the nearest of the 8 guard directions. */
export function nearestGuardDirection(angle: number): GuardDir {
  const angleDeg = (angle * 180) / Math.PI;
  const normalized = ((angleDeg % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return DIRECTION_ORDER[index];
}

/** Queues every frame a skin needs, for BootScene's preload. */
export function preloadGuardSkin(scene: Phaser.Scene, skin: GuardSkin): void {
  for (const dir of GUARD_DIRS) {
    for (let i = 0; i < skin.frameCount; i++) {
      scene.load.image(skin.frameKey(dir, i), skin.framePath(dir, i));
    }
  }
}
