/**
 * Frame manifest for the player character sprite (generated via PixelLab.ai,
 * "Rowan Ibarra" — high top-down, 64x64, 8-direction template). All 8
 * directions were exported per animation, so the sprite's facing matches the
 * free 8-directional movement exactly (no cardinal snapping).
 *
 * Frames live in public/assets/player/<anim>/<direction>/<frame>.png.
 */
export const PLAYER_ANIM_DIRS = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const;
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

/** The 8 directions in angular order, starting at east (0°) going clockwise. */
const DIRECTION_ORDER: PlayerAnimDir[] = [
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
  "north",
  "north-east",
];

/** Snaps a movement vector to the nearest of the 8 exported directions. */
export function nearestDirection(dx: number, dy: number): PlayerAnimDir {
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const normalized = (angleDeg + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return DIRECTION_ORDER[index];
}
