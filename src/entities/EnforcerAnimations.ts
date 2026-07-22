/**
 * Frame manifest for the enforcer sprite (generated via PixelLab.ai — a
 * compact tracked security drone with a swiveling floodlight/sensor arm, high
 * top-down, 34x34). The "patrol-scan" cycle (custom v3 animation) shows the
 * sensor arm sweeping left-right like a scanner while the drone inches
 * forward, so it doubles as the patrol animation.
 *
 * All 8 directions were exported, so facing matches the guard's continuous
 * patrol/pursuit angle exactly (no cardinal snapping).
 *
 * Frames live in public/assets/enforcer/patrol/<direction>/<frame>.png.
 */
export const ENFORCER_ANIM_DIRS = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const;
export type EnforcerAnimDir = (typeof ENFORCER_ANIM_DIRS)[number];

export const ENFORCER_PATROL_FRAME_COUNT = 8;

export function enforcerFrameKey(dir: EnforcerAnimDir, frame: number): string {
  return `enforcer-patrol-${dir}-${frame}`;
}

export function enforcerFramePath(dir: EnforcerAnimDir, frame: number): string {
  return `assets/enforcer/patrol/${dir}/${frame}.png`;
}

export function enforcerAnimKey(dir: EnforcerAnimDir): string {
  return `enforcer-patrol-${dir}`;
}

/** The 8 directions in angular order, starting at east (0°) going clockwise. */
const DIRECTION_ORDER: EnforcerAnimDir[] = [
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
  "north",
  "north-east",
];

/** Snaps a facing angle (radians) to the nearest of the 8 exported directions. */
export function nearestDirectionFromAngle(angle: number): EnforcerAnimDir {
  const angleDeg = (angle * 180) / Math.PI;
  const normalized = ((angleDeg % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return DIRECTION_ORDER[index];
}
