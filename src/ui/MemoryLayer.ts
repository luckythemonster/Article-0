import Phaser from "phaser";
import { footprintCells } from "../map/footprint";
import { TileStamper } from "../map/TileBake";
import type { GameLevel, GameTile } from "../map/types";
import type { ExploredMap } from "../systems/Explored";

/**
 * What the player remembers of a level, drawn where he can no longer see it.
 *
 * The darkness in `src/ui/Lighting.ts` is binary: a tile is lit and in line of
 * sight, or it is black. That is right for the *mechanic* — you cannot see a
 * guard through a wall — but it is wrong for the *map*. Walk a corridor, step
 * back out of it, and the corridor you just surveyed is as blank as the wing you
 * have never entered. The pause menu's minimap has known the difference since
 * `ExploredMap` was added; the world has not.
 *
 * So this is the third state: **remembered**. Explored tiles that are currently
 * out of sight are painted back over the darkness as their own art, dimmed to a
 * cold instrument colour and struck through with scanlines, so the room reads as
 * recalled data rather than as somewhere you can still see into.
 *
 * ### Why it draws *over* the darkness rather than lightening it
 *
 * Unlit space is genuinely opaque by design (see `Lighting`'s class comment), so
 * there is nothing to lighten — thinning the darkness would also reveal the lit
 * room behind the wall that the opacity exists to hide. Layering above it keeps
 * that guarantee intact, and it is what makes the information rule enforceable:
 * **only static tile art is ever copied in here.** Every entity in the game
 * lives below the darkness, so a guard patrolling a room you remember stays
 * invisible. What you get back is the geometry you surveyed, never live activity
 * in it.
 *
 * ### Why the content is incremental
 *
 * The remembered set only grows, and it grows a few tiles at a time — the sweep
 * that feeds it runs four times a second. So the texture is built by stamping
 * each newly-seen cell once, through the same {@link TileStamper} that painted
 * the level, and then never touched again. The alternative — recompositing a
 * level-sized texture whenever the mask changes — costs a framebuffer round trip
 * per change to redraw thousands of tiles that were already there.
 */

/**
 * Depth of the remembered-art layer.
 *
 * Above the lighting RenderTexture (700) and the shadow fan (701), below the
 * player (750) and the debug overlay (900). See the depth table in `Lighting`.
 */
export const MEMORY_DEPTH = 702;
/** The scanline overlay, directly above the remembered art. */
export const MEMORY_SCANLINE_DEPTH = 703;

/**
 * How strongly remembered art reads against the darkness.
 *
 * Deliberately low. This has to be legible enough to navigate by and dim enough
 * that it is never mistaken for sight — if a remembered room looks like a lit
 * one, the darkness has stopped being a mechanic.
 */
const MEMORY_ALPHA = 0.34;
/** The cold instrument blue remembered art is tinted toward. */
const MEMORY_TINT = 0x6f8fbf;

/** Scanline pattern: period in px, and how dark the struck rows are. */
const SCANLINE_PERIOD = 4;
const SCANLINE_ALPHA = 0.5;
const SCANLINE_KEY = "memory-scanline";

export class MemoryLayer {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly scanlines: Phaser.GameObjects.TileSprite;
  private readonly stamper: TileStamper;
  /**
   * Which tiles paint which cell, in draw order.
   *
   * Built once from the same layers and skip rules the bake used, because a
   * remembered cell has to be composed of the same stack of tiles the real one
   * is — floor, then whatever sits on it. Keyed `y * width + x`.
   */
  private readonly cellTiles = new Map<number, GameTile[]>();

