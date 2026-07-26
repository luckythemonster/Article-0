/**
 * Turns a level's static tile art into one texture, and its wall grid into a
 * handful of collision rectangles.
 *
 * The scene used to build one `GameObjects.Image` per placed tile and give
 * every wall tile its own static Arcade body. For the shipped map that is:
 *
 *   | level | tile images | wall bodies |
 *   |-------|-------------|-------------|
 *   | main1 |       2,468 |         526 |
 *   | duct1 |       3,227 |       1,427 |
 *   | duct2 |       3,224 |       1,424 |
 *   | main2 |       2,409 |         556 |
 *
 * None of it ever changes. Phaser still walked the whole display list every
 * frame to depth-sort and cull it, and Arcade still carried a body per wall
 * cell. Baking the art into a single RenderTexture and merging the wall cells
 * into maximal rectangles leaves the same picture and the same collision, out
 * of roughly two orders of magnitude fewer objects.
 *
 * The tiles are genuinely static: `EdplayLoader` resolves each one to its first
 * keyframe, and everything that animates or toggles (doors, lasers, terminals,
 * chests) lives in the scene's `ENTITY_LAYERS` and is spawned separately —
 * those layers are skipped here.
 */

import type Phaser from "phaser";
import type { GameLevel } from "./types";

/** An axis-aligned run of blocked cells, in tile coordinates. */
export interface WallRect {
  /** Left/top cell, inclusive. */
  x: number;
  y: number;
  /** Size in cells; always at least 1. */
  w: number;
  h: number;
}

/** True when the cell at (x, y) should collide. */
export type BlockedAt = (x: number, y: number) => boolean;

/**
 * Merges a grid of blocked cells into a small set of non-overlapping
 * rectangles covering exactly the same cells.
 *
 * Greedy in two passes: extend each rectangle as far right as the row allows,
 * then as far down as rows of the identical span allow. That is not the minimal
 * possible decomposition — finding that is a much harder problem, and would buy
 * little here — but it collapses the corridor walls and room perimeters this
 * map is made of by roughly an order of magnitude, which is the whole point.
 *
 * Exactness matters more than tightness: the union of the returned rectangles
 * is the set of blocked cells, no more and no less, so player collision is
 * unchanged rather than approximately unchanged.
 */
export function mergeWallRects(width: number, height: number, blocked: BlockedAt): WallRect[] {
  const rects: WallRect[] = [];
  // Cells already absorbed into a rectangle.
  const taken = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (taken[y * width + x] === 1 || !blocked(x, y)) continue;

      // Widen along this row.
      let w = 1;
      while (x + w < width && taken[y * width + x + w] === 0 && blocked(x + w, y)) w++;

      // Deepen, but only while the whole span below matches.
      let h = 1;
      while (y + h < height) {
        const row = (y + h) * width;
        let spanFree = true;
        for (let i = 0; i < w; i++) {
          if (taken[row + x + i] === 1 || !blocked(x + i, y + h)) {
            spanFree = false;
            break;
          }
        }
        if (!spanFree) break;
        h++;
      }

      for (let dy = 0; dy < h; dy++) {
        const row = (y + dy) * width;
        for (let dx = 0; dx < w; dx++) taken[row + x + dx] = 1;
      }
      rects.push({ x, y, w, h });
    }
  }

  return rects;
}

/**
 * Depth of the baked tile texture.
 *
 * Tile layers used to sit at `layerIndex * 10`, so 0–110 for the shipped map,
 * and the lowest depth anything else uses is 120 (doors, terminals, chests,
 * substations, and the decor drawn out of the doors board). One texture at 0
 * therefore lands exactly where the whole stack used to, and the layer order
 * *within* it is preserved by the order the layers are drawn in.
 */
export const BAKED_TILES_DEPTH = 0;

/**
 * Draws every static tile layer into one level-sized texture and returns it.
 *
 * Layers are drawn in board order, so a wall still covers the floor beneath it.
 * The whole thing goes down in a single batched pass — `beginDraw`/`endDraw`
 * around a few thousand `batchDrawFrame` calls costs one framebuffer round trip
 * rather than one per tile, which matters because this runs on every level
 * load and every level transition.
 *
 * @param skipLayers layer names that hold entities rather than paintable art;
 *   those are spawned as real objects by the scene and must not be baked in.
 */
export function bakeTileLayers(
  scene: Phaser.Scene,
  level: GameLevel,
  tileSize: number,
  skipLayers: ReadonlySet<string>,
): Phaser.GameObjects.RenderTexture {
  const rt = scene.add
    .renderTexture(0, 0, level.width * tileSize, level.height * tileSize)
    .setOrigin(0, 0)
    .setDepth(BAKED_TILES_DEPTH);

  rt.beginDraw();
  for (const layer of level.layers) {
    if (skipLayers.has(layer.name)) continue;
    for (const tile of layer.tiles) {
      if (!tile.frame) continue;
      rt.batchDrawFrame(
        tile.frame.textureKey,
        tile.frame.frameKey,
        tile.x * tileSize,
        tile.y * tileSize,
      );
    }
  }
  rt.endDraw();

  return rt;
}

/**
 * Static collision bodies for a level's walls, merged into as few rectangles as
 * {@link mergeWallRects} can manage.
 *
 * The bodies are {@link Phaser.GameObjects.Zone}s: invisible, no texture, and
 * nothing for the renderer to walk — the art they stand in for is already baked
 * into the tile texture. They are returned so the scene can hand them to a
 * single collider and toggle it for debug no-clip, exactly as before.
 *
 * Only wall tiles that carry a frame are included, which is what the per-tile
 * version did (it attached the body to the image, so a frameless wall never got
 * one). Every wall frame in the shipped map is exactly one tile with no offset
 * or span, so a tile-aligned rectangle is the same body the old code made.
 */
export function buildWallBodies(
  scene: Phaser.Scene,
  level: GameLevel,
  tileSize: number,
): Phaser.GameObjects.GameObject[] {
  const { width, height } = level;
  const solid = new Uint8Array(width * height);
  for (const layer of level.layers) {
    if (layer.name !== "walls") continue;
    for (const tile of layer.tiles) {
      if (!tile.frame) continue;
      if (tile.x < 0 || tile.y < 0 || tile.x >= width || tile.y >= height) continue;
      solid[tile.y * width + tile.x] = 1;
    }
  }

  const rects = mergeWallRects(width, height, (x, y) => solid[y * width + x] === 1);

  return rects.map((r) => {
    const w = r.w * tileSize;
    const h = r.h * tileSize;
    const zone = scene.add.zone(r.x * tileSize + w / 2, r.y * tileSize + h / 2, w, h);
    scene.physics.add.existing(zone, true);
    return zone;
  });
}
