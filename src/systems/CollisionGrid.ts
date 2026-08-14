import {
  colliderRect,
  footprintCells,
  hasPlainCollider,
  raySlabIntersect,
  raySlabIntersectRaw,
  type Rect,
} from "../map/footprint";
import { isForcedSolid, SEE_THROUGH_BOARDS, type GameLevel } from "../map/types";
import { glassStatsFor, isGlass } from "./EntityStats";

/** {@link CollisionGrid.paddedSlotAt}'s answer for a cell with no padded rect. */
export const NO_PADDED_RECT = -1;

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
  /**
   * Precise solid rects (tile units), for opaque cells whose tile carries
   * authored `ColliderPadding`. See {@link paddedRectAt}.
   *
   * Stored as a slot index per cell into a flat `[x, y, w, h, …]` buffer rather
   * than a `Map<number, Rect>`, because the sight-ray walks now consult this on
   * **every blocked cell they step into**, not just their own — 720 rays deep
   * into a level, that is a hot path, and neither a hash lookup nor a `Rect`
   * object per query belongs in it. Sparse in the sense that most cells hold
   * `NO_PADDED_RECT`, but not rare: 157 of `main1`'s 318 wall tiles are padded.
   */
  private readonly paddedSlot: Int32Array;
  /** Flat `[x, y, w, h]` quads, indexed by {@link paddedSlot} times four. */
  private readonly paddedRects: Float64Array;
  /** How many cells carry a padded rect — zero lets every caller skip the test. */
  readonly paddedCount: number;

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
    // Cells claimed by a *plain*-collider opaque tile — takes precedence over
    // any padded rect recorded for the same cell, same "wins regardless of
    // placement order" reasoning as `opaque` above.
    const plainOpaque = new Uint8Array(this.width * this.height);
    // Collected as a map while building — construction is not hot, and the
    // `plainOpaque` pass below still needs to retract entries — then flattened.
    const padded = new Map<number, Rect>();
    for (const layer of level.layers) {
      const boardBlocks = blockingLayers.includes(layer.name);
      // Some boards are solid without being opaque: you see over a crate and
      // through chain-link. Same channel glazing uses, decided per board.
      const boardSeeThrough = SEE_THROUGH_BOARDS.includes(layer.name);
      for (const tile of layer.tiles) {
        // A tile can be solid on its own say-so even when its board isn't — an
        // author dragging a wall-textured prop onto a decorative board.
        if (!boardBlocks && !isForcedSolid(tile)) continue;
        // Clear glazing is a window: solid, but sight passes. Frosted glazing
        // (`VisionBlock`) is just a wall that happens to be made of glass.
        const components = tile.components ?? [];
        const seeThrough =
          boardSeeThrough || (isGlass(components) && !glassStatsFor(components).visionBlock);
        const plain = hasPlainCollider(tile);
        for (const cell of footprintCells(tile, tileSize)) {
          if (!this.inBounds(cell.x, cell.y)) continue;
          const i = cell.y * this.width + cell.x;
          this.blocked[i] = 1;
          if (seeThrough) this.seeThrough[i] = 1;
          else {
            opaque[i] = 1;
            if (plain) {
              plainOpaque[i] = 1;
            } else {
              const px = colliderRect(tile, tileSize);
              padded.set(i, { x: px.x / tileSize, y: px.y / tileSize, w: px.w / tileSize, h: px.h / tileSize });
            }
          }
        }
      }
    }
    for (let i = 0; i < opaque.length; i++) if (opaque[i] === 1) this.seeThrough[i] = 0;
    for (let i = 0; i < plainOpaque.length; i++) if (plainOpaque[i] === 1) padded.delete(i);

    this.paddedSlot = new Int32Array(this.width * this.height).fill(NO_PADDED_RECT);
    this.paddedRects = new Float64Array(padded.size * 4);
    this.paddedCount = padded.size;
    let slot = 0;
    for (const [cell, rect] of padded) {
      this.paddedSlot[cell] = slot;
      const o = slot * 4;
      this.paddedRects[o] = rect.x;
      this.paddedRects[o + 1] = rect.y;
      this.paddedRects[o + 2] = rect.w;
      this.paddedRects[o + 3] = rect.h;
      slot++;
    }
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
   * The precise solid rectangle (tile units) of a padded, sight-blocking tile
   * occupying this cell — `undefined` for the overwhelming majority of cells,
   * where the coarse whole-cell {@link blocksSight} is already exact.
   *
   * Exists for the one place the coarse grid can't answer correctly: a wall
   * with authored `ColliderPadding` leaves part of its own cell walkable (the
   * physics body is inset — see `footprint.ts`'s `colliderRect`), so a viewer
   * can legitimately stand inside that "opaque" cell. {@link hasLineOfSight}
   * and `Visibility.rayDistance`/`sightDistances` skip testing the ray's own
   * origin/endpoint cell (so debug no-clip embedded in an ordinary wall can
   * still see out) — without this, that skip would also let sight leak
   * straight through the *solid* part of a thin padded wall the viewer is
   * standing against.
   */
  paddedRectAt(tileX: number, tileY: number): Rect | undefined {
    const slot = this.paddedSlotAt(tileX, tileY);
    if (slot === NO_PADDED_RECT) return undefined;
    const o = slot * 4;
    return {
      x: this.paddedRects[o],
      y: this.paddedRects[o + 1],
      w: this.paddedRects[o + 2],
      h: this.paddedRects[o + 3],
    };
  }

  /**
   * This cell's padded-rect slot, or {@link NO_PADDED_RECT}.
   *
   * The allocation-free half of {@link paddedRectAt}, for the ray walks. Paired
   * with {@link paddedEntryAt}: read the slot once to learn *whether* the cell is
   * only partly opaque, then ask where the ray enters that part.
   */
  paddedSlotAt(tileX: number, tileY: number): number {
    if (!this.inBounds(tileX, tileY)) return NO_PADDED_RECT;
    return this.paddedSlot[tileY * this.width + tileX];
  }

  /**
   * Distance along `(dx, dy)` at which the ray from `(ox, oy)` enters the solid
   * rect held in `slot`, or `undefined` when it misses it entirely.
   *
   * `slot` comes from {@link paddedSlotAt}. Everything is in tile units, and
   * `(dx, dy)` need not be normalized — `t` comes back in whatever unit they are.
   */
  paddedEntryAt(
    slot: number,
    ox: number,
    oy: number,
    dx: number,
    dy: number,
  ): number | undefined {
    const o = slot * 4;
    return raySlabIntersectRaw(
      ox,
      oy,
      dx,
      dy,
      this.paddedRects[o],
      this.paddedRects[o + 1],
      this.paddedRects[o + 2],
      this.paddedRects[o + 3],
    );
  }

  /**
   * Line-of-sight test between two tile coordinates using a supercover DDA walk.
   * Returns true if no blocked tile lies strictly between the endpoints.
   */
  hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    let ix0 = Math.floor(x0);
    let iy0 = Math.floor(y0);
    const startIx = ix0;
    const startIy = iy0;
    const ix1 = Math.floor(x1);
    const iy1 = Math.floor(y1);

    // The DDA walk below ignores the two endpoint cells outright (see the loop
    // comment). Test each one's precise collider shape first, so a padded
    // wall's solid portion still blocks a viewer standing in its walkable
    // margin — see `paddedRectAt`.
    const segDx = x1 - x0;
    const segDy = y1 - y0;
    const r0 = this.paddedRectAt(ix0, iy0);
    if (r0) {
      const t = raySlabIntersect(x0, y0, segDx, segDy, r0);
      if (t !== undefined && t <= 1) return false;
    }
    if (ix1 !== ix0 || iy1 !== iy0) {
      const r1 = this.paddedRectAt(ix1, iy1);
      if (r1) {
        const t = raySlabIntersect(x0, y0, segDx, segDy, r1);
        if (t !== undefined && t <= 1) return false;
      }
    }

    const dx = Math.abs(ix1 - ix0);
    const dy = Math.abs(iy1 - iy0);
    const sx = ix0 < ix1 ? 1 : -1;
    const sy = iy0 < iy1 ? 1 : -1;
    let err = dx - dy;

    // Walk from source to target; ignore the two endpoints themselves (their
    // precise shape was already checked above). A blocked cell anywhere in
    // between breaks sight. Safety cap avoids pathological loops.
    let steps = dx + dy + 2;
    while (steps-- > 0) {
      if (ix0 === ix1 && iy0 === iy1) return true;
      if (!(ix0 === startIx && iy0 === startIy)) {
        if (this.blocksSight(ix0, iy0) && this.solidHere(ix0, iy0, x0, y0, segDx, segDy)) {
          return false;
        }
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
   * Whether the segment from `(x0, y0)` along `(segDx, segDy)` actually meets
   * the solid part of an opaque cell it walks through.
   *
   * True for the ordinary whole-cell wall. False only for a cell whose tile is
   * padded and whose solid rect this particular segment misses — the strip of
   * floor a `ColliderPadding: {Bottom: 0.4}` wall leaves in front of its own
   * face. Looking *along* that strip is looking along open floor, and used to
   * read as looking into a wall.
   */
  private solidHere(
    tileX: number,
    tileY: number,
    x0: number,
    y0: number,
    segDx: number,
    segDy: number,
  ): boolean {
    if (this.paddedCount === 0) return true;
    const slot = this.paddedSlotAt(tileX, tileY);
    if (slot === NO_PADDED_RECT) return true;
    const t = this.paddedEntryAt(slot, x0, y0, segDx, segDy);
    return t !== undefined && t <= 1;
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
