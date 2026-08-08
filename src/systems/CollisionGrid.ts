import { footprintCells } from "../map/footprint";
import type { GameLevel } from "../map/types";
import { glassStatsFor, isGlass } from "./EntityStats";

/**
 * A growable list of (dx, dy) point pairs, backed by one `Float32Array`.
 *
 * Exists so {@link CollisionGrid.wallsNear} can report a few hundred points per
 * frame without allocating a few hundred objects. Hold one and hand it back in
 * each frame; it keeps whatever capacity it reached, so after the first second
 * of play it stops allocating entirely.
 */
export class WallBuffer {
  /** Flat pairs: `[dx0, dy0, dx1, dy1, …]`. Only the first `2 * count` are live. */
  private data: Float32Array;
  /** Number of *points* held (so `2 * count` live entries in {@link data}). */
  count = 0;

  constructor(capacityPoints = 256) {
    this.data = new Float32Array(capacityPoints * 2);
  }

  /** Drops every point but keeps the capacity. */
  clear(): void {
    this.count = 0;
  }

  push(dx: number, dy: number): void {
    const i = this.count * 2;
    if (i + 2 > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    this.data[i] = dx;
    this.data[i + 1] = dy;
    this.count++;
  }

  /** X offset of point `i` (`i < count`). */
  dx(i: number): number {
    return this.data[i * 2];
  }

  /** Y offset of point `i` (`i < count`). */
  dy(i: number): number {
    return this.data[i * 2 + 1];
  }
}

/**
 * A grid of blocked tiles for a level, plus helpers used by both player movement and
 * line of sight. Built from the `walls` layer (and any other layers marked as
 * blocking, e.g. closed doors in later phases).
 *
 * Movement and sight are tracked separately, because they can disagree: a pane of clear
 * glass stops you walking through but not looking through. Callers should pick the
 * predicate that matches what they are asking — {@link isBlocked} for anything physical
 * (movement, pathing, radar, knocking) and {@link blocksSight} for anything optical
 * (line-of-sight tests, vision cones, the darkness overlay's visibility polygon).
 *
 * Both are read off the tile as it was authored, in one pass: a blocking tile claims
 * every cell of its {@link footprintCells} (a 1×2.5 pane blocks two cells, not the one
 * it is placed on), and a `glass` component on it means those cells stop movement
 * without stopping sight. Glazing used to be a second walk over the layers *after*
 * construction, which could only downgrade cells the first walk had already blocked —
 * so a pane wider than its own cell lost the rest of itself entirely.
 */
export class CollisionGrid {
  readonly width: number;
  readonly height: number;
  /**
   * Bumped whenever a tile's blocked or see-through state actually changes. Lets a cache
   * of derived geometry — the player's visibility polygon in {@link Lighting} — know a
   * door opened even if nothing else about the frame moved.
   */
  revision = 0;
  private readonly blocked: Uint8Array;
  /** Cells that stop movement but not sight — glazing. Only meaningful where blocked. */
  private readonly seeThrough: Uint8Array;

