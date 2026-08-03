import { type Dir8 } from "./directions";
/**
 * Frame manifest for the player character sprite (generated via PixelLab.ai,
 * "Rowan Ibarra" — high top-down, 96x96, 8-direction template). All 8
 * directions were exported per animation, so the sprite's facing matches the
 * free 8-directional movement exactly (no cardinal snapping).
 *
 * idle/walk/run come from the standing "Rowan Ibarra" character; crouch and
 * crouch-walk come from a crouched state of that same character (same rig,
 * outfit and palette, posed low) — a proper settled kneel for standing still in
 * cover versus a distinct crouch-sneak stride for moving in it. crouch-down and
 * crouch-up interpolate between the two sheets' rotations.
 *
 * Frames live in public/assets/player/<anim>/<direction>/<frame>.png, and are
 * regenerated with `tools/pixellab/generate-player.ts`.
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
 *     (tileSize * 1.5) / PLAYER_SOURCE_SIZE * zoom  =  48 / 96 * 2  =  1
 *
 * Exactly 1. Every source pixel lands on exactly one screen pixel, and the art
 * is never resampled. Any other canvas size breaks that: the frames used to be
 * 88x88, which works out to 1.0909 screen pixels per source pixel, and with
 * `pixelArt: true` (nearest-neighbour) that means most pixels get one screen
 * pixel while every eleventh gets two. `roundPixels` then re-snaps the whole
 * grid as the camera pans, so the outline breaks up and interior detail crawls
 * — the character reads as a smudge no matter how well it is drawn.
 *
 * So: if this changes, the frames on disk must change with it, and the product
 * with the display size and the camera zoom must stay a whole number.
 */
export const PLAYER_SOURCE_SIZE = 96;

/**
 * Display height as a multiple of tile size.
 *
 * Paired with {@link PLAYER_SOURCE_SIZE} above: together they are what make the
 * scale come out whole. See `src/render/pixelScale.ts`.
 */
export const PLAYER_DISPLAY_TILES = 1.5;

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

export function playerFramePath(anim: PlayerAnimName, dir: Dir8, frame: number): string {
  return `assets/player/${anim}/${dir}/${frame}.png`;
}

/** The Phaser animation key for a given anim+direction pair. */
export function playerAnimKey(anim: PlayerAnimName, dir: Dir8): string {
  return `player-${anim}-${dir}`;
}

