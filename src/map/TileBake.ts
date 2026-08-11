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
import {
  colliderRect,
  footprintCells,
  footprintCentre,
  hasPlainCollider,
  isSingleCell,
  type Rect,
} from "./footprint";
import { blockingLayerNames, isCrawlable, isForcedSolid, type GameLevel } from "./types";

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

  // Tiles that span more than their own cell (or sit off its centre) are drawn
  // through this instead of `batchDrawFrame`, which takes a position but no
  // size. Their art is authored pre-squished into one 32px cell and is meant to
  // be stretched over the footprint — the same thing `Door` does for the door
  // tiles, and what the `main2` glass panes need to read as glass at all. One
  // reusable off-list image rather than one per tile: the same trick
  // `Cover.destroy` uses to stamp against this texture.
  let scaled: Phaser.GameObjects.Image | undefined;

  rt.beginDraw();
  for (const layer of level.layers) {
    if (skipLayers.has(layer.name)) continue;
    for (const tile of layer.tiles) {
      if (!tile.frame) continue;
      if (isSingleCell(tile)) {
        rt.batchDrawFrame(
          tile.frame.textureKey,
          tile.frame.frameKey,
          tile.x * tileSize,
          tile.y * tileSize,
        );
        continue;
      }
      const centre = footprintCentre(tile, tileSize);
      scaled ??= scene.make.image({ key: tile.frame.textureKey, add: false }).setOrigin(0.5);
      scaled
        .setTexture(tile.frame.textureKey, tile.frame.frameKey)
        .setDisplaySize(tile.colSpan * tileSize, tile.rowSpan * tileSize)
        .setPosition(centre.x, centre.y);
      rt.batchDraw(scaled);
    }
  }
  rt.endDraw();
  scaled?.destroy();

  return rt;
}

/**
 * The cells a level's `walls` board actually fills, as a `width * height` mask.
 *
 * Split out of {@link buildWallBodies} so the geometry can be tested without a
 * Phaser scene. Wall tiles are nearly all one cell, but the board can also carry
 * a tile with a real footprint — `main2` glazes two passage jambs with 1×2.5
 * panes — and those have to claim every cell they cover or the player walks
 * through the half of the pane that has no body under it.
 *
 * Only wall tiles that carry a frame are included, which is what the per-tile
 * version did (it attached the body to the image, so a frameless wall never got
 * one).
 *
 * @param includeLayer which solid boards to count. Defaults to all of them, which
 *   is the honest answer to "what does this level block" and what the map tests
 *   assert against. {@link wallBodyRects} narrows it to split the crouch-passable
 *   boards into their own body group — see {@link isCrawlable}.
 */
