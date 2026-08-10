import { raySlabIntersect } from "../map/footprint";
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
  readonly invCos?: Float64Array;
  readonly invSin?: Float64Array;
  readonly deltaX?: Float64Array;
  readonly deltaY?: Float64Array;
  readonly stepX?: Float64Array;
  readonly stepY?: Float64Array;
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
  const stepX = new Float64Array(rayCount);
  const stepY = new Float64Array(rayCount);

  for (let i = 0; i < rayCount; i++) {
    const a = (i / rayCount) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    cos[i] = c;
    sin[i] = s;
    invCos[i] = c === 0 ? Infinity : 1 / c;
    invSin[i] = s === 0 ? Infinity : 1 / s;
    deltaX[i] = c === 0 ? Infinity : Math.abs(1 / c);
    deltaY[i] = s === 0 ? Infinity : Math.abs(1 / s);
    stepX[i] = c > 0 ? 1 : -1;
    stepY[i] = s > 0 ? 1 : -1;
  }
  return { cos, sin, invCos, invSin, deltaX, deltaY, stepX, stepY };
}

/**
 * Distance (in tiles) sight reaches from `(originX, originY)` along the unit
 * direction `(dirX, dirY)`, capped at `maxTiles`.
 *
 * An Amanatides–Woo grid walk: step boundary to boundary, stopping at the first
 * blocked cell, then carrying `reveal` further so the wall itself is lit. The
 * origin cell's coarse "blocked" bit is never tested, so standing inside a
 * wall (debug no-clip) still sees out — but if the origin cell holds a *padded*
 * wall (see {@link CollisionGrid.paddedRectAt}), its precise collider shape is
 * checked instead, so a viewer standing in that wall's walkable margin doesn't
 * get free sight through its solid portion.
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

  const originPadded = grid.paddedRectAt(ix, iy);
  if (originPadded) {
    const t = raySlabIntersect(originX, originY, dirX, dirY, originPadded);
    if (t !== undefined && t < maxTiles) return Math.min(t + reveal, maxTiles);
  }

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
 */
export function sightDistances(
  grid: CollisionGrid,
  originX: number,
  originY: number,
  maxTiles: number,
  dirs: RayDirections,
  out: Float64Array,
): Float64Array {
  const { cos, sin, invCos, invSin, deltaX, deltaY, stepX, stepY } = dirs;
  if (invCos && invSin && deltaX && deltaY && stepX && stepY) {
    const maxStepsBase = Math.ceil(maxTiles) * 2 + 4;
    // Optimization: Precalculate origin tiles and constant sub-expressions outside the hot loop
    // to avoid 1,440 redundant floating-point additions/subtractions and 1,440 Math.floor calls per call.
    const originIx = Math.floor(originX);
    const originIy = Math.floor(originY);
    const dx1 = originIx + 1 - originX;
    const dx0 = originIx - originX;
    const dy1 = originIy + 1 - originY;
    const dy0 = originIy - originY;
    // Same origin for every ray this call, so resolved once — see
    // `rayDistance`'s doc comment for why a padded origin cell needs its
    // precise shape checked instead of the coarse walk's blanket skip.
    const originPadded = grid.paddedRectAt(originIx, originIy);

    for (let i = 0; i < cos.length; i++) {
      const c = cos[i];
      const s = sin[i];

      if (originPadded) {
        const t = raySlabIntersect(originX, originY, c, s, originPadded);
        if (t !== undefined && t < maxTiles) {
          out[i] = Math.min(t + WALL_REVEAL_TILES, maxTiles);
          continue;
        }
      }

      const sX = stepX[i];
      const sY = stepY[i];
      const dX = deltaX[i];
      const dY = deltaY[i];
      const invC = invCos[i];
      const invS = invSin[i];

      let ix = originIx;
      let iy = originIy;

      let nextX =
        c === 0 ? Infinity : c > 0 ? dx1 * invC : dx0 * invC;
      let nextY =
        s === 0 ? Infinity : s > 0 ? dy1 * invS : dy0 * invS;

      let steps = maxStepsBase;
      let dist = maxTiles;

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
          dist = maxTiles;
          break;
        }
        if (grid.blocksSight(ix, iy)) {
          const val = enter + WALL_REVEAL_TILES;
          dist = val < maxTiles ? val : maxTiles;
          break;
        }
      }
      out[i] = dist;
    }
  } else {
    for (let i = 0; i < cos.length; i++) {
      out[i] = rayDistance(grid, originX, originY, cos[i], sin[i], maxTiles);
    }
  }
  return out;
}
