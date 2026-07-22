import { GUARD_DIRS, type GuardSkin } from "./GuardSkin";

/**
 * Frame manifest for the drone sprite (generated via PixelLab.ai — a small
 * non-humanoid patrol android with a spindly quadruped frame and a pulsing
 * sensor-cluster "eye", high top-down, 85x85). Its "patrol-scan" cycle (custom
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
export const DRONE_ANIM_DIRS = GUARD_DIRS;
export type DroneAnimDir = (typeof DRONE_ANIM_DIRS)[number];

export const DRONE_PATROL_FRAME_COUNT = 8;

export function droneFrameKey(dir: DroneAnimDir, frame: number): string {
  return `drone-patrol-${dir}-${frame}`;
}

export function droneFramePath(dir: DroneAnimDir, frame: number): string {
  return `assets/drone/patrol/${dir}/${frame}.png`;
}

export function droneAnimKey(dir: DroneAnimDir): string {
  return `drone-patrol-${dir}`;
}

/** The drone's {@link GuardSkin} — 1.5 tiles tall, matching the other guards. */
export const DRONE_SKIN: GuardSkin = {
  frameCount: DRONE_PATROL_FRAME_COUNT,
  frameRate: 8,
  displayTiles: 1.5,
  sourceSize: 85,
  frameKey: droneFrameKey,
  framePath: droneFramePath,
  animKey: droneAnimKey,
};
