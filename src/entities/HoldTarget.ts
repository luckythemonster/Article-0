import type Phaser from "phaser";
import type { GameTile } from "../map/types";

/**
 * The hold-to-interact fixture shared by every "stand next to it and hold E"
 * object: a {@link Terminal} to hack, a {@link Chest} to search, a
 * {@link PressureSubStation} to patch.
 *
 * All three are the same machine underneath — a sprite anchored to its map
 * tile, a progress bar floating above it, a timer that fills while the key is
 * held and decays when it isn't — and all three used to carry their own copy of
 * it, down to an identical `drawBar` differing only in fill colour. What
 * actually differs between them is what *finishing* means, and that stays in the
 * three classes where it belongs.
 *
 * Composed, not inherited: a chest that re-arms when the player's pockets are
 * full and a substation the boss can lock have nothing to say to each other,
 * and a base class would have forced them to.
 */

/** Bar geometry, in px (height) and fractions of a tile (the rest). */
const BAR_WIDTH_TILES = 0.9;
const BAR_HEIGHT_PX = 5;
const BAR_RISE_TILES = 0.8;
const BAR_BACKING = 0x0a0f16;

/** How much faster than real time an un-held bar drains back to empty. */
const DECAY_RATE = 1.5;

/** The cyan of a machine being worked — terminals, substations. */
export const HOLD_BAR_CYAN = 0x39d3ff;
/** The amber of a container being emptied — chests. */
export const HOLD_BAR_AMBER = 0xffd27a;

export class HoldTarget {
  /** Pixel centre: the tile's cell centre plus its authored placement offset. */
  readonly x: number;
  readonly y: number;

  /** Seconds accumulated toward {@link duration}. */
  private progress = 0;
  private readonly image?: Phaser.GameObjects.Image;
  private readonly bar: Phaser.GameObjects.Graphics;

  /**
   * @param duration seconds of unbroken holding to complete. A duration of 0 (or
   *   less) completes on the first frame and draws a full bar rather than
   *   dividing by zero.
   * @param barColor the fill — see {@link HOLD_BAR_CYAN} / {@link HOLD_BAR_AMBER}.
   */
  constructor(
    scene: Phaser.Scene,
    tile: GameTile,
    private readonly tileSize: number,
    private readonly duration: number,
    private readonly barColor: number,
  ) {
    this.x = (tile.x + 0.5) * tileSize + tile.offsetX;
    this.y = (tile.y + 0.5) * tileSize + tile.offsetY;

    if (tile.frame) {
      this.image = scene.add
        .image(this.x, this.y, tile.frame.textureKey, tile.frame.frameKey)
        .setDisplaySize(tile.colSpan * tileSize, tile.rowSpan * tileSize)
        .setDepth(120);
    }
    this.bar = scene.add.graphics().setDepth(1000).setVisible(false);
  }

  /**
   * Advances the hold by one frame and draws the bar. Returns true on the exact
   * frame the timer fills, so the caller fires its effect once.
   */
  advance(dt: number): boolean {
    this.progress = Math.min(this.duration, this.progress + dt);
    this.drawBar(true);
    return this.progress >= this.duration;
  }

  /** The player let go this frame: drain partial progress and fade the bar out. */
  decay(dt: number): void {
    if (this.progress <= 0) return;
    this.progress = Math.max(0, this.progress - dt * DECAY_RATE);
    this.drawBar(this.progress > 0);
  }

  /** Back to untouched — no progress, no bar, no tint. */
  reset(): void {
    this.progress = 0;
    this.bar.setVisible(false);
    this.image?.clearTint();
  }

  /** Done: hide the bar and mark the sprite with `color`. */
  settle(color: number): void {
    this.bar.setVisible(false);
    this.image?.setTint(color);
  }

  /** Recolours the sprite without touching progress (a substation being locked). */
  setTint(color: number): void {
    this.image?.setTint(color);
  }

  clearTint(): void {
    this.image?.clearTint();
  }

  private drawBar(visible: boolean): void {
    this.bar.setVisible(visible);
    if (!visible) return;
    const w = this.tileSize * BAR_WIDTH_TILES;
    const x = this.x - w / 2;
    const y = this.y - this.tileSize * BAR_RISE_TILES;
    const frac = this.duration > 0 ? this.progress / this.duration : 1;
    this.bar.clear();
    this.bar.fillStyle(BAR_BACKING, 0.85);
    this.bar.fillRect(x - 1, y - 1, w + 2, BAR_HEIGHT_PX + 2);
    this.bar.fillStyle(this.barColor, 1);
    this.bar.fillRect(x, y, w * frac, BAR_HEIGHT_PX);
  }
}