  /** @param tileSize pixels per cell, for reading the tiles' authored footprints. */
  constructor(level: GameLevel, blockingLayers: string[] = ["walls"], tileSize = 32) {
    this.width = level.width;
    this.height = level.height;
    this.blocked = new Uint8Array(this.width * this.height);
    this.seeThrough = new Uint8Array(this.width * this.height);
    // Cells claimed by something that stops sight. Kept apart from `seeThrough`
    // so the result doesn't depend on which of two overlapping tiles is placed
    // first: an opaque tile anywhere over a cell wins, whatever the board order.
    const opaque = new Uint8Array(this.width * this.height);
    for (const layer of level.layers) {
      if (!blockingLayers.includes(layer.name)) continue;
      for (const tile of layer.tiles) {
        // Clear glazing is a window: solid, but sight passes. Frosted glazing
        // (`VisionBlock`) is just a wall that happens to be made of glass.
        const components = tile.components ?? [];
        const seeThrough = isGlass(components) && !glassStatsFor(components).visionBlock;
        for (const cell of footprintCells(tile, tileSize)) {
          if (!this.inBounds(cell.x, cell.y)) continue;
          const i = cell.y * this.width + cell.x;
          this.blocked[i] = 1;
          if (seeThrough) this.seeThrough[i] = 1;
          else opaque[i] = 1;
        }
      }
    }
    for (let i = 0; i < opaque.length; i++) if (opaque[i] === 1) this.seeThrough[i] = 0;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Blocks movement. Out of bounds counts as blocked. */
  isBlocked(tileX: number, tileY: number): boolean {
    if (!this.inBounds(tileX, tileY)) return true;
    return this.blocked[tileY * this.width + tileX] === 1;
  }

  /**
   * Blocks line of sight. Everything that blocks movement also blocks sight *unless* it
   * was registered as see-through. Out of bounds blocks sight, which is also what stops
   * the ray walks in {@link hasLineOfSight} and `Visibility.rayDistance` running away.
   */
  blocksSight(tileX: number, tileY: number): boolean {
    if (!this.inBounds(tileX, tileY)) return true;
    const i = tileY * this.width + tileX;
    return this.blocked[i] === 1 && this.seeThrough[i] === 0;
  }

  /**
   * Marks a tile blocked or clear at runtime — used by doors, which block movement,
   * radar and enforcer pathing while closed and clear all of it the instant they open.
   * Out-of-bounds writes are ignored.
   *
   * @param seeThrough when blocking, let sight through anyway (clear glazing). Ignored
   *   when clearing a cell, since an open cell blocks nothing either way.
   */
  setBlocked(tileX: number, tileY: number, blocked: boolean, seeThrough = false): void {
    if (!this.inBounds(tileX, tileY)) return;
    const i = tileY * this.width + tileX;
    const nextBlocked = blocked ? 1 : 0;
    const nextSee = blocked && seeThrough ? 1 : 0;
    if (this.blocked[i] === nextBlocked && this.seeThrough[i] === nextSee) return;
    this.blocked[i] = nextBlocked;
    this.seeThrough[i] = nextSee;
    this.revision++;
  }

  /**
   * Blocked-tile offsets within a circular radius (in tiles) of a centre point,
   * as (dx, dy) relative to that centre, appended to `out`. Used by the radar
   * to sample nearby terrain without scanning the whole level each frame.
   *
   * Fills a caller-owned {@link WallBuffer} rather than returning a fresh array
   * because this runs every frame: a 10-tile radar radius sweeps 441 cells and
   * can report a few hundred of them, and one `{ dx, dy }` per report at 60fps
   * is a steady stream of short-lived objects for something that is only ever
   * read and thrown away within the frame.
   */
  wallsNear(cx: number, cy: number, radius: number, out: WallBuffer): WallBuffer {
    const r2 = radius * radius;
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + radius));
    for (let y = minY; y <= maxY; y++) {
      const row = y * this.width;
      const dy = y - cy;
      const dy2 = dy * dy;
      for (let x = minX; x <= maxX; x++) {
        if (this.blocked[row + x] !== 1) continue;
        const dx = x - cx;
        if (dx * dx + dy2 > r2) continue;
        out.push(dx, dy);
      }
    }
    return out;
  }

  /**
   * Line-of-sight test between two tile coordinates using a supercover DDA walk.
   * Returns true if no blocked tile lies strictly between the endpoints.
   */
  hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    let ix0 = Math.floor(x0);
    let iy0 = Math.floor(y0);
    const ix1 = Math.floor(x1);
    const iy1 = Math.floor(y1);

    const dx = Math.abs(ix1 - ix0);
    const dy = Math.abs(iy1 - iy0);
    const sx = ix0 < ix1 ? 1 : -1;
    const sy = iy0 < iy1 ? 1 : -1;
    let err = dx - dy;

    // Walk from source to target; ignore the two endpoints themselves.
    // A blocked cell anywhere in between breaks sight.
    // Safety cap avoids pathological loops.
    let steps = dx + dy + 2;
    while (steps-- > 0) {
      if (ix0 === ix1 && iy0 === iy1) return true;
      if (!(ix0 === Math.floor(x0) && iy0 === Math.floor(y0))) {
        if (this.blocksSight(ix0, iy0)) return false;
      }
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        ix0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        iy0 += sy;
      }
    }
    return true;
  }

  /**
   * {@link hasLineOfSight} for callers working in pixel space — divides both
   * endpoints by `tileSize` before delegating. Used by guards checking sight
   * to a noise's pixel origin.
   */
  lineOfSightPx(x0: number, y0: number, x1: number, y1: number, tileSize: number): boolean {
    return this.hasLineOfSight(x0 / tileSize, y0 / tileSize, x1 / tileSize, y1 / tileSize);
  }
}
