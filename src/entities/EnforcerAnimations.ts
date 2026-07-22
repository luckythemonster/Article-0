import { GUARD_DIRS, type GuardSkin } from "./GuardSkin";

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
export const ENFORCER_ANIM_DIRS = GUARD_DIRS;
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

/** The enforcer's {@link GuardSkin} — 1.5 tiles tall, matching the player. */
export const ENFORCER_SKIN: GuardSkin = {
  frameCount: ENFORCER_PATROL_FRAME_COUNT,
  frameRate: 8,
  displayTiles: 1.5,
  sourceSize: 48,
  frameKey: enforcerFrameKey,
  framePath: enforcerFramePath,
  animKey: enforcerAnimKey,
};
