import type { CollisionGrid } from "../systems/CollisionGrid";
import { falloff, POOL_CORE } from "./falloff";

/**
 * Working out which way a point in the level is lit, so something standing there can
 * cast from it.
 *
 * Deliberately free of Phaser, and separate from `src/ui/Lighting.ts` which owns the
 * actual light data: this is the arithmetic, and keeping it standalone is what lets it
 * be tested against a hand-built `CollisionGrid` without a scene, a canvas or a GL
 * context. `Lighting.sampleLight` is a thin wrapper that supplies its own lights.
 */

/** The subset of a light that matters for casting. */
export interface CastingLight {
  x: number;
  y: number;
  /** Reach in px. Beyond this the light contributes nothing at all. */
  radiusPx: number;
  /** Brightness multiplier — 1 for a steady light, the flicker factor for a guttering one. */
  intensity: number;
}

/**
 * How a point in the level is lit.
 *
 * Separating "how bright" from "how one-sided" is what lets a caster tell being under
 * a single lamp (dark, long, offset shadow) from standing between two of them (dark,
 * short, centred shadow). The two are equally lit and want completely different
 * shadows, and a single brightness scalar cannot distinguish them.
 */
export interface LightSample {
  /**
   * Unit vector pointing *away* from the light — the direction a shadow falls. Zero on
   * both axes when the point is unlit or lit evenly from every side.
   */
  dx: number;
  dy: number;
  /** 0..1 brightness at the point, on the same {@link falloff} curve the stamps are drawn with. */
  strength: number;
  /** 0..1 how one-sided the light is: 1 is a single lamp, 0 is evenly surrounded. */
  directionality: number;
}

/** A zeroed sample, for a caller that needs a starting value. */
export function emptySample(): LightSample {
  return { dx: 0, dy: 0, strength: 0, directionality: 0 };
}

/**
 * Sums every light reaching `(x, y)` into `out`, and returns it.
 *
 * Writes into a caller-owned `out` rather than returning a fresh object: this runs once
 * per caster per frame, and the whole cast minting a throwaway `{dx, dy, ...}` every
 * frame is the same garbage `Enforcer` avoids by exposing public `x`/`y` instead of a
 * `position` getter. The returned value is only valid until the next call with the
 * same `out`.
 *
 * Three things about the summation are load-bearing:
 *
 * - **Brightness uses {@link falloff} with {@link POOL_CORE}** — the exact curve the
 *   light-pool stamps are drawn with. A shadow's darkness therefore tracks the light
 *   actually on screen at that spot, rather than a second curve that drifts apart from
 *   it the first time either is retuned.
 * - **Direction is a weighted vector sum, not the nearest light.** Two lamps facing each
 *   other cancel, leaving a centred shadow that is *dark* rather than *absent*, which is
 *   what lighting from both sides really does. Picking the brightest light instead would
 *   make the shadow snap from one side to the other as the caster crossed the midpoint.
 * - **`directionality` is `|Σ| / Σ|·|`** — the cancellation, normalised. It falls out of
 *   the sum for free and is what the caller scales the offset and the stretch by, so the
 *   two lamps above shorten the shadow instead of merely re-aiming it.
 *
 * Lights blocked by a wall contribute nothing: the check is {@link rayDistance} with a
 * `reveal` of 0, the same flush-at-the-wall-face treatment the vision cones use, for the
 * same reason. The darkness overlay's half-tile reveal would let a lamp throw a shadow
 * from the wrong side of the wall it is mounted on.
 */
export function sampleLightAt(
  lights: readonly CastingLight[],
  x: number,
  y: number,
  grid: CollisionGrid,
  tileSize: number,
  out: LightSample,
): LightSample {
  let sumX = 0;
  let sumY = 0;
  let total = 0;

  const invTileSize = 1 / tileSize;
  const sx = x * invTileSize;
  const sy = y * invTileSize;

  for (const l of lights) {
    if (l.intensity <= 0) continue;

    const dx = x - l.x;
    const dy = y - l.y;
    const d2 = dx * dx + dy * dy;
    const r = l.radiusPx;
    // Squared-distance reject first: lights are static and reach at most a few tiles,
    // so this throws out nearly all of them before anything expensive happens.
    if (d2 >= r * r) continue;

    // Fast integer-DDA line-of-sight check back toward the light.
    if (!grid.hasLineOfSight(sx, sy, l.x * invTileSize, l.y * invTileSize)) {
      continue;
    }

    // Standing exactly on the light: bright here but has no direction to throw
    // from, so it contributes to `total` and nothing to the vector sum.
    if (d2 === 0) {
      total += l.intensity;
      continue;
    }

    let d: number;
    let s: number;
    const coreR2 = r * r * (POOL_CORE * POOL_CORE);
    if (d2 <= coreR2) {
      // Within the light core radius, falloff is 1.0.
      s = l.intensity;
      d = Math.sqrt(d2);
    } else {
      d = Math.sqrt(d2);
      s = falloff(d / r, POOL_CORE) * l.intensity;
      if (s <= 0) continue;
    }

    // Weighted direction vector accumulation (nx * s = dx * (s / d))
    const factor = s / d;
    total += s;
    sumX += dx * factor;
    sumY += dy * factor;
  }

  if (total <= 0) {
    out.dx = 0;
    out.dy = 0;
    out.strength = 0;
    out.directionality = 0;
    return out;
  }

  const mag = Math.sqrt(sumX * sumX + sumY * sumY);
  out.dx = mag > 0 ? sumX / mag : 0;
  out.dy = mag > 0 ? sumY / mag : 0;
  out.strength = Math.min(1, total);
  out.directionality = Math.min(1, mag / total);
  return out;
}
