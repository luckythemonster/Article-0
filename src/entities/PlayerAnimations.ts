/**
 * Frame manifest for the player character sprite (generated via PixelLab.ai,
 * "Rowan Ibarra" — high top-down, 64x64, 8-direction template). Only 4
 * cardinal directions were exported per animation; diagonal movement snaps its
 * *visual* facing to the nearest cardinal while the underlying motion stays
 * free 8-directional (a standard top-down RPG convention).
 *
 * Frames live in public/assets/player/<anim>/<direction>/<frame>.png.
 */
export const PLAYER_ANIM_DIRS = ["south", "east", "west", "north"] as const;
export type PlayerAnimDir = (typeof PLAYER_ANIM_DIRS)[number];

export type PlayerAnimName = "idle" | "walk" | "run" | "crouch";

/** Frame count per animation (same across all 4 directions). */
export const PLAYER_ANIM_FRAME_COUNTS: Record<PlayerAnimName, number> = {
  idle: 4,
  walk: 8,
  run: 8,
  crouch: 5,
};

/** Playback rate (fps) per animation. */
export const PLAYER_ANIM_FRAME_RATES: Record<PlayerAnimName, number> = {
  idle: 4,
  walk: 10,
  run: 16,
  crouch: 8,
};

export function playerFrameKey(anim: PlayerAnimName, dir: PlayerAnimDir, frame: number): string {
  return `player-${anim}-${dir}-${frame}`;
}

export function playerFramePath(anim: PlayerAnimName, dir: PlayerAnimDir, frame: number): string {
  return `assets/player/${anim}/${dir}/${frame}.png`;
}

/** The Phaser animation key for a given anim+direction pair. */
export function playerAnimKey(anim: PlayerAnimName, dir: PlayerAnimDir): string {
  return `player-${anim}-${dir}`;
}

/** Snaps a movement vector to the nearest of the 4 exported cardinal directions. */
export function nearestCardinal(dx: number, dy: number): PlayerAnimDir {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "south" : "north";
}
