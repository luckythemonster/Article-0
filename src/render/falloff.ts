/**
 * The curve every light in the game fades along.
 *
 * On its own, and free of Phaser, because two very different things depend on it and one
 * of them has to run without a canvas:
 *
 * - `./stamps.ts` *draws* it, baking it into the radial texture the light pools are
 *   erased with.
 * - `./lightSampling.ts` *evaluates* it, weighting how strongly a light throws a
 *   character's shadow.
 *
 * Those two agreeing is the whole point. Give them separate curves and they drift apart
 * the first time either is retuned — a character standing in a pool that is visibly
 * bright while their shadow insists it is dim.
 */

/**
 * Fraction of a light's reach that stays at full strength before the falloff starts.
 *
 * The core is what keeps a pool *bright* — at 0 the light becomes a dim smudge, which
 * matters a lot now that unlit space is genuinely black rather than a tint you could
 * still read through.
 *
 * Half the radius is a deliberate balance. Against the old stacked-circle stamp it keeps
 * ~75% of the light while cutting the steepest part of the falloff from a slope of ~320
 * (a step in all but name — the rim) to ~3. Almost all of the harshness came from that
 * near-discontinuity rather than from the plateau, so there is no need to darken the
 * level to be rid of it.
 */
export const POOL_CORE = 0.5;

/** Smooth 0→1 ramp with zero slope at both ends. */
export function smoothstep(t: number): number {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

/**
 * Light strength at normalised distance `u` (0 at the source, 1 at its reach): full out
 * to `core`, then easing to nothing at the edge.
 *
 * The shape matters more than it looks: the previous stamps were built by stacking
 * translucent circles, whose composite happened to hold a flat 1.0 out to 60% of the
 * radius and then fall off a cliff over the last third — a plateau with a rim, which is
 * what read as artificial once the surrounding dark went fully opaque.
 */
export function falloff(u: number, core: number): number {
  if (u <= core) return 1;
  if (u >= 1) return 0;
  return 1 - smoothstep((u - core) / (1 - core));
}
