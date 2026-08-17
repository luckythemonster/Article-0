import { withinOrEqual } from "./distance";

/**
 * Where a searching guard could reasonably look: the cover tiles near a point.
 *
 * Pure, and deliberately not a method on either board it consults. Two callers
 * want this — the sensing context hands it to guards as their smart-search
 * point source, and the anomaly pass uses the same notion of "cover near here"
 * — and when it lived on the scene as a private method, one of them reached it
 * through a closure and the other through `this`. One implementation, one set
 * of edge cases at the map border.
 */

/** The two boards a cover query has to agree with. */
export interface CoverBoards {
  /** Would this cell stop a standing man. */
  isBlocked(tx: number, ty: number): boolean;
  /** `"low"`, `"high"`, or undefined for anything that is not cover, at a pixel position. */
  coverTypeAt(px: number, py: number): string | undefined;
}

/** Cover tile centres (pixels) within `radiusTiles` of a tile position. */
export function coverTilesNear(
  boards: CoverBoards,
  levelWidth: number,
  levelHeight: number,
  tileSize: number,
  tileX: number,
  tileY: number,
  radiusTiles: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const minX = Math.max(0, Math.floor(tileX - radiusTiles));
  const maxX = Math.min(levelWidth - 1, Math.ceil(tileX + radiusTiles));
  const minY = Math.max(0, Math.floor(tileY - radiusTiles));
  const maxY = Math.min(levelHeight - 1, Math.ceil(tileY + radiusTiles));
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      if (!withinOrEqual(tx - tileX, ty - tileY, radiusTiles)) continue;
      if (boards.isBlocked(tx, ty)) continue;
      const px = (tx + 0.5) * tileSize;
      const py = (ty + 0.5) * tileSize;
      if (boards.coverTypeAt(px, py) === undefined) continue;
      out.push({ x: px, y: py });
    }
  }
  return out;
}
