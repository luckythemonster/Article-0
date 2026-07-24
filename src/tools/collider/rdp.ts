/**
 * Ramer–Douglas–Peucker polyline simplification.
 *
 * Part of the Article Zero collider generator: after the alpha silhouette of a
 * sprite is traced into a dense boundary path, RDP drops the vertices that lie
 * (within `epsilon` perpendicular pixels) on a straight run, leaving a compact
 * polygon that is cheap for physics/line-of-sight to reason about. A larger
 * `epsilon` yields fewer vertices. Pure, dependency-free, browser-safe.
 */

export interface Point {
  x: number;
  y: number;
}

/** Perpendicular distance from `p` to the (infinite) line through `a` and `b`. */
function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    // Degenerate segment: fall back to plain point-to-point distance.
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  // |(b - a) × (p - a)| / |b - a|
  const cross = dx * (p.y - a.y) - dy * (p.x - a.x);
  return Math.abs(cross) / Math.sqrt(lenSq);
}

/**
 * Simplifies `points` so the result stays within `epsilon` of the original
 * polyline. The two endpoints are always preserved. Behavioral port of the
 * reference Python implementation.
 */
export function rdp(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) {
    return points.slice();
  }

  const end = points.length - 1;
  let index = 0;
  let dmax = 0;
  for (let i = 1; i < end; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[end]);
    if (dist > dmax) {
      index = i;
      dmax = dist;
    }
  }

  if (dmax > epsilon) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    // `index` is shared by both halves; drop the duplicate at the seam.
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}
