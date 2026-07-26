/**
 * Plain 2D distance, and the threshold test that avoids needing it.
 *
 * `Math.hypot` is the obvious way to write this and the wrong one for a game
 * loop. It is variadic and specified to avoid intermediate overflow, so V8
 * cannot inline it the way it inlines `sqrt` — it scales its arguments by the
 * largest magnitude, sums, and unscales. That care buys nothing at world
 * coordinates a few thousand pixels wide, and it costs several times the
 * direct form at every call. The codebase had around fifty of them, a good
 * share inside per-guard, per-frame loops.
 *
 * Prefer {@link within} wherever the answer is a yes/no against a radius: that
 * skips the square root altogether rather than merely computing it faster.
 */

/**
 * Euclidean length of the vector (dx, dy).
 *
 * Named `len` rather than `dist` because `const dist = …` is a common local in
 * the entity code and shadowing it reads badly.
 */
export function len(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

/** True when (dx, dy) is strictly shorter than `radius`. No square root. */
export function within(dx: number, dy: number, radius: number): boolean {
  return dx * dx + dy * dy < radius * radius;
}

/** True when (dx, dy) is no longer than `radius`. No square root. */
export function withinOrEqual(dx: number, dy: number, radius: number): boolean {
  return dx * dx + dy * dy <= radius * radius;
}
