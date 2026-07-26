/**
 * Angle helpers shared by everything that aims: guard vision cones, the camera
 * sweep, VENT-4's rotor arms.
 *
 * Pure — no Phaser, no allocation — so it unit-tests like the rest of
 * `src/systems`.
 */

/**
 * Smallest signed angle from `a` to `b`, in (-pi, pi].
 *
 * The point is the wrap: a guard facing 179° and a target at -179° are two
 * degrees apart, not 358. Every cone test wants that shortest arc, so the naive
 * `b - a` is wrong exactly where the cone edge matters most.
 */
export function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