  constructor(
    scene: Phaser.Scene,
    private readonly level: GameLevel,
    tileSize: number,
    skipLayers: ReadonlySet<string>,
    claimedTiles: ReadonlySet<GameTile>,
  ) {
    const worldW = level.width * tileSize;
    const worldH = level.height * tileSize;
    this.stamper = new TileStamper(scene, tileSize);

    for (const layer of level.layers) {
      if (skipLayers.has(layer.name)) continue;
      for (const tile of layer.tiles) {
        if (!tile.frame || claimedTiles.has(tile)) continue;
        // A tile wider than its own cell is remembered by every cell it covers,
        // so half a glass pane never comes back without the other half.
        for (const cell of footprintCells(tile, tileSize)) {
          if (cell.x < 0 || cell.y < 0 || cell.x >= level.width || cell.y >= level.height) {
            continue;
          }
          const key = cell.y * level.width + cell.x;
          const at = this.cellTiles.get(key);
          if (at) at.push(tile);
          else this.cellTiles.set(key, [tile]);
        }
      }
    }

    this.rt = scene.add
      .renderTexture(0, 0, worldW, worldH)
      .setOrigin(0, 0)
      .setDepth(MEMORY_DEPTH)
      .setTint(MEMORY_TINT)
      .setAlpha(MEMORY_ALPHA);

    MemoryLayer.ensureScanlineTexture(scene);
    this.scanlines = scene.add
      .tileSprite(0, 0, worldW, worldH, SCANLINE_KEY)
      .setOrigin(0, 0)
      .setDepth(MEMORY_SCANLINE_DEPTH)
      .setAlpha(SCANLINE_ALPHA);
  }

  /**
   * Clips both layers to everything *outside* the viewer's line of sight.
   *
   * `fan` is `Lighting`'s shadow geometry, which is already exactly that region
   * — so memory costs no second visibility polygon, and the boundary between
   * "seeing" and "remembering" is by construction the same line. One mask object
   * drives both layers.
   *
   * The fan's `postFX` blur does not apply to a stencil, so this edge is crisp
   * where the darkness's is feathered. At these alphas the difference does not
   * read; if it ever does, the answer is a blur on {@link rt}, not a second fan.
   */
  clipTo(fan: Phaser.GameObjects.Graphics): void {
    // One mask *instance* per object, both off the same geometry. A GeometryMask
    // carries per-render stencil state, so handing the same instance to two
    // objects leaves the second one drawing unmasked.
    this.rt.setMask(fan.createGeometryMask());
    this.scanlines.setMask(fan.createGeometryMask());
  }

  /** Draws every tile already marked seen — a save resumed mid-level. */
  prime(explored: ExploredMap): void {
    const cells: number[] = [];
    for (let y = 0; y < this.level.height; y++) {
      for (let x = 0; x < this.level.width; x++) {
        if (explored.has(x, y)) cells.push(y * this.level.width + x);
      }
    }
    this.draw(cells);
  }

  /**
   * Commits newly-seen cells to memory. `cells` are `y * width + x` keys, which
   * is what the explored sweep already has in hand.
   */
  remember(cells: readonly number[]): void {
    this.draw(cells);
  }

  destroy(): void {
    this.stamper.destroy();
    this.rt.destroy();
    this.scanlines.destroy();
    this.cellTiles.clear();
  }

  private draw(cells: readonly number[]): void {
    if (cells.length === 0) return;
    this.rt.beginDraw();
    for (const cell of cells) {
      const tiles = this.cellTiles.get(cell);
      if (!tiles) continue;
      for (const tile of tiles) this.stamper.stamp(this.rt, tile);
    }
    this.rt.endDraw();
  }

  /**
   * The repeating scanline tile: one dark row every {@link SCANLINE_PERIOD} px.
   *
   * Built here rather than through `ensureStampTexture` because that one filters
   * LINEAR for gradients, and a tiled hard-edged pattern needs NEAREST or it
   * bleeds across its own seams.
   */
  private static ensureScanlineTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(SCANLINE_KEY)) return;
    const tex = scene.textures.createCanvas(SCANLINE_KEY, SCANLINE_PERIOD, SCANLINE_PERIOD);
    if (!tex) return;
    const ctx = tex.getContext();
    const img = ctx.createImageData(SCANLINE_PERIOD, SCANLINE_PERIOD);
    for (let y = 0; y < SCANLINE_PERIOD; y++) {
      for (let x = 0; x < SCANLINE_PERIOD; x++) {
        const i = (y * SCANLINE_PERIOD + x) * 4;
        img.data[i] = 5;
        img.data[i + 1] = 7;
        img.data[i + 2] = 10;
        // One struck row per period; the rest is fully transparent.
        img.data[i + 3] = y === 0 ? 255 : 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
