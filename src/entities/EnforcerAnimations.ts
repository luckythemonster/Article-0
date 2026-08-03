import { makeGuardSkin, type GuardSkin } from "./GuardSkin";
import { ENFORCER_PATROL_SOUTH_COLLIDER } from "./generated/enforcerCollider";

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

/**
 * Display height in tiles.
 *
 * Down from 1.5, which the enforcer could never honestly wear. The player is
 * also nominally "1.5 tiles", but its 96×96 art is mostly padding, so Rowan's
 * real body is ~0.5 tiles across; the enforcer's 48×48 frame is nearly
 * edge-to-edge robot, so at 1.5 it was genuinely 1.5 tiles *wide* — wider than
 * the one-tile doorways it patrols through. At 1.15 the traced silhouette fits
 * the map, and the enforcer still reads as considerably bulkier than both the
 * player and the drone.
 */
const ENFORCER_DISPLAY_TILES = 1.15;

/** The enforcer's {@link GuardSkin}. */
export const ENFORCER_SKIN: GuardSkin = makeGuardSkin({
  id: "enforcer",
  frameCount: 8,
  frameRate: 8,
  displayTiles: ENFORCER_DISPLAY_TILES,
  sourceSize: 48,
  collider: ENFORCER_PATROL_SOUTH_COLLIDER,
});
