import type Phaser from "phaser";
import type { SpriteCollider } from "./generated/playerCollider";
import { DIRS_8, type Dir8 } from "./directions";

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
  frameKey(dir: Dir8, frame: number): string;
  framePath(dir: Dir8, frame: number): string;
  animKey(dir: Dir8): string;
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

/** The tuning that actually differs between one guard's art and another's. */
export interface GuardSkinSpec {
  /**
   * Asset/animation slug. Frames are expected at
   * `public/assets/<id>/patrol/<direction>/<frame>.png`, and every texture and
   * animation key is derived from it — so this one string is the whole naming
   * convention.
   */
  id: string;
  frameCount: number;
  frameRate: number;
  /** Display height as a multiple of tile size. */
  displayTiles: number;
  /** Native pixel size of the (square) source art. */
  sourceSize: number;
  /** Generated collider for the south frame; see {@link guardRadiusTiles}. */
  collider: SpriteCollider;
}

/**
 * Builds a {@link GuardSkin} from the handful of numbers that distinguish one
 * guard's art from another's.
 *
 * The enforcer and the drone are the same 58-line module twice over — identical
 * key/path/anim helpers, identical shape, differing only in a slug and four
 * constants. Every future reskin would have been a third copy. The per-skin
 * files keep their tuning and the reasoning behind it, which is the part worth
 * reading.
 */
export function makeGuardSkin(spec: GuardSkinSpec): GuardSkin {
  const { id } = spec;
  return {
    frameCount: spec.frameCount,
    frameRate: spec.frameRate,
    displayTiles: spec.displayTiles,
    sourceSize: spec.sourceSize,
    collisionRadiusTiles: guardRadiusTiles(spec.collider, spec.displayTiles),
    frameKey: (dir, frame) => `${id}-patrol-${dir}-${frame}`,
    framePath: (dir, frame) => `assets/${id}/patrol/${dir}/${frame}.png`,
    animKey: (dir) => `${id}-patrol-${dir}`,
  };
}

/** Queues every frame a skin needs, for BootScene's preload. */
export function preloadGuardSkin(scene: Phaser.Scene, skin: GuardSkin): void {
  for (const dir of DIRS_8) {
    for (let i = 0; i < skin.frameCount; i++) {
      scene.load.image(skin.frameKey(dir, i), skin.framePath(dir, i));
    }
  }
}
