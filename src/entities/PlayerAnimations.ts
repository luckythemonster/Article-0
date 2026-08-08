import { type Dir8 } from "./directions";
/**
 * Frame manifest for the player character sprite (PixelLab.ai character
 * `7b4ca7b4-7da9-4e10-8442-0d8f102619ce`, "Rowan Ibarra" — high top-down,
 * 36x36, 8-direction template, adopted as-is). All 8 directions were exported
 * per animation, so the sprite's facing matches the free 8-directional
 * movement exactly (no cardinal snapping).
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
 *     (tileSize * PLAYER_DISPLAY_TILES) / PLAYER_SOURCE_SIZE * zoom
 *       = (32 * 1.125) / 36 * 2  =  2
 *
 * A whole number, so every source pixel lands on an even 2x2 block of screen
 * pixels and the art is never resampled. 36 is this PixelLab character's
 * native size, adopted as-is rather than redrawn to a finer canvas — but
 * `PLAYER_DISPLAY_TILES` was *not* carried over unchanged from the previous
 * character: it was recalibrated (1.5 -> 1.125) so the body's on-screen
 * footprint lands near its historical size rather than whatever the new
 * canvas happens to produce at the old display size. `displayTiles` is a pure
 * scale knob, not art, and has to be re-picked per character — see the canvas
 * comment on `PLAYER` in `tools/pixellab/characters.ts` for the fuller story.
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

export function playerFramePath(anim: PlayerAnimName, dir: Dir8, frame: number): string {
  return `assets/player/${anim}/${dir}/${frame}.png`;
}

/** The Phaser animation key for a given anim+direction pair. */
export function playerAnimKey(anim: PlayerAnimName, dir: Dir8): string {
  return `player-${anim}-${dir}`;
}

