import type { CollisionGrid } from "./CollisionGrid";
import { circleFits, type OpenablePredicate } from "./GridMotion";

/**
 * Grid pathfinding for the guards.
 *
 * Guards used to navigate by pointing themselves at wherever they wanted to be
 * and walking forward, which works until a wall is in the way — a patrol was a
 * random bounce, and a pursuit wedged itself on the first corner between the
 * guard and the player's last known tile. The map makes that unworkable rather
 * than merely ugly: `main1`'s patrol route runs from the row-30 corridor to the
 * south hall, and the only ways between them are the doors at (4,33) and
 * (32,33), so a guard that can't route around geometry can't walk its own beat.
 *
 * Pure and Phaser-free, over the same {@link CollisionGrid} the player's
 * collision and every line-of-sight test already use, so a door opening changes
 * what guards can walk through for free.
 */

/** A tile coordinate. */
export interface PathNode {
  x: number;
  y: number;
}

export interface PathOptions {
  /**
   * Radius (tiles) of the body that has to fit. A tile is only walkable when a
   * circle this size centred on it clears every wall, which is what keeps a
   * guard from planning a route through a gap it is too wide to enter.
   */
  radiusTiles?: number;
  /**
   * Ceiling on expanded nodes before the search gives up and returns `null`.
   * A guard asked for an unreachable goal would otherwise flood-fill the whole
   * level on the frame it asks, so this is a frame-time guarantee, not a
   * quality knob.
   */
  maxNodes?: number;
  /**
   * Cells the mover can open rather than go around — a guard's own unlocked
   * doors. Routing through one costs {@link DOOR_STEP_COST} extra, so a guard
   * takes an open corridor over a shut door whenever one exists, and only works
   * a door when it's genuinely the way through.
   */
  openable?: OpenablePredicate;
}

const DEFAULT_RADIUS_TILES = 0.4;
const DEFAULT_MAX_NODES = 4000;
/** Extra g-cost, in tiles, for a step that has to open a door first. */
const DOOR_STEP_COST = 3;

const SQRT2 = Math.SQRT2;

/** The 8 neighbour offsets, orthogonals first so ties favour straight steps. */
const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * True when a body of `radiusTiles` can stand on the centre of tile
 * `(tx, ty)`.
 */
export function tilePassable(
  grid: CollisionGrid,
  tx: number,
  ty: number,
  radiusTiles: number = DEFAULT_RADIUS_TILES,
  openable?: OpenablePredicate,
): boolean {
  if (!grid.inBounds(tx, ty)) return false;
  return circleFits(grid, tx + 0.5, ty + 0.5, radiusTiles, openable);
}

/**
 * A* from `start` to `goal` in tile coordinates.
 *
 * 8-connected with an octile heuristic, which is the exact cost of the cheapest
 * unobstructed 8-connected path and therefore admissible — the result is a true
 * shortest path, not an approximation.
 *
 * Diagonal steps require **both** flanking orthogonals to be passable. Without
 * that a guard cuts the corner of a wall, which looks like clipping and, with a
 * body of real width, is: the diagonal seam between two solid tiles is zero
 * units wide.
 *
 * Returns the full tile path including both endpoints, or `null` when the goal
 * is unreachable or the node budget runs out. Callers are expected to handle
 * `null` by picking a different goal rather than by walking blindly at it.
 */
export function findPath(
  grid: CollisionGrid,
  start: PathNode,
  goal: PathNode,
  opts: PathOptions = {},
): PathNode[] | null {
  const radius = opts.radiusTiles ?? DEFAULT_RADIUS_TILES;
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
  const openable = opts.openable;
  const passable = (x: number, y: number): boolean =>
    tilePassable(grid, x, y, radius, openable);

  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  const gx = Math.floor(goal.x);
  const gy = Math.floor(goal.y);

  if (!passable(gx, gy)) return null;
  if (sx === gx && sy === gy) return [{ x: sx, y: sy }];
  // The start tile is deliberately *not* required to be passable: a guard can
  // be nudged into a tight spot by a door closing on it, and refusing to path
  // is the one response that leaves it stuck there forever.

  const w = grid.width;
  const index = (x: number, y: number): number => y * w + x;

  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new BinaryHeap();

  const startIdx = index(sx, sy);
  gScore.set(startIdx, 0);
  open.push(startIdx, octile(sx, sy, gx, gy));

  let expanded = 0;
  while (open.size > 0) {
    const current = open.pop()!;
    if (closed.has(current)) continue;
    closed.add(current);

    const cx = current % w;
    const cy = (current - cx) / w;
    if (cx === gx && cy === gy) return reconstruct(cameFrom, current, w);

    if (++expanded > maxNodes) return null;

    const cg = gScore.get(current)!;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!passable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        // No corner cutting: both orthogonal neighbours must be open too.
        if (!passable(cx + dx, cy)) continue;
        if (!passable(cx, cy + dy)) continue;
      }
      const nIdx = index(nx, ny);
      if (closed.has(nIdx)) continue;
      const doorToll = grid.isBlocked(nx, ny) ? DOOR_STEP_COST : 0;
      const tentative = cg + (dx !== 0 && dy !== 0 ? SQRT2 : 1) + doorToll;
      const known = gScore.get(nIdx);
      if (known !== undefined && tentative >= known) continue;
      gScore.set(nIdx, tentative);
      cameFrom.set(nIdx, current);
      open.push(nIdx, tentative + octile(nx, ny, gx, gy));
    }
  }
  return null;
}

