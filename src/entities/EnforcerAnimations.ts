/**
 * Frame manifest for the enforcer sprite (generated via PixelLab.ai, "Enforcer"
 * — a tracked security drone with a swiveling floodlight/sensor arm, high
 * top-down, 68x68). The "apprehend" cycle shows the sensor arm sweeping
 * left-right like a scanner, so it doubles as the patrol animation.
 *
 * Only 4 cardinal directions were exported (matching the player convention):
 * facing snaps to the nearest cardinal while the underlying patrol/pursue
 * motion stays free-angled.
 *
 * Frames live in public/assets/enforcer/patrol/<direction>/<frame>.png.
 */
export const ENFORCER_ANIM_DIRS = ["south", "east", "west", "north"] as const;
export type EnforcerAnimDir = (typeof ENFORCER_ANIM_DIRS)[number];

export const ENFORCER_PATROL_FRAME_COUNT = 9;

export function enforcerFrameKey(dir: EnforcerAnimDir, frame: number): string {
  return `enforcer-patrol-${dir}-${frame}`;
}

export function enforcerFramePath(dir: EnforcerAnimDir, frame: number): string {
  return `assets/enforcer/patrol/${dir}/${frame}.png`;
}

export function enforcerAnimKey(dir: EnforcerAnimDir): string {
  return `enforcer-patrol-${dir}`;
}

/** Snaps a facing angle (radians) to the nearest of the 4 exported directions. */
export function nearestCardinalFromAngle(angle: number): EnforcerAnimDir {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "south" : "north";
}
