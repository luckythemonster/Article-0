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

/**
 * Fast vector dot-product test to check whether offset vector `(dx, dy)` lies
 * within `halfAngleRad` of `facingRad`.
 *
 * Avoids expensive `Math.atan2` and trigonometric wrap arithmetic (`angleDiff`)
 * in high-frequency per-frame vision cone queries.
 *
 * @param dx X offset to target
 * @param dy Y offset to target
 * @param dist2 Precalculated squared distance (`dx * dx + dy * dy`)
 * @param facingRad Facing angle in radians
 * @param halfAngleRad Half of full cone angle in radians
 */
export function isWithinCone(
  dx: number,
  dy: number,
  dist2: number,
  facingRad: number,
  halfAngleRad: number,
): boolean {
  if (dist2 === 0) return true;
  const cosFacing = Math.cos(facingRad);
  const sinFacing = Math.sin(facingRad);
  const cosHalf = Math.cos(halfAngleRad);
  const cosHalfSq = cosHalf * cosHalf;
  const dot = dx * cosFacing + dy * sinFacing;

  if (cosHalf >= 0) {
    if (dot < 0) return false;
    return dot * dot >= cosHalfSq * dist2;
  } else {
    if (dot >= 0) return true;
    return dot * dot <= cosHalfSq * dist2;
  }
}
