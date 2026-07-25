import type { CollisionGrid } from "./CollisionGrid";

/**
 * Line-of-sight raycasting for the *render* path: how far the player can actually
 * see in each direction, given the walls.
 *
 * {@link CollisionGrid.hasLineOfSight} answers "can A see B?" for the guards; this
 * answers "how far does sight reach along this heading?", which is what carving a
 * visibility polygon out of the darkness needs ({@link Lighting}). Pure — no Phaser,
 * no allocation per frame — so it unit-tests like the rest of `src/systems`.
 */

/** Rays cast per visibility polygon. Raise for accuracy, lower for cost. */
export const SIGHT_RAYS = 288;

/** Unit ray directions, split into parallel arrays so casting allocates nothing. */
export interface RayDirections {
  readonly cos: Float64Array;
  readonly sin: Float64Array;
}

/**
 * Unit directions for `rayCount` evenly-spaced headings over a full turn. Fixed for
 * the life of a level, so build once and hand the same object to every cast.
 */
export function rayDirections(rayCount: number = SIGHT_RAYS): RayDirections {
  const cos = new Float64Array(rayCount);
  const sin = new Float64Array(rayCount);
  for (let i = 0; i < rayCount; i++) {
    const a = (i / rayCount) * Math.PI * 2;
    cos[i] = Math.cos(a);
    sin[i] = Math.sin(a);
  }
  return { cos, sin };
}

/**
 * Distance (in tiles) sight reaches from `(originX, originY)` along the unit
 * direction `(dirX, dirY)`, capped at `maxTiles`.
 *
 * An Amanatides–Woo grid walk: step boundary to boundary, stopping at the first
 * blocked cell. The blocking cell is *included* — the distance returned is to its
 * far side, not its near face — so a wall you are looking at is itself lit rather
 * than wearing a black band. The origin cell is never tested, so standing inside a
 * wall (debug no-clip) still sees out.
 */
export function rayDistance(
  grid: CollisionGrid,
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  maxTiles: number,
): number {
  let ix = Math.floor(originX);
  let iy = Math.floor(originY);

  const stepX = dirX > 0 ? 1 : -1;
  const stepY = dirY > 0 ? 1 : -1;
  // Ray distance covered by crossing one whole tile on each axis.
  const deltaX = dirX === 0 ? Infinity : Math.abs(1 / dirX);
  const deltaY = dirY === 0 ? Infinity : Math.abs(1 / dirY);
  // Ray distance to the first boundary on each axis.
  let nextX =
    dirX === 0 ? Infinity : dirX > 0 ? (ix + 1 - originX) / dirX : (ix - originX) / dirX;
  let nextY =
    dirY === 0 ? Infinity : dirY > 0 ? (iy + 1 - originY) / dirY : (iy - originY) / dirY;

  // Out-of-bounds counts as blocked, so the walk always terminates; the cap is
  // belt-and-braces against a pathological loop, same as hasLineOfSight.
  let steps = Math.ceil(maxTiles) * 2 + 4;
  while (steps-- > 0) {
    let enter: number;
    if (nextX < nextY) {
      enter = nextX;
      ix += stepX;
      nextX += deltaX;
    } else {
      enter = nextY;
      iy += stepY;
      nextY += deltaY;
    }
    // Ran out of reach before entering the next cell.
    if (enter >= maxTiles) return maxTiles;
    if (grid.isBlocked(ix, iy)) {
      // Carry on to where the ray leaves this cell, so the wall tile stays visible.
      return Math.min(nextX < nextY ? nextX : nextY, maxTiles);
    }
  }
  return maxTiles;
}

/**
 * {@link rayDistance} for every direction in `dirs`, written into `out` (which must
 * be at least as long) and returned. Reuse one `out` buffer across frames.
 */
export function sightDistances(
  grid: CollisionGrid,
  originX: number,
  originY: number,
  maxTiles: number,
  dirs: RayDirections,
  out: Float64Array,
): Float64Array {
  const { cos, sin } = dirs;
  for (let i = 0; i < cos.length; i++) {
    out[i] = rayDistance(grid, originX, originY, cos[i], sin[i], maxTiles);
  }
  return out;
}