export function wallCells(
  level: GameLevel,
  tileSize: number,
  includeLayer: (name: string) => boolean = () => true,
): Uint8Array {
  const { width, height } = level;
  const solid = new Uint8Array(width * height);
  const blocking = blockingLayerNames(level);
  for (const layer of level.layers) {
    if (!includeLayer(layer.name)) continue;
    const boardBlocks = blocking.includes(layer.name);
    for (const tile of layer.tiles) {
      if (!tile.frame) continue;
      // Solid by the board's say-so, or by the tile's own override — see
      // `isForcedSolid`.
      if (!boardBlocks && !isForcedSolid(tile)) continue;
      // Tiles with authored collider bounds get their own precise body instead
      // of a cell in the merge mask — see `buildWallBodies`.
      if (!hasPlainCollider(tile)) continue;
      for (const cell of footprintCells(tile, tileSize)) {
        // `>= 0` and `< width` both pass for NaN, so a tile with a non-finite
        // coordinate used to reach the write and land on `solid[NaN]` — a silent
        // no-op that cost the level its border collision. Test the index itself.
        const i = cell.y * width + cell.x;
        if (!Number.isInteger(i) || i < 0 || i >= solid.length) continue;
        if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue;
        solid[i] = 1;
      }
    }
  }
  return solid;
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
 * The cells come from {@link wallCells}, so a wall tile with a footprint bigger
 * than its own cell gets a body under all of it.
 *
 * `coverBodies` is tagged per tile rather than a bare list, so a single
 * destroyed cover tile (`Cover.destroy`) can find and disable *its own* body
 * without touching a neighbour's — see {@link CoverBody}.
 */
export function buildWallBodies(
  scene: Phaser.Scene,
  level: GameLevel,
  tileSize: number,
): { wallBodies: Phaser.GameObjects.GameObject[]; coverBodies: CoverBody[] } {
  const toZone = (r: Rect): Phaser.GameObjects.GameObject => {
    const zone = scene.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
    scene.physics.add.existing(zone, true);
    return zone;
  };
  const rects = wallBodyRects(level, tileSize);
  return {
    wallBodies: rects.walls.map(toZone),
    coverBodies: rects.crawlable.map((r) => ({ tileX: r.tileX, tileY: r.tileY, body: toZone(r) })),
  };
}

/** One crawlable tile's rectangle, tagged with the cell it belongs to. */
export interface TileRect extends Rect {
  tileX: number;
  tileY: number;
}

/** A crawlable tile's built body, tagged the same way — {@link buildWallBodies}'s output. */
export interface CoverBody {
  tileX: number;
  tileY: number;
  body: Phaser.GameObjects.GameObject;
}

/**
 * A level's collision rectangles, split by who they stop.
 *
 * `walls` stop everyone. `crawlable` stop a standing player and nobody else —
 * the scene switches their collider off while Rowan is crouched, which is the
 * squeeze. They are kept apart here, rather than filtered at the scene, because
 * the merge below works in whole cells: cover merged into a wall run could not
 * afterwards be told back apart.
 */
export interface LevelBodyRects {
  walls: Rect[];
  crawlable: TileRect[];
}

/**
 * Every collision rectangle a level needs, in pixels.
 *
 * Split out of {@link buildWallBodies} for the same reason {@link wallCells} was:
 * this is the geometry, and it should be testable without standing up a Phaser
 * scene.
 *
 * The two groups are built differently on purpose. `walls` merges whole cells
 * with no authored bounds into maximal rectangles ({@link mergeWallRects}, most
 * of a level and where the merge win lives) and gives tiles carrying authored
 * `ColliderPadding` a rectangle of exactly their own shape, since those can't
 * join a whole-cell merge.
 *
 * `crawlable` never merges, even for a plain unpadded tile: it is always one
 * rectangle per solid tile on a crawlable board, via {@link colliderRect} (which
 * already returns the tile's full footprint when there is no padding, so this is
 * uniform for both). That costs nothing today — in the shipped map every cover
 * tile carries a `ColliderPadding`, so the merge pass would have found nothing
 * anyway — but it is what makes a single destroyed cover tile's body
 * findable and disable-able on its own, rather than bundled into a run with
 * whatever happened to sit next to it.
 */
export function wallBodyRects(level: GameLevel, tileSize: number): LevelBodyRects {
  const { width, height } = level;
  const blocking = blockingLayerNames(level);

  const solid = wallCells(level, tileSize, (name) => !isCrawlable(name));
  const walls: Rect[] = mergeWallRects(width, height, (x, y) => solid[y * width + x] === 1).map(
    (r) => ({
      x: r.x * tileSize,
      y: r.y * tileSize,
      w: r.w * tileSize,
      h: r.h * tileSize,
    }),
  );
  for (const layer of level.layers) {
    if (isCrawlable(layer.name)) continue;
    const boardBlocks = blocking.includes(layer.name);
    for (const tile of layer.tiles) {
      if (!tile.frame || hasPlainCollider(tile)) continue;
      if (!boardBlocks && !isForcedSolid(tile)) continue;
      const r = colliderRect(tile, tileSize);
      if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
      walls.push(r);
    }
  }

  const crawlable: TileRect[] = [];
  for (const layer of level.layers) {
    if (!isCrawlable(layer.name)) continue;
    const boardBlocks = blocking.includes(layer.name);
    for (const tile of layer.tiles) {
      if (!tile.frame) continue;
      if (!boardBlocks && !isForcedSolid(tile)) continue;
      const r = colliderRect(tile, tileSize);
      if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
      crawlable.push({ ...r, tileX: tile.x, tileY: tile.y });
    }
  }

  return { walls, crawlable };
}
