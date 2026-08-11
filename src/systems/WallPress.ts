import type { CollisionGrid } from "./CollisionGrid";

/**
 * The geometry behind pressing against a wall and peeking round its corner.
 *
 * Rowan's movement vocabulary used to be walk / run / crouch, and the crouch was
 * a speed-and-noise modifier only. Pressing adds a state where the body is held
 * flush against a solid face and movement runs *along* it — which is also what
 * makes a peek expressible: at the end of a wall run, the input that would carry
 * him off the face becomes a lean past the corner instead.
 *
 * Everything here is pure and works in fractional **tile space**, the space
 * {@link CollisionGrid} and {@link import("./GridMotion")} already speak, so it
 * unit-tests against a bare grid like the rest of `src/systems`. The scene does
 * the pixel conversion and owns the frame; `Player` consumes the plain numbers
 * that come out of {@link resolvePress} and never touches the grid itself.
 *
 * Faces are axis-aligned because the grid is: a surface is one of the four
 * cardinal neighbours of the cell the body stands in, and its normal points
 * *out* of the wall, back toward the player.
 */

/** Half-extents of the pressing body, in tiles. */
export interface BodyExtent {
  halfW: number;
  halfH: number;
}

/** One solid face the body can hold itself against. */
export interface PressSurface {
  /**
   * Unit normal, pointing from the face out toward open space — i.e. toward the
   * player. Axis-aligned, so exactly one of the two is non-zero.
   */
  nx: number;
  ny: number;
  /** The solid cell being pressed. */
  wallX: number;
  wallY: number;
  /**
   * The fractional tile coordinate the body's centre holds on the normal's axis
   * to sit flush against the face — an X when the normal is horizontal, a Y when
   * it is vertical. `Player` pulls toward this rather than snapping, so latching
   * on reads as leaning back into the wall rather than teleporting to it.
   */
  flush: number;
}

/** Which way along a face the body can travel, and what it can see from the end of it. */
export interface PressSide {
  /**
   * True while the wall still backs the body a step further along the face. False
   * means the run ends here — the body stops, and {@link lean} is what the input
   * turns into instead.
   */
  open: boolean;
  /**
   * Offset (tiles) from the body to where the eye reaches when leaning past this
   * end of the wall, or null when the wall continues (nothing to lean past).
   */
  lean: { x: number; y: number } | null;
}

/** Everything `Player` needs to hold a face for one frame. */
export interface PressState {
  surface: PressSurface;
  /** Unit tangent of the face — the axis movement is projected onto. */
  tx: number;
  ty: number;
  /** Travel and peek in the tangent's negative direction. */
  neg: PressSide;
  /** Travel and peek in the tangent's positive direction. */
  pos: PressSide;
}

/** The four cardinal steps, as (dx, dy) into a neighbouring cell. */
const CARDINALS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Small slack added to a probe so it lands *inside* the cell it is testing
 * rather than exactly on the boundary, where the floor could go either way.
 */
const PROBE_MARGIN = 0.05;

/** The face's tangent: the normal turned a quarter turn. */
export function tangentOf(surface: PressSurface): { x: number; y: number } {
  return { x: -surface.ny, y: surface.nx };
}

/** The body's half-extent along an axis-aligned unit vector. */
function extentAlong(body: BodyExtent, ax: number, ay: number): number {
  return ax !== 0 ? body.halfW * Math.abs(ax) : body.halfH * Math.abs(ay);
}

/**
 * The nearest solid face within `reachTiles` of the body, or null when there is
 * nothing to press against.
 *
 * Candidates are the four cardinal neighbours of the body's own cell, tested
 * with {@link CollisionGrid.isBlocked} — the *movement* predicate, never
 * `blocksSight`, for the same reason `GridMotion.circleFits` uses it: a pane of
 * clear glass is something you can put your back against even though you can see
 * through it.
 *
 * Picking between two candidates (an inside corner offers two) scores
 * `facing · into-the-wall − gap`, so the wall Rowan is walking into wins over one
 * he happens to be standing beside, and distance settles it when he faces
 * neither. Both terms are ~0..1 here, which is what lets them be added at all.
 */
