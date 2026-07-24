import Phaser from "phaser";
import type { GameTile } from "../map/types";
import { chestStatsFor, type ChestStats } from "../systems/EntityStats";

/**
 * A searchable supply container. Hold the interact key while adjacent to fill a
 * progress bar over the chest's `InteractionTime`; finishing opens it (amber
 * tint), emits a `NoiseOnOpen` ping the scene fans to nearby guards, and hands
 * over its items for the player's inventory.
 *
 * Renders its own sprite from the map tile's frame (the `items` board is in
 * GameScene's ENTITY_LAYERS so the static renderer skips it). Modeled on
 * {@link Terminal}'s hold-to-progress pattern.
 */
export class Chest {
  readonly tileX: number;
  readonly tileY: number;
  readonly x: number;
  readonly y: number;
  readonly stats: ChestStats;

  private opened = false;
  private progress = 0; // seconds accumulated
  /** The loot still inside; overflow the player can't carry stays here. */
  private contents: string[];
  private readonly image?: Phaser.GameObjects.Image;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly tileSize: number;

  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number) {
    this.tileX = tile.x;
    this.tileY = tile.y;
    this.tileSize = tileSize;
    this.stats = chestStatsFor(tile.components);
    this.contents = [...this.stats.items];
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

  get isOpen(): boolean {
    return this.opened;
  }

  /**
   * Advances the search while the player holds interact. Returns true on the
   * exact frame it completes (so the scene collects the loot once).
   */
  open(dt: number): boolean {
    if (this.opened) return false;
    this.progress = Math.min(this.stats.interactionTime, this.progress + dt);
    this.drawBar(true);
    if (this.progress >= this.stats.interactionTime) {
      this.opened = true;
      this.bar.setVisible(false);
      this.image?.setTint(0xffd27a); // looted = warm amber
      return true;
    }
    return false;
  }

  /** Called when the player isn't searching this frame — decays partial progress. */
  idle(dt: number): void {
    if (this.opened) return;
    if (this.progress > 0) {
      this.progress = Math.max(0, this.progress - dt * 1.5);
      this.drawBar(this.progress > 0);
    }
  }

  /** The items this chest currently holds (resolved to default loot if blank). */
  take(): string[] {
    return [...this.contents];
  }

  /**
   * Records the loot the scene couldn't take (consumable cap reached). Non-empty
   * leftovers keep the chest searchable — it re-arms so the player can come back
   * after freeing a slot; an emptied chest stays open with its looted tint.
   */
  retain(leftover: string[]): void {
    this.contents = [...leftover];
    if (leftover.length > 0) {
      this.opened = false;
      this.progress = 0;
      this.image?.clearTint();
      this.bar.setVisible(false);
    }
  }

  private drawBar(visible: boolean): void {
    this.bar.setVisible(visible);
    if (!visible) return;
    const w = this.tileSize * 0.9;
    const h = 5;
    const x = this.x - w / 2;
    const y = this.y - this.tileSize * 0.8;
    const frac = this.stats.interactionTime > 0 ? this.progress / this.stats.interactionTime : 1;
    this.bar.clear();
    this.bar.fillStyle(0x0a0f16, 0.85);
    this.bar.fillRect(x - 1, y - 1, w + 2, h + 2);
    this.bar.fillStyle(0xffd27a, 1);
    this.bar.fillRect(x, y, w * frac, h);
  }
}
