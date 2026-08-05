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
