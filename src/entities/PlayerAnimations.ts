import { type Dir8 } from "./directions";
/**
 * Frame manifest for the player character.
 *
 * All 8 directions exist for every animation, so the sprite's facing matches the
 * free 8-directional movement exactly (no cardinal snapping). idle/walk/run are
 * standing; crouch and crouch-walk are the settled kneel and the sneak stride;
 * crouch-down and crouch-up are one-shot transitions between the two, and their
 * *completion* is what settles the stance machine in `Player.update`.
 *
 * The frames are drawn at boot by `CastArt.buildCastTextures`, under the keys
 * {@link playerFrameKey} names — nothing is loaded from disk. What stays here is
 * the manifest: which clips exist, how many frames each has and how fast they
 * run, which is what both the animation registration and the poses read.
 */

export type PlayerAnimName =
  | "idle"
  | "walk"
  | "run"
  | "crouch"
  | "crouch-walk"
  | "crouch-down"
  | "crouch-up";

/**
 * Native size of every player frame, in pixels.
 *
 * This is load-bearing, not a description of the art. The sprite is drawn at
 * `displaySize / PLAYER_SOURCE_SIZE`, and the game camera runs at 2x zoom, so
 * the number of screen pixels one source pixel covers is:
 *
 *     (tileSize * PLAYER_DISPLAY_TILES) / PLAYER_SOURCE_SIZE * zoom
 *       = (32 * 1.125) / 36 * 2  =  2
 *
 * A whole number, so every source pixel lands on an even 2x2 block of screen
 * pixels and the art is never resampled. It is also the canvas `CastArt` draws
 * Rowan into, so the figure is authored at exactly the size it is displayed at.
 *
 * Any non-whole result breaks the rule: the frames used to be 88x88, which
 * worked out to 1.0909 screen pixels per source pixel, and with
 * `pixelArt: true` (nearest-neighbour) that meant most pixels got one screen
 * pixel while every eleventh got two, with `roundPixels` re-snapping the
 * whole grid as the camera panned — the character read as a smudge no matter
 * how well it was drawn.
 *
 * So: if this changes, the frames on disk must change with it, and the product
 * with the display size and the camera zoom must stay a whole number.
 */
export const PLAYER_SOURCE_SIZE = 36;

/**
 * Display height as a multiple of tile size.
 *
 * Paired with {@link PLAYER_SOURCE_SIZE} above: together they are what make the
 * scale come out whole. See `src/render/pixelScale.ts`.
 */
export const PLAYER_DISPLAY_TILES = 1.125;

/** Frame count per animation (same across all 8 directions). */
export const PLAYER_ANIM_FRAME_COUNTS: Record<PlayerAnimName, number> = {
  idle: 4,
  walk: 4,
  run: 4,
  crouch: 4,
  "crouch-walk": 6,
  // One-shot lower/rise transitions between standing and crouched.
  "crouch-down": 9,
  "crouch-up": 9,
};

/** Playback rate (fps) per animation. */
export const PLAYER_ANIM_FRAME_RATES: Record<PlayerAnimName, number> = {
  idle: 4,
  walk: 6,
  run: 9,
  crouch: 4,
  "crouch-walk": 7,
  // ~0.6s each — quick enough to feel responsive, slow enough to read.
  "crouch-down": 15,
  "crouch-up": 15,
};

export function playerFrameKey(anim: PlayerAnimName, dir: Dir8, frame: number): string {
  return `player-${anim}-${dir}-${frame}`;
}

/** The Phaser animation key for a given anim+direction pair. */
export function playerAnimKey(anim: PlayerAnimName, dir: Dir8): string {
  return `player-${anim}-${dir}`;
}

