import type { CollisionGrid } from "./CollisionGrid";

/**
 * Circle-versus-tile-grid movement for the entities that aren't driven by
 * Arcade physics.
 *
 * The player is a real Arcade body and gets wall collision for free from
 * `physics.add.collider`. Guards, drones and orderlies are plain sprites moved
 * by hand, and they used to test walls by asking whether the tile under their
 * *centre point* was blocked. Two things follow from that, and both were
 * visible in play: a 1.5-tile-wide sentry could bury half of itself in a wall
 * before its centre ever reached one, and a step that clipped a wall was
 * rejected outright — no sliding, so a guard meeting a wall at an angle stopped
 * dead and re-aimed at random instead of running along it.
 *
 * These two functions replace that test everywhere. They are deliberately pure
 * and Phaser-free so they can be unit tested against a bare {@link CollisionGrid}.
 *
 * Everything here works in **tile space** (fractional tile coordinates), which
 * is the space {@link CollisionGrid} and the pathfinder already speak.
 * {@link moveCirclePx} is the pixel-space wrapper for callers holding world
 * coordinates.
 */

/** Result of a {@link moveCircle} step. */
export interface MoveResult {
  x: number;
  y: number;
  /** True when the requested X movement was refused by a wall. */
  blockedX: boolean;
  /** True when the requested Y movement was refused by a wall. */
  blockedY: boolean;
}

/**
 * A cell that is blocked right now but which the mover can *make* passable —
 * in practice, an unlocked closed door a guard is entitled to open. Passing one
 * lets a guard plan a route through its own facility's doors instead of
 * treating every one as a wall.
 */
export type OpenablePredicate = (tileX: number, tileY: number) => boolean;

/**
 * True when a circle of `radiusTiles` centred at the fractional tile position
 * `(tx, ty)` overlaps no blocked cell.
 *
 * Tests {@link CollisionGrid.isBlocked} — the movement predicate — never
 * `blocksSight`, so a closed pane of clear glass stops a guard walking through
 * it even though it can see through it.
 *
 * `openable` is for *planning* only. Actual movement is always resolved against
 * the grid as it stands, so a guard never walks through a door it hasn't opened.
 */
export function circleFits(
  grid: CollisionGrid,
  tx: number,
  ty: number,
  radiusTiles: number,
  openable?: OpenablePredicate,
  plane = 0,
): boolean {
  const minX = Math.floor(tx - radiusTiles);
  const maxX = Math.floor(tx + radiusTiles);
  const minY = Math.floor(ty - radiusTiles);
  const maxY = Math.floor(ty + radiusTiles);

  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      if (!grid.isBlocked(cx, cy, plane)) continue;
      if (openable?.(cx, cy)) continue;
      // Closest point on the tile's unit square to the circle's centre. If that
      // is inside the radius the circle is overlapping the tile. Comparing
      // squared distances keeps this off the square-root path in the hot loop.
      const nearestX = clamp(tx, cx, cx + 1);
      const nearestY = clamp(ty, cy, cy + 1);
      const dx = tx - nearestX;
      const dy = ty - nearestY;
      if (dx * dx + dy * dy < radiusTiles * radiusTiles) return false;
    }
  }
  return true;
}

/**
 * Steps a circular body from `(tx, ty)` by `(dx, dy)`, resolving each axis on
 * its own so a body pushing into a wall at an angle keeps the component of its
 * movement that runs *along* the wall. That is what makes a guard round a
 * corner instead of stalling against it.
 *
 * Both axes are attempted from the already-committed position of the previous
 * one, so a diagonal step into an inside corner correctly yields no movement
 * rather than squeezing through the seam between the two walls.
 */
export function moveCircle(
  grid: CollisionGrid,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
  radiusTiles: number,
  plane = 0,
): MoveResult {
  let x = tx;
  let y = ty;
  let blockedX = false;
  let blockedY = false;

  if (dx !== 0) {
    if (circleFits(grid, x + dx, y, radiusTiles, undefined, plane)) x += dx;
    else blockedX = true;
  }
  if (dy !== 0) {
    if (circleFits(grid, x, y + dy, radiusTiles, undefined, plane)) y += dy;
    else blockedY = true;
  }

  return { x, y, blockedX, blockedY };
}

/**
 * {@link moveCircle} for callers working in pixels — converts in, converts out.
 * `radiusTiles` stays in tiles because that is how {@link GuardSkin} carries it.
 */
export function moveCirclePx(
  grid: CollisionGrid,
  x: number,
  y: number,
  dx: number,
  dy: number,
  radiusTiles: number,
  tileSize: number,
  plane = 0,
): MoveResult {
  const moved = moveCircle(
    grid,
    x / tileSize,
    y / tileSize,
    dx / tileSize,
    dy / tileSize,
    radiusTiles,
    plane,
  );
  return {
    x: moved.x * tileSize,
    y: moved.y * tileSize,
    blockedX: moved.blockedX,
    blockedY: moved.blockedY,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
