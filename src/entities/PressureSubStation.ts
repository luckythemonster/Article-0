import Phaser from "phaser";
import type { GameTile } from "../map/types";
import { VENT4_DEFAULTS, type Vent4Stats } from "../systems/EntityStats";

/**
 * A pressure relief terminal on the VENT-4 arena perimeter. Hold the interact
 * key while adjacent to patch it (Terminal's hold-to-progress contract:
 * `patch` returns true exactly on the completion frame, `idle` decays partial
 * progress). The machine "locks" the last un-patched station until its purge
 * phase — shown as an amber tint and a resisting prompt.
 *
 * Renders its own sprite from the arena tile's frame (the `substations` board
 * is in GameScene's ENTITY_LAYERS so the static renderer skips it).
 */
export class PressureSubStation {
  readonly index: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly x: number;
  readonly y: number;

  private patched = false;
  private locked = false;
  private progress = 0; // seconds accumulated
  private readonly image?: Phaser.GameObjects.Image;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly tileSize: number;

  constructor(
    scene: Phaser.Scene,
    tile: GameTile,
    tileSize: number,
    index: number,
    private readonly stats: Vent4Stats = VENT4_DEFAULTS,
  ) {
    this.index = index;
    this.tileX = tile.x;
    this.tileY = tile.y;
    this.tileSize = tileSize;
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

  get isPatched(): boolean {
    return this.patched;
  }

  get isLocked(): boolean {
    return this.locked;
  }

  /**
   * Advances the patch while the player holds interact. Returns true on the
   * exact frame it completes (so the boss counts it once).
   */
  patch(dt: number): boolean {
    if (this.patched || this.locked) return false;
    this.progress = Math.min(this.stats.patchTime, this.progress + dt);
    this.drawBar(true);
    if (this.progress >= this.stats.patchTime) {
      this.finish();
      return true;
    }
    return false;
  }

  /** Called when the player isn't patching this frame — decays partial progress. */
  idle(dt: number): void {
    if (this.patched) return;
    if (this.progress > 0) {
      this.progress = Math.max(0, this.progress - dt * 1.5);
      this.drawBar(this.progress > 0);
    }
  }

  /** The machine resists the finisher station until the purge phase. */
  setLocked(locked: boolean): void {
    if (this.patched || locked === this.locked) return;
    this.locked = locked;
    if (locked) this.image?.setTint(0xffb03b);
    else this.image?.clearTint();
  }

  /** Restores a patched state on arena re-entry (no bar, no completion event). */
  restorePatched(): void {
    if (!this.patched) this.finish();
  }

  private finish(): void {
    this.patched = true;
    this.locked = false;
    this.bar.setVisible(false);
    this.image?.setTint(0x5effa0); // patched = green
  }

  private drawBar(visible: boolean): void {
    this.bar.setVisible(visible);
    if (!visible) return;
    const w = this.tileSize * 0.9;
    const h = 5;
    const x = this.x - w / 2;
    const y = this.y - this.tileSize * 0.8;
    const frac = this.stats.patchTime > 0 ? this.progress / this.stats.patchTime : 1;
    this.bar.clear();
    this.bar.fillStyle(0x0a0f16, 0.85);
    this.bar.fillRect(x - 1, y - 1, w + 2, h + 2);
    this.bar.fillStyle(0x39d3ff, 1);
    this.bar.fillRect(x, y, w * frac, h);
  }
}
