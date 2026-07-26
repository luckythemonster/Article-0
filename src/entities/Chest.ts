import type Phaser from "phaser";
import type { GameTile } from "../map/types";
import { chestStatsFor, type ChestStats } from "../systems/EntityStats";
import { HoldTarget, HOLD_BAR_AMBER } from "./HoldTarget";

/**
 * A searchable supply container. Hold the interact key while adjacent to fill a
 * progress bar over the chest's `InteractionTime`; finishing opens it (amber
 * tint), emits a `NoiseOnOpen` ping the scene fans to nearby guards, and hands
 * over its items for the player's inventory.
 *
 * Renders its own sprite from the map tile's frame (the `items` board is in
 * GameScene's ENTITY_LAYERS so the static renderer skips it). The sprite, bar
 * and hold timer are a {@link HoldTarget}, shared with {@link Terminal}.
 */
export class Chest {
  readonly tileX: number;
  readonly tileY: number;
  readonly x: number;
  readonly y: number;
  readonly stats: ChestStats;

  private opened = false;
  /** The loot still inside; overflow the player can't carry stays here. */
  private contents: string[];
  private readonly hold: HoldTarget;

  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number) {
    this.tileX = tile.x;
    this.tileY = tile.y;
    this.stats = chestStatsFor(tile.components);
    this.contents = [...this.stats.items];
    this.hold = new HoldTarget(
      scene,
      tile,
      tileSize,
      this.stats.interactionTime,
      HOLD_BAR_AMBER,
    );
    this.x = this.hold.x;
    this.y = this.hold.y;
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
    if (!this.hold.advance(dt)) return false;
    this.opened = true;
    this.hold.settle(HOLD_BAR_AMBER); // looted = warm amber
    return true;
  }

  /** Called when the player isn't searching this frame — decays partial progress. */
  idle(dt: number): void {
    if (this.opened) return;
    this.hold.decay(dt);
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
      this.hold.reset();
    }
  }
}