export function findSurface(
  grid: CollisionGrid,
  tx: number,
  ty: number,
  body: BodyExtent,
  reachTiles: number,
  facing: number,
): PressSurface | null {
  const cellX = Math.floor(tx);
  const cellY = Math.floor(ty);
  const faceX = Math.cos(facing);
  const faceY = Math.sin(facing);

  let best: PressSurface | null = null;
  let bestScore = -Infinity;

  for (const [dx, dy] of CARDINALS) {
    const wallX = cellX + dx;
    const wallY = cellY + dy;
    if (!grid.isBlocked(wallX, wallY)) continue;

    // Normal points back out of the wall, toward the body. `|| 0` because
    // negating a 0 component yields -0, which compares equal to 0 but prints
    // and serialises differently — not worth letting loose in a public field.
    const nx = -dx || 0;
    const ny = -dy || 0;
    const half = extentAlong(body, nx, ny);
    // Work on whichever axis the normal runs along: the wall cell's coordinate,
    // and the body's centre, both on that one axis.
    const wallOnAxis = dx !== 0 ? wallX : wallY;
    const centre = dx !== 0 ? tx : ty;
    // The face is the wall cell's near edge — its far side (+1) when the body
    // sits on the positive side of it, its own coordinate when the body sits on
    // the negative side — and flush is one body half-extent clear of that.
    const flush = nx + ny > 0 ? wallOnAxis + 1 + half : wallOnAxis - half;
    // How far this body is from being flush. `flush` already carries the
    // half-extent, so this is the gap the press has to close.
    const gap = Math.abs(centre - flush);
    if (gap > reachTiles) continue;

    const score = faceX * dx + faceY * dy - gap;
    if (score > bestScore) {
      bestScore = score;
      best = { nx, ny, wallX, wallY, flush };
    }
  }

  return best;
}

/**
 * `(dx, dy)` projected onto the face's tangent, so pushing diagonally into a wall
 * carries the body along it instead of stalling against it — the same instinct
 * `GridMotion.moveCircle` follows when it resolves a guard's axes separately.
 */
export function slideAlong(
  surface: PressSurface,
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  const t = tangentOf(surface);
  const along = dx * t.x + dy * t.y;
  return { dx: t.x * along, dy: t.y * along };
}

/**
 * True while the pressed wall still backs the body one lookahead further along
 * the tangent in `sign`.
 *
 * The lookahead is a fixed body extent rather than this frame's displacement, so
 * the answer doesn't wobble with the frame delta — a wall run either continues
 * or it doesn't, and the body should stop at the same place at 30fps and 144.
 */
export function backedAhead(
  grid: CollisionGrid,
  surface: PressSurface,
  tx: number,
  ty: number,
  body: BodyExtent,
  sign: number,
): boolean {
  const t = tangentOf(surface);
  const ahead = extentAlong(body, t.x, t.y) + PROBE_MARGIN;
  const behind = extentAlong(body, surface.nx, surface.ny) + PROBE_MARGIN;
  // A point just past the body's leading edge and just inside the wall.
  const px = tx + t.x * sign * ahead - surface.nx * behind;
  const py = ty + t.y * sign * ahead - surface.ny * behind;
  return grid.isBlocked(Math.floor(px), Math.floor(py));
}

/**
 * Where the eye reaches when leaning past the end of a wall in `sign`, or null
 * when the wall continues and there is no corner to lean around.
 *
 * The offset runs along the face *and* sideways onto the wall's own centre line,
 * because clearing the corner is what opens the sightline down its far side —
 * a lean that only ran along the face would stop level with the body and see
 * nothing it couldn't already.
 *
 * That sideways reach is derived rather than tuned, and deliberately so: landing
 * the eye exactly on the wall's centre line puts it in the cell this function
 * has *already* proved open (the one past the end of the run), so the lean can
 * never push the eye inside geometry and no second grid test is needed. A tuned
 * side reach would need one, and would be wrong for any body not flush.
 */
export function cornerLean(
  grid: CollisionGrid,
  surface: PressSurface,
  tx: number,
  ty: number,
  sign: number,
  leanTiles: number,
): { x: number; y: number } | null {
  const t = tangentOf(surface);
  // The wall run ends when the next cell along the face is no longer solid.
  const endX = surface.wallX + t.x * sign;
  const endY = surface.wallY + t.y * sign;
  if (grid.isBlocked(endX, endY)) return null;

  const vertical = surface.nx !== 0;
  const wallCentre = (vertical ? surface.wallX : surface.wallY) + 0.5;
  // Signed, and points into the wall — the body is always flush on the far side.
  const side = wallCentre - (vertical ? tx : ty);
  return {
    x: t.x * sign * leanTiles + (vertical ? side : 0),
    y: t.y * sign * leanTiles + (vertical ? 0 : side),
  };
}

/**
 * One frame's worth of press geometry: the face, its tangent, and what each
 * direction along it offers.
 *
 * The scene calls this and hands the result to `Player`, which keeps every grid
 * query on this side of the seam — the same split `GameScene.readInput` already
 * uses for movement state that is a *consequence* rather than an input.
 */
export function resolvePress(
  grid: CollisionGrid,
  tx: number,
  ty: number,
  body: BodyExtent,
  reachTiles: number,
  facing: number,
  leanTiles: number,
): PressState | null {
  const surface = findSurface(grid, tx, ty, body, reachTiles, facing);
  if (!surface) return null;
  const t = tangentOf(surface);
  const side = (sign: number): PressSide => ({
    open: backedAhead(grid, surface, tx, ty, body, sign),
    lean: cornerLean(grid, surface, tx, ty, sign, leanTiles),
  });
  return { surface, tx: t.x, ty: t.y, neg: side(-1), pos: side(1) };
}
