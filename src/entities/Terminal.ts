import type Phaser from "phaser";
import type { GameTile } from "../map/types";
import { terminalStatsFor, type TerminalStats } from "../systems/EntityStats";
import { HoldTarget, HOLD_BAR_CYAN } from "./HoldTarget";

/**
 * A hackable terminal. Hold the interact key while adjacent to fill a progress
 * bar over the terminal's `HackTime`; finishing marks it hacked (green tint)
 * and fires its effect once (in this slice, opening nearby doors — the scene
 * owns that, since the map carries no explicit terminal→door links).
 *
 * Renders its own sprite from the map tile's frame (the `terminals` board is in
 * GameScene's ENTITY_LAYERS so the static renderer skips it). The sprite, bar
 * and hold timer are a {@link HoldTarget}.
 */
export class Terminal {
  readonly tileX: number;
  readonly tileY: number;
  readonly x: number;
  readonly y: number;
  readonly stats: TerminalStats;

  private hacked = false;
  private readonly hold: HoldTarget;

  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number) {
    this.tileX = tile.x;
    this.tileY = tile.y;
    this.stats = terminalStatsFor(tile.components);
    this.hold = new HoldTarget(scene, tile, tileSize, this.stats.hackTime, HOLD_BAR_CYAN);
    this.x = this.hold.x;
    this.y = this.hold.y;
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
    if (!this.hold.advance(dt)) return false;
    this.hacked = true;
    this.hold.settle(0x5effa0); // hacked = green
    return true;
  }

  /**
   * Reverts a completed breach so the terminal can be hacked again. Used when a
   * log-cache breach launches the compliance puzzle and the player aborts it —
   * the mission-critical log must stay recoverable, so the terminal is re-armed.
   */
  reopen(): void {
    this.hacked = false;
    this.hold.reset();
  }

  /** Called when the player isn't hacking this frame — decays partial progress. */
  idle(dt: number): void {
    if (this.hacked) return;
    this.hold.decay(dt);
  }
}
