import { type Dir8 } from "./directions";
/**
 * Frame manifest for the player character sprite (generated via PixelLab.ai,
 * "Rowan Ibarra" — high top-down, 88x88, 8-direction template). All 8
 * directions were exported per animation, so the sprite's facing matches the
 * free 8-directional movement exactly (no cardinal snapping).
 *
 * idle/walk/run come from the standing "Rowan Ibarra" character; crouch and
 * crouch-walk come from a second, dedicated "Rowan Ibarra crouched" character
 * sheet (same rig/outfit, posed low) — a proper settled kneel for standing
 * still in cover versus a distinct crouch-sneak stride for moving in it.
 *
 * Frames live in public/assets/player/<anim>/<direction>/<frame>.png.
 */

export type PlayerAnimName =
  | "idle"
  | "walk"
  | "run"
  | "crouch"
  | "crouch-walk"
  | "crouch-down"
  | "crouch-up";

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

