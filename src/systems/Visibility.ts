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
export const SIGHT_RAYS = 720;

/**
 * How far (in tiles) sight carries *past* the face of the wall it stops at, so the
 * near half of the wall you are looking at is lit rather than wearing a black band.
 *
 * Measured along the ray from where it entered the wall — deliberately not "to the
 * far side of the blocking tile", and deliberately not the *whole* tile depth either:
 * for a wall exactly one tile thick (the normal case), a full tile of reveal lands
 * exactly on its far face — the boundary of whatever sits behind it — which reads as
 * seeing through the wall once the shadow edge is softened by the feather blur. Half
 * a tile stops at the wall's mid-depth instead, so the far half stays black no matter
 * how thin the wall is.
 *
 * Also why the reveal is a constant offset rather than "to the exit boundary": which
 * face a ray exits a tile through flips from top to side as the angle sweeps, and
 * that flip is a discontinuity — along a perfectly flat wall it made the shadow
 * boundary sawtooth over a full tile, pitching visible black triangles along every
 * room edge. Offsetting the entry surface by a constant is smooth in the ray angle,
 * so the boundary stays clean; the trade is that a grazing ray reveals even less wall
 * depth than a perpendicular one already does, which reads as the wall fading into
 * the dark rather than a hard edge.
 */
export const WALL_REVEAL_TILES = 0.5;

/** Unit ray directions, split into parallel arrays so casting allocates nothing. */
export interface RayDirections {
  readonly cos: Float64Array;
  readonly sin: Float64Array;
  readonly invCos: Float64Array;
  readonly invSin: Float64Array;
  readonly deltaX: Float64Array;
  readonly deltaY: Float64Array;
  readonly stepX: Int8Array;
  readonly stepY: Int8Array;
  readonly offsetX: Float64Array;
  readonly offsetY: Float64Array;
}

/**
 * Unit directions for `rayCount` evenly-spaced headings over a full turn. Fixed for
 * the life of a level, so build once and hand the same object to every cast.
 */
export function rayDirections(rayCount: number = SIGHT_RAYS): RayDirections {
  const cos = new Float64Array(rayCount);
  const sin = new Float64Array(rayCount);
  const invCos = new Float64Array(rayCount);
  const invSin = new Float64Array(rayCount);
  const deltaX = new Float64Array(rayCount);
  const deltaY = new Float64Array(rayCount);
  const stepX = new Int8Array(rayCount);
  const stepY = new Int8Array(rayCount);
  const offsetX = new Float64Array(rayCount);
  const offsetY = new Float64Array(rayCount);
  for (let i = 0; i < rayCount; i++) {
    const a = (i / rayCount) * Math.PI * 2;
    cos[i] = Math.cos(a);
    sin[i] = Math.sin(a);
    invCos[i] = cos[i] === 0 ? Infinity : 1 / cos[i];
    invSin[i] = sin[i] === 0 ? Infinity : 1 / sin[i];
    deltaX[i] = Math.abs(invCos[i]);
    deltaY[i] = Math.abs(invSin[i]);
    stepX[i] = cos[i] > 0 ? 1 : -1;
    stepY[i] = sin[i] > 0 ? 1 : -1;
    offsetX[i] = cos[i] > 0 ? 1 : 0;
    offsetY[i] = sin[i] > 0 ? 1 : 0;
  }
  return { cos, sin, invCos, invSin, deltaX, deltaY, stepX, stepY, offsetX, offsetY };
}

/**
 * Distance (in tiles) sight reaches from `(originX, originY)` along the unit
 * direction `(dirX, dirY)`, capped at `maxTiles`.
 *
 * An Amanatides–Woo grid walk: step boundary to boundary, stopping at the first
 * blocked cell, then carrying `reveal` further so the wall itself is lit. The
 * origin cell is never tested, so standing inside a wall (debug no-clip) still
 * sees out.
 *
 * @param reveal how far past the blocking face the ray carries, in tiles.
 *   Defaults to {@link WALL_REVEAL_TILES} for the darkness overlay, which wants
 *   the near half of the wall lit. Guard vision cones pass `0`: a cone is a
 *   readout of what the guard can see, and painting it over the wall face reads
 *   as the cone leaking through.
 */
export function rayDistance(
  grid: CollisionGrid,
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  maxTiles: number,
  reveal: number = WALL_REVEAL_TILES,
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
    if (grid.blocksSight(ix, iy)) {
      // Half a tile past the face we just crossed — the wall's mid-depth, never its
      // far face. See WALL_REVEAL_TILES for why that distinction is the whole ballgame.
      return Math.min(enter + reveal, maxTiles);
    }
  }
  return maxTiles;
}

/**
 * {@link rayDistance} for every direction in `dirs`, written into `out` (which must
 * be at least as long) and returned. Reuse one `out` buffer across frames.
 *
 * Optimized version: precomputed ray properties avoid high-frequency divisions,
 * branch lookups, and absolute value calculations per ray cast.
 */
export function sightDistances(
  grid: CollisionGrid,
  originX: number,
  originY: number,
  maxTiles: number,
  dirs: RayDirections,
  out: Float64Array,
  reveal: number = WALL_REVEAL_TILES,
): Float64Array {
  const { cos, sin, invCos, invSin, deltaX, deltaY, stepX, stepY, offsetX, offsetY } = dirs;
  const ix0 = Math.floor(originX);
  const iy0 = Math.floor(originY);
  const stepsCeil = Math.ceil(maxTiles) * 2 + 4;

  for (let i = 0; i < cos.length; i++) {
    let ix = ix0;
    let iy = iy0;

    const sX = stepX[i];
    const sY = stepY[i];
    const dX = deltaX[i];
    const dY = deltaY[i];
    const invC = invCos[i];
    const invS = invSin[i];
    const offX = offsetX[i];
    const offY = offsetY[i];

    let nextX = cos[i] === 0 ? Infinity : (ix + offX - originX) * invC;
    let nextY = sin[i] === 0 ? Infinity : (iy + offY - originY) * invS;

    let steps = stepsCeil;
    let distance = maxTiles;

    while (steps-- > 0) {
      let enter: number;
      if (nextX < nextY) {
        enter = nextX;
        ix += sX;
        nextX += dX;
      } else {
        enter = nextY;
        iy += sY;
        nextY += dY;
      }
      if (enter >= maxTiles) {
        distance = maxTiles;
        break;
      }
      if (grid.blocksSight(ix, iy)) {
        distance = Math.min(enter + reveal, maxTiles);
        break;
      }
    }
    out[i] = distance;
  }
  return out;
}
