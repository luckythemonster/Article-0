import Phaser from "phaser";
import type { GameTile } from "../map/types";
import { terminalStatsFor, type TerminalStats } from "../systems/EntityStats";

/**
 * A hackable terminal. Hold the interact key while adjacent to fill a progress
 * bar over the terminal's `HackTime`; finishing marks it hacked (green tint)
 * and fires its effect once (in this slice, opening nearby doors — the scene
 * owns that, since the map carries no explicit terminal→door links).
 *
 * Renders its own sprite from the map tile's frame (the `terminals` board is in
 * GameScene's ENTITY_LAYERS so the static renderer skips it).
 */
export class Terminal {
  readonly tileX: number;
  readonly tileY: number;
  readonly x: number;
  readonly y: number;
  readonly stats: TerminalStats;

  private hacked = false;
  private progress = 0; // seconds accumulated
  private readonly image?: Phaser.GameObjects.Image;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly tileSize: number;

  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number) {
    this.tileX = tile.x;
    this.tileY = tile.y;
    this.tileSize = tileSize;
    this.stats = terminalStatsFor(tile.components);
    // Cell centre plus the tile's authored placement offset.
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

  get isHacked(): boolean {
    return this.hacked;
  }

  /**
   * Advances the hack while the player holds interact. Returns true on the exact
   * frame the hack completes (so the scene can fire the effect once).
   */
  hack(dt: number): boolean {
    if (this.hacked) return false;
    this.progress = Math.min(this.stats.hackTime, this.progress + dt);
    this.drawBar(true);
    if (this.progress >= this.stats.hackTime) {
      this.hacked = true;
      this.bar.setVisible(false);
      this.image?.setTint(0x5effa0); // hacked = green
      return true;
    }
    return false;
  }

  /** Called when the player isn't hacking this frame — decays partial progress. */
  idle(dt: number): void {
    if (this.hacked) return;
    if (this.progress > 0) {
      this.progress = Math.max(0, this.progress - dt * 1.5);
      this.drawBar(this.progress > 0);
    }
  }

  private drawBar(visible: boolean): void {
    this.bar.setVisible(visible);
    if (!visible) return;
    const w = this.tileSize * 0.9;
    const h = 5;
    const x = this.x - w / 2;
    const y = this.y - this.tileSize * 0.8;
    const frac = this.stats.hackTime > 0 ? this.progress / this.stats.hackTime : 1;
    this.bar.clear();
    this.bar.fillStyle(0x0a0f16, 0.85);
    this.bar.fillRect(x - 1, y - 1, w + 2, h + 2);
    this.bar.fillStyle(0x39d3ff, 1);
    this.bar.fillRect(x, y, w * frac, h);
  }
}