/**
 * String-pulls a tile path down to the few corners that actually matter, so a
 * guard walks a diagonal line across an open room instead of stair-stepping
 * along the grid.
 *
 * The corridor test is a swept circle rather than {@link CollisionGrid.hasLineOfSight},
 * which is a zero-width ray: a ray can thread a gap that the body it belongs to
 * cannot, so smoothing on sight alone would quietly hand a wide guard a
 * shortcut through a wall corner and undo the no-corner-cutting rule above.
 */
export function smoothPath(
  grid: CollisionGrid,
  path: PathNode[],
  radiusTiles: number = DEFAULT_RADIUS_TILES,
  openable?: OpenablePredicate,
): PathNode[] {
  if (path.length <= 2) return path.slice();

  const out: PathNode[] = [path[0]];
  let anchor = 0;
  while (anchor < path.length - 1) {
    // Reach as far along the path as the body can travel in a straight line.
    let furthest = anchor + 1;
    for (let probe = path.length - 1; probe > anchor + 1; probe--) {
      if (clearCorridor(grid, path[anchor], path[probe], radiusTiles, openable)) {
        furthest = probe;
        break;
      }
    }
    out.push(path[furthest]);
    anchor = furthest;
  }
  return out;
}

/**
 * True when a circle of `radiusTiles` can sweep from tile `a` to tile `b`
 * (centre to centre) without touching a wall. Sampled at half-radius steps,
 * which is fine enough that the circle's own footprint covers the gaps between
 * samples.
 */
export function clearCorridor(
  grid: CollisionGrid,
  a: PathNode,
  b: PathNode,
  radiusTiles: number = DEFAULT_RADIUS_TILES,
  openable?: OpenablePredicate,
): boolean {
  const ax = a.x + 0.5;
  const ay = a.y + 0.5;
  const bx = b.x + 0.5;
  const by = b.y + 0.5;
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(dist / Math.max(0.05, radiusTiles * 0.5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!circleFits(grid, ax + (bx - ax) * t, ay + (by - ay) * t, radiusTiles, openable)) {
      return false;
    }
  }
  return true;
}

/** Octile distance — the exact cost of an unobstructed 8-connected path. */
function octile(x0: number, y0: number, x1: number, y1: number): number {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
}

function reconstruct(cameFrom: Map<number, number>, end: number, w: number): PathNode[] {
  const out: PathNode[] = [];
  let node: number | undefined = end;
  while (node !== undefined) {
    const x = node % w;
    out.push({ x, y: (node - x) / w });
    node = cameFrom.get(node);
  }
  return out.reverse();
}

/**
 * Minimal binary min-heap over (node, priority) pairs.
 *
 * Lazily deleted: a node improved after it was queued is pushed again rather
 * than sifted in place, and the stale copy is skipped when it pops against the
 * closed set. That costs a little memory and buys a much smaller heap.
 */
class BinaryHeap {
  private readonly nodes: number[] = [];
  private readonly costs: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, cost: number): void {
    this.nodes.push(node);
    this.costs.push(cost);
    let i = this.nodes.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.costs[parent] <= this.costs[i]) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  pop(): number | undefined {
    if (this.nodes.length === 0) return undefined;
    const top = this.nodes[0];
    const lastNode = this.nodes.pop()!;
    const lastCost = this.costs.pop()!;
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.costs[0] = lastCost;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.costs.length && this.costs[l] < this.costs[smallest]) smallest = l;
        if (r < this.costs.length && this.costs[r] < this.costs[smallest]) smallest = r;
        if (smallest === i) break;
        this.swap(smallest, i);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.nodes[a], this.nodes[b]] = [this.nodes[b], this.nodes[a]];
    [this.costs[a], this.costs[b]] = [this.costs[b], this.costs[a]];
  }
}
