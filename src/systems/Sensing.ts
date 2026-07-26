import type { AlertState } from "./AlertState";
import { angleDiff } from "./angles";

/**
 * The one implementation of "can this thing see the player, and how fast does
 * that fill its meter".
 *
 * A patrolling {@link Enforcer} and a mounted {@link Sensor} camera answer that
 * question identically — same compliance short-circuit, same chaff blinding,
 * same 360° thermal path, same wall-clipped cone — and for a long time each
 * carried its own copy of the arithmetic. They drifted only in the names of the
 * stats they read. This module holds the behaviour once; the classes keep their
 * own tuning and their own state machines.
 *
 * Pure: no Phaser, no allocation per call, so it unit-tests like the rest of
 * `src/systems`.
 */

/** Everything sensing needs to know about one eye — a guard's, or a camera's. */
export interface Eye {
  /** Pixel-space position of the eye. */
  x: number;
  y: number;
  /** Cone axis, radians (world convention: 0 = east, +y = south). */
  facing: number;
  /** Cone reach, in tiles. */
  rangeTiles: number;
  /** Full cone width, in **degrees** — the map authors it that way. */
  coneDegrees: number;
  /** 360° heat-sense reach, in tiles, before Thermal Gel scaling. */
  thermalTiles: number;
}

/**
 * The slice of the per-frame guard context sensing actually reads.
 *
 * Declared structurally rather than importing `EnforcerContext` so this module
 * stays free of Phaser (`Enforcer.ts` imports it) and a test can hand it a
 * plain object. `EnforcerContext` satisfies this by shape.
 */
export interface SensingWorld {
  grid: { hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean };
  tileSize: number;
  player: { x: number; y: number };
  playerConcealed: boolean;
  playerCompliant: boolean;
  playerThermalConcealed: boolean;
  chaffZone: { x: number; y: number; radiusPx: number } | null;
  thermalRadiusMultiplier: (baseTiles: number) => number;
}

/** The extra context {@link accrueDetection} needs on top of {@link SensingWorld}. */
export interface DetectionWorld {
  tileSize: number;
  player: { x: number; y: number };
  lightMultiplierAt: (px: number, py: number) => number;
  alert: AlertState;
}

/** How fast a detection meter drains once the player is out of sight, per second. */
export const DETECTION_DECAY_PER_SECOND = 0.6;

/**
 * True when `eye` senses the player this frame, by either of two paths:
 *
 *  - **thermal** — a short 360° heat sense within {@link Eye.thermalTiles},
 *    ignoring the cone angle, as long as the player isn't hidden in
 *    heat-blocking cover and there's clear line of sight;
 *  - **cone** — inside the vision cone, within {@link Eye.rangeTiles}, with
 *    clear LOS, and not concealed.
 *
 * Compliance short-circuits both, at any range. That is the point of it: the
 * guard looks straight at Rowan, reads him as staff going about his business,
 * and returns to the sweep. Distance is not the limiter — conduct is. A camera
 * clears him the same way, because the feed goes to the same Alignment
 * apparatus and it is judging conduct, not faces.
 */
export function canSense(eye: Eye, ctx: SensingWorld): boolean {
  if (ctx.playerCompliant) return false;

  // A live Chaff Pack EMP zone blinds anything caught inside it outright.
  const chaff = ctx.chaffZone;
  if (chaff) {
    const cdx = eye.x - chaff.x;
    const cdy = eye.y - chaff.y;
    if (cdx * cdx + cdy * cdy <= chaff.radiusPx * chaff.radiusPx) return false;
  }

  const { player, tileSize, grid } = ctx;
  const dx = player.x - eye.x;
  const dy = player.y - eye.y;
  // Squared throughout: every use below is a threshold comparison, and the
  // square root would only be thrown away.
  const dist2 = dx * dx + dy * dy;

  const hasLos = (): boolean =>
    grid.hasLineOfSight(
      eye.x / tileSize,
      eye.y / tileSize,
      player.x / tileSize,
      player.y / tileSize,
    );

  // Thermal: close-range body heat betrays the player even outside the cone.
  const thermalPx = ctx.thermalRadiusMultiplier(eye.thermalTiles) * tileSize;
  if (
    !ctx.playerThermalConcealed &&
    thermalPx > 0 &&
    dist2 <= thermalPx * thermalPx &&
    hasLos()
  ) {
    return true;
  }

  // Cone: concealment (crouched in cover, or inside the Shared Field) hides the
  // player from the visible cone even in plain line of sight.
  if (ctx.playerConcealed) return false;
  const rangePx = eye.rangeTiles * tileSize;
  if (dist2 > rangePx * rangePx) return false;
  const half = (eye.coneDegrees * Math.PI) / 360; // half of coneDegrees, in radians
  if (Math.abs(angleDiff(eye.facing, Math.atan2(dy, dx))) > half) return false;
  return hasLos();
}

/**
 * Advances a 0..1 detection meter for one frame and returns its new value.
 *
 * Filling is scaled by the light where the player stands, so a lit room gives
 * you away faster than a dark one, and by `fillMultiplier` for states that
 * sharpen a guard (CAUTIOUS). Reaching 1 reports the sighting to the alert FSM
 * — the caller doesn't have to, and can't forget to.
 *
 * @param fillSeconds seconds of unbroken sight to go from 0 to 1 in neutral light.
 */
export function accrueDetection(
  current: number,
  sensed: boolean,
  dt: number,
  fillSeconds: number,
  ctx: DetectionWorld,
  fillMultiplier = 1,
): number {
  if (!sensed) {
    return Math.max(0, current - dt * DETECTION_DECAY_PER_SECOND);
  }
  const light = ctx.lightMultiplierAt(ctx.player.x, ctx.player.y);
  const rate = (1 / fillSeconds) * light * fillMultiplier;
  const next = Math.min(1, current + rate * dt);
  if (next >= 1) {
    ctx.alert.reportSighting(
      Math.floor(ctx.player.x / ctx.tileSize),
      Math.floor(ctx.player.y / ctx.tileSize),
    );
    return 1;
  }
  return next;
}
