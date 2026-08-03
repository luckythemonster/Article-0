import { makeGuardSkin, type GuardSkin } from "./GuardSkin";
import { DRONE_PATROL_SOUTH_COLLIDER } from "./generated/droneCollider";

/**
 * Frame manifest for the drone sprite (generated via PixelLab.ai — a small
 * non-humanoid patrol android with a spindly quadruped frame and a pulsing
 * sensor-cluster "eye", high top-down, 48x48). Its "patrol-scan" cycle (custom
 * v3 animation) shows the sensor cluster rotating/pulsing while the drone
 * hovers forward, so it doubles as the patrol animation.
 *
 * Mechanically a drone is an {@link Enforcer} — the map's `drones` tiles carry
 * the identical `enforcer` component schema — so it reuses that AI wholesale
 * via a {@link GuardSkin}; only the sprite differs. All 8 directions were
 * exported, so facing matches the guard's continuous patrol/pursuit angle
 * exactly (no cardinal snapping).
 *
 * Frames live in public/assets/drone/patrol/<direction>/<frame>.png.
 */

/**
 * Display height in tiles — half the old 1.5.
 *
 * The drone's art is a wide, splay-legged spider with almost no padding, so at
 * 1.5 tiles its body spanned 1.0–1.27 tiles depending on facing. `duct1`, the
 * only level it patrols, is built entirely from one-tile crawlways: a drone that
 * size cannot fit down its own level once it has a real collider. Halving it is
 * what makes the duct patrol possible, and a small scuttling sentry is the right
 * read for a crawlspace anyway.
 */
const DRONE_DISPLAY_TILES = 0.75;

/**
 * Native pixel size of the source art — 48, down from the 85 it used to be.
 *
 * This pairs with {@link DRONE_DISPLAY_TILES} to decide how the sprite is
 * resampled, and only one pairing avoids resampling it at all. The sprite is
 * drawn at `(tileSize * displayTiles) / sourceSize` and the camera runs at 2x
 * zoom, so `(32 * 0.75) / 48 * 2` = exactly 1: one screen pixel per source
 * pixel. The old pairing with 85 gave 0.5647 — below 1, which means
 * nearest-neighbour *discarded* about 44% of every frame, and which pixels
 * survived moved with the sprite's subpixel position, so the detail crawled as
 * the drone walked. See `PLAYER_SOURCE_SIZE` in `PlayerAnimations.ts` for the
 * same reasoning at greater length.
 *
 * The drone is the same size on screen as before — 41px of body against 40.7px
 * — because the art was redrawn smaller rather than displayed smaller. That is
 * also why `DRONE_DISPLAY_TILES` above is untouched, and why the duct fit is
 * unchanged: `guardRadiusTiles` lands at 0.3125 against the old 0.3132.
 */
const DRONE_SOURCE_SIZE = 48;

/** The drone's {@link GuardSkin}. */
export const DRONE_SKIN: GuardSkin = makeGuardSkin({
  id: "drone",
  frameCount: 8,
  frameRate: 8,
  displayTiles: DRONE_DISPLAY_TILES,
  sourceSize: DRONE_SOURCE_SIZE,
  collider: DRONE_PATROL_SOUTH_COLLIDER,
});
