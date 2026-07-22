import type { GameLevel } from "../map/types";

/**
 * A boolean grid of blocked tiles for a level, plus helpers used by both player
 * movement and guard line-of-sight. Built from the `walls` layer (and any other
 * layers marked as blocking, e.g. closed doors in later phases).
 */
export class CollisionGrid {
  readonly width: number;
  readonly height: number;
  private readonly blocked: Uint8Array;

  constructor(level: GameLevel, blockingLayers: string[] = ["walls"]) {
    this.width = level.width;
    this.height = level.height;
    this.blocked = new Uint8Array(this.width * this.height);
    for (const layer of level.layers) {
      if (!blockingLayers.includes(layer.name)) continue;
      for (const tile of layer.tiles) {
        if (this.inBounds(tile.x, tile.y)) {
          this.blocked[tile.y * this.width + tile.x] = 1;
        }
      }
    }
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isBlocked(tileX: number, tileY: number): boolean {
    if (!this.inBounds(tileX, tileY)) return true;
    return this.blocked[tileY * this.width + tileX] === 1;
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
        if (this.isBlocked(ix0, iy0)) return false;
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
}
