/**
 * Output formatters for the Article Zero collider generator. Turns a simplified
 * polygon (see {@link rdp}) into the shapes the engine consumes:
 *
 *  - {@link toAABB}          — tight-fit box for Phaser Arcade `body.setSize`/`setOffset`.
 *  - {@link toPointObjects}  — `{ x, y }[]` for custom polygon hitboxes / LOS.
 *  - {@link toFlatArray}     — `[x1, y1, x2, y2, ...]`.
 *  - {@link toMatterVertices}— `"x1 y1 x2 y2 ..."` path for `Matter.Bodies.fromVertices`.
 *
 * Pure and dependency-free.
 */

import type { Point } from "./rdp";

export interface AABB {
  /** Body width in pixels (Arcade `body.setSize`). */
  width: number;
  /** Body height in pixels. */
  height: number;
  /** Left edge in unscaled sprite-local pixels (Arcade `body.setOffset`). */
  offsetX: number;
  /** Top edge in unscaled sprite-local pixels. */
  offsetY: number;
}

export type Origin = "top-left" | "center";

export interface FrameSize {
  width: number;
  height: number;
}

/**
 * Tight axis-aligned bounding box of `points`, optionally shrunk by `inset`
 * pixels on every side (so a collision body can sit inside the drawn silhouette
 * rather than hugging every stray arm/head pixel). The inset is clamped so the
 * box never collapses below 1px.
 */
export function toAABB(points: Point[], inset = 0): AABB {
  if (points.length === 0) {
    throw new Error("toAABB: cannot bound an empty point set");
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const rawW = maxX - minX;
  const rawH = maxY - minY;
  const insetX = Math.min(inset, Math.max(0, (rawW - 1) / 2));
  const insetY = Math.min(inset, Math.max(0, (rawH - 1) / 2));
  return {
    width: Math.round(rawW - 2 * insetX),
    height: Math.round(rawH - 2 * insetY),
    offsetX: Math.round(minX + insetX),
    offsetY: Math.round(minY + insetY),
  };
}

/** Re-expresses `points` relative to the requested origin, per the reference pipeline. */
function applyOrigin(points: Point[], origin: Origin, frame: FrameSize): Point[] {
  if (origin === "center") {
    const cx = frame.width / 2;
    const cy = frame.height / 2;
    return points.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  }
  return points.map((p) => ({ x: p.x, y: p.y }));
}

/** `{ x, y }[]` with integer coordinates, in the requested origin space. */
export function toPointObjects(points: Point[], origin: Origin, frame: FrameSize): Point[] {
  return applyOrigin(points, origin, frame).map((p) => ({
    x: Math.round(p.x),
    y: Math.round(p.y),
  }));
}

/** Flat `[x1, y1, x2, y2, ...]` array of integer coordinates. */
export function toFlatArray(points: Point[]): number[] {
  const flat: number[] = [];
  for (const p of points) {
    flat.push(Math.round(p.x), Math.round(p.y));
  }
  return flat;
}

/** Space-separated path string for `Matter.Vertices.fromPath` / `Bodies.fromVertices`. */
export function toMatterVertices(points: Point[]): string {
  return points.map((p) => `${Math.round(p.x)} ${Math.round(p.y)}`).join(" ");
}
