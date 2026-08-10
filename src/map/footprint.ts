import type { GameTile } from "./types";

/**
 * Which grid cells a placed tile actually occupies.
 *
 * Most tiles are one cell at their own coordinates, but the editor also places
 * tiles that describe a larger footprint via `colSpan`/`rowSpan` and are nudged
 * off the cell centre with `offsetX`/`offsetY` (doors are 1.5 or 2.5 tiles in
 * one axis; the glass panes on `main2`'s `walls` board are 1×2.5). Their art is
 * drawn pre-squished into a single 32px cell and stretched to the footprint at
 * placement time, so the span is the only record of how much room the tile takes.
 *
 * A cell counts as covered when its *centre* falls inside the footprint
 * rectangle, which is what stops a pane that overhangs a neighbour by a few
 * pixels from claiming that neighbour's whole cell.
 *
 * Lives here, next to the map model, rather than on `Door` — the same geometry
 * decides what a static wall tile blocks and how big the tile bake draws it, and
 * neither of those should have to reach into an entity (or pull in Phaser).
 */
export function footprintCells(tile: GameTile, tileSize: number): { x: number; y: number }[] {
  // Levels built by generators and tests can omit the span/offset fields, so
  // default them rather than propagating NaN through the comparisons below.
  const halfW = (tile.colSpan ?? 1) / 2;
  const halfH = (tile.rowSpan ?? 1) / 2;
  const cx = tile.x + 0.5 + (tile.offsetX ?? 0) / tileSize;
  const cy = tile.y + 0.5 + (tile.offsetY ?? 0) / tileSize;
  const cells: { x: number; y: number }[] = [];
  for (let gy = Math.floor(cy - halfH); gy <= Math.ceil(cy + halfH); gy++) {
    for (let gx = Math.floor(cx - halfW); gx <= Math.ceil(cx + halfW); gx++) {
      if (Math.abs(gx + 0.5 - cx) <= halfW && Math.abs(gy + 0.5 - cy) <= halfH) {
        cells.push({ x: gx, y: gy });
      }
    }
  }
  // Always cover at least the placed cell.
  if (cells.length === 0) cells.push({ x: tile.x, y: tile.y });
  return cells;
}

/**
 * True when a tile is a plain one-cell tile sitting square on its own
 * coordinates — the overwhelming majority, and the case both the tile bake and
 * the wall collision can handle without any per-tile geometry.
 */
export function isSingleCell(tile: GameTile): boolean {
  return (
    (tile.colSpan ?? 1) === 1 &&
    (tile.rowSpan ?? 1) === 1 &&
    (tile.offsetX ?? 0) === 0 &&
    (tile.offsetY ?? 0) === 0
  );
}

/**
 * Which way `ColliderPadding` runs — confirmed with the map author as an inset.
 *
 * `{Bottom: 0.4}` reads as "the solid box stops 0.4 of a cell short of the
 * footprint's bottom edge", leaving the lower 40% of the cell walkable — the
 * reading that matches the art, where a wall's collision hugs the drawn face and
 * the floor in front of it is standable.
 *
 * Still a single named switch rather than the arithmetic inlined below: if a
 * future export ever means the opposite for some tile family, this is the one
 * line that changes and every collider in the map follows it.
 */
export const PADDING_DIRECTION: "INSET" | "OUTSET" = "INSET";

/** A rectangle in pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The rectangle a tile actually collides with, in pixels.
 *
 * The footprint rectangle — the same one {@link footprintCells} resolves to cells
 * — adjusted per side by the tile's authored {@link GameTile.collider}. A tile
 * with no collider data returns its footprint unchanged, so this is safe to call
 * for everything and generated levels behave exactly as they always have.
 *
 * Deliberately *not* fed back into `footprintCells`: the grid stays whole-cell.
 * Every padded def in the shipped map keeps every one of its cells under this
 * adjustment (the insets are all ≤0.4, so a cell's centre never leaves the box),
 * so the coarse grid loses nothing by ignoring the padding — and pathfinding,
 * line of sight and guard vision all keep working in whole cells.
 */
export function colliderRect(tile: GameTile, tileSize: number): Rect {
  const w = (tile.colSpan ?? 1) * tileSize;
  const h = (tile.rowSpan ?? 1) * tileSize;
  const centre = footprintCentre(tile, tileSize);
  const x = centre.x - w / 2;
  const y = centre.y - h / 2;

  const pad = tile.collider;
  if (!pad) return { x, y, w, h };

  const sign = PADDING_DIRECTION === "INSET" ? 1 : -1;
  const left = (pad.Left ?? 0) * tileSize * sign;
  const top = (pad.Top ?? 0) * tileSize * sign;
  const right = (pad.Right ?? 0) * tileSize * sign;
  const bottom = (pad.Bottom ?? 0) * tileSize * sign;

  // Guard the degenerate case rather than emitting an inside-out body: padding
  // that eats the whole tile would otherwise produce a negative width, and Arcade
  // treats that as a body you can stand inside.
  const outW = Math.max(1, w - left - right);
  const outH = Math.max(1, h - top - bottom);
  return { x: x + left, y: y + top, w: outW, h: outH };
}

/** True when a tile's collider is exactly its footprint — no authored padding. */
export function hasPlainCollider(tile: GameTile): boolean {
  const pad = tile.collider;
  if (!pad) return true;
  return !pad.Left && !pad.Top && !pad.Right && !pad.Bottom;
}

/**
 * Smallest `t >= 0` such that `(ox, oy) + t * (dx, dy)` lands inside `rect`, or
 * `undefined` if the ray never enters it (for `t >= 0`).
 *
 * Standard slab method. `(dx, dy)` need not be normalized — `t` comes out in
 * whatever unit `dx`/`dy` already are, since `origin`/`rect` share that unit
 * with them. Exists so the sight-ray walks in {@link CollisionGrid} and
 * {@link Visibility} can test a padded tile's *precise* collider box, not just
 * "is this whole cell opaque" — see {@link CollisionGrid.paddedRectAt}.
 */
export function raySlabIntersect(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  rect: Rect,
): number | undefined {
  let tMin = 0;
  let tMax = Infinity;
  const axes: [number, number, number, number][] = [
    [ox, dx, rect.x, rect.w],
    [oy, dy, rect.y, rect.h],
  ];
  for (const [o, d, lo, len] of axes) {
    if (d === 0) {
      if (o < lo || o > lo + len) return undefined;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (lo + len - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return undefined;
  }
  return tMax < 0 ? undefined : tMin;
}

/** Centre of a tile's footprint rectangle, in pixels. */
export function footprintCentre(
  tile: GameTile,
  tileSize: number,
): { x: number; y: number } {
  return {
    x: (tile.x + 0.5) * tileSize + (tile.offsetX ?? 0),
    y: (tile.y + 0.5) * tileSize + (tile.offsetY ?? 0),
  };
}
