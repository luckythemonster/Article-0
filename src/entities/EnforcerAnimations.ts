import { makeGuardSkin, type GuardSkin } from "./GuardSkin";
import { ENFORCER_PATROL_SOUTH_COLLIDER } from "./generated/enforcerCollider";

/**
 * Frame manifest for the enforcer sprite (generated via PixelLab.ai — a
 * blocky robotic sentry gliding on magnetic tracks with a rotating crown of
 * camera-arms, high top-down, 48x48). The "patrol-scan" cycle (custom v3
 * animation) shows the camera-arms sweeping back and forth like a scanner
 * while the sentry glides forward, so it doubles as the patrol animation.
 *
 * All 8 directions were exported, so facing matches the guard's continuous
 * patrol/pursuit angle exactly (no cardinal snapping).
 *
 * Frames live in public/assets/enforcer/patrol/<direction>/<frame>.png.
 */

/**
 * Display height in tiles.
 *
 * Down from 1.5, which the enforcer could never honestly wear. The player is
 * also nominally "1.5 tiles", but its 96×96 art is mostly padding, so Rowan's
 * real body is ~0.5 tiles across; the enforcer's frame is nearly edge-to-edge
 * robot, so at 1.5 it was genuinely 1.5 tiles *wide* — wider than the one-tile
 * doorways it patrols through. At this size the traced silhouette fits the map,
 * and the enforcer still reads as considerably bulkier than both the player and
 * the drone.
 *
 * 1.125 rather than the 1.15 it sat at before, because that is the nearest value
 * that pairs with a whole-number canvas — see {@link ENFORCER_SOURCE_SIZE}. It
 * is 2% smaller on screen, comfortably inside the margin that made 1.15
 * necessary.
 */
const ENFORCER_DISPLAY_TILES = 1.125;

/**
 * Native pixel size of the source art — 72, up from 48.
 *
 * Paired with {@link ENFORCER_DISPLAY_TILES}: `(32 * 1.125) / 72 * 2` = exactly
 * 1 screen pixel per source pixel. The old pairing of 48 and 1.15 gave 1.533, so
 * two source pixels in three got one screen pixel and the third got two — and
 * which ones moved with the sprite, so the outline broke up as the enforcer
 * patrolled. See `src/render/pixelScale.ts` for the rule and its test.
 *
 * This one was being *magnified*, unlike the drone: the fix is art with enough
 * pixels to be shown at the size it was already being shown at, so the frames
 * were redrawn larger rather than the display shrunk.
 */
const ENFORCER_SOURCE_SIZE = 72;

/** The enforcer's {@link GuardSkin}. */
export const ENFORCER_SKIN: GuardSkin = makeGuardSkin({
  id: "enforcer",
  frameCount: 8,
  frameRate: 8,
  displayTiles: ENFORCER_DISPLAY_TILES,
  sourceSize: ENFORCER_SOURCE_SIZE,
  collider: ENFORCER_PATROL_SOUTH_COLLIDER,
});
