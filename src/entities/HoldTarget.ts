import type Phaser from "phaser";
import type { GameTile } from "../map/types";
import {
  ensureEntityAnim,
  entitySpriteKey,
  hasEntitySprite,
  type EntitySpriteId,
} from "./EntitySprites";

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
  /**
   * Set instead of {@link image} when hand-drawn art is on disk for this
   * object — see {@link EntitySprites}. Both are Game Objects at the same
   * place, depth and size, so everything below treats them alike; only
   * {@link play} needs the distinction.
   */
  private readonly sprite?: Phaser.GameObjects.Sprite;
  private readonly art?: EntitySpriteId;
  private readonly bar: Phaser.GameObjects.Graphics;

  /**
   * @param duration seconds of unbroken holding to complete. A duration of 0 (or
   *   less) completes on the first frame and draws a full bar rather than
   *   dividing by zero.
   * @param barColor the fill — see {@link HOLD_BAR_CYAN} / {@link HOLD_BAR_AMBER}.
   * @param art the hand-drawn sprite to prefer over the map tile's own frame,
   *   when it is on disk. Absent art is not an error and not a special case:
   *   the tile frame is drawn exactly as before, which is what lets the art be
   *   added one file at a time.
   */
  constructor(
    scene: Phaser.Scene,
    tile: GameTile,
    private readonly tileSize: number,
    private readonly duration: number,
    private readonly barColor: number,
    art?: EntitySpriteId,
  ) {
    this.x = (tile.x + 0.5) * tileSize + tile.offsetX;
    this.y = (tile.y + 0.5) * tileSize + tile.offsetY;

    // Display size comes off the *tile*, not the art, so a drawn sprite lands
    // exactly where the one it replaces did. The map does not agree with itself
    // here — some terminal tile defs are a whole tile and some half of one —
    // which is why `EntitySprites` lists every footprint and the scale test
    // checks them all.
    const width = tile.colSpan * tileSize;
    const height = tile.rowSpan * tileSize;

    if (art !== undefined && hasEntitySprite(scene, art)) {
      this.art = art;
      this.sprite = scene.add
        .sprite(this.x, this.y, entitySpriteKey(art))
        .setDisplaySize(width, height)
        .setDepth(120);
      this.image = this.sprite;
    } else if (tile.frame) {
      this.image = scene.add
        .image(this.x, this.y, tile.frame.textureKey, tile.frame.frameKey)
        .setDisplaySize(width, height)
        .setFlipY(tile.flipY === true)
        .setTint(tile.tint)
        .setDepth(120);
    }
    this.bar = scene.add.graphics().setDepth(1000).setVisible(false);
  }

  /**
   * Whether any hold has accumulated and not yet drained away.
   *
   * What the owners use to tell "being worked on" from "untouched" — a
   * distinction the bar has always drawn and the art now has a clip for.
   */
  get inProgress(): boolean {
    return this.progress > 0;
  }

  /**
   * Plays a named clip from the art, if there is art and it has that clip.
   *
   * Returns whether it took — callers use that to decide whether they still
   * need their tint fallback, so the two paths stay one line apart rather than
   * two branches at every call site.
   */
  play(tag: string, label?: string): boolean {
    if (!this.sprite || this.art === undefined) return false;
    const key = ensureEntityAnim(this.sprite.scene, this.art, tag, label);
    if (key === undefined) return false;
    this.sprite.play(key, true);
    return true;
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

  /**
   * Back to untouched — no progress, no bar, no tint.
   *
   * `state` is the clip that means "untouched" for this object, played when
   * there is art. Without it the tint clears and the tile frame stands as it
   * always did.
   */
  reset(state?: string): void {
    this.progress = 0;
    this.bar.setVisible(false);
    this.image?.clearTint();
    if (state !== undefined) this.play(state);
  }

  /**
   * Done: hide the bar and mark the sprite as finished.
   *
   * Two ways of saying one thing, and the art wins when it is there. A flat
   * tint over a drawn sprite would fight the frame underneath — these sources
   * already carry a finished state, drawn in the same green the tint uses —
   * so `state` is tried first and `color` is the fallback for the tile frame.
   */
  settle(color: number, state?: string): void {
    this.bar.setVisible(false);
    if (state !== undefined && this.play(state)) return;
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
