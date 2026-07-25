import { GUARD_DIRS, guardRadiusTiles, type GuardSkin } from "./GuardSkin";
import { DRONE_PATROL_SOUTH_COLLIDER } from "./generated/droneCollider";

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

/**
 * Display height in tiles — half the old 1.5.
 *
 * The drone's 85×85 art is a wide, splay-legged spider with almost no padding,
 * so at 1.5 tiles its body spanned 1.0–1.27 tiles depending on facing. `duct1`,
 * the only level it patrols, is built entirely from one-tile crawlways: a drone
 * that size cannot fit down its own level once it has a real collider. Halving
 * it is what makes the duct patrol possible, and a small scuttling sentry is the
 * right read for a crawlspace anyway.
 */
const DRONE_DISPLAY_TILES = 0.75;

/** The drone's {@link GuardSkin}. */
export const DRONE_SKIN: GuardSkin = {
  frameCount: DRONE_PATROL_FRAME_COUNT,
  frameRate: 8,
  displayTiles: DRONE_DISPLAY_TILES,
  sourceSize: 85,
  collisionRadiusTiles: guardRadiusTiles(DRONE_PATROL_SOUTH_COLLIDER, DRONE_DISPLAY_TILES),
  frameKey: droneFrameKey,
  framePath: droneFramePath,
  animKey: droneAnimKey,
};
