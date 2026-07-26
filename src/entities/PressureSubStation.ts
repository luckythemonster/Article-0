import type Phaser from "phaser";
import type { GameTile } from "../map/types";
import { VENT4_DEFAULTS, type Vent4Stats } from "../systems/EntityStats";
import { HoldTarget, HOLD_BAR_CYAN } from "./HoldTarget";

/**
 * A pressure relief terminal on the VENT-4 arena perimeter. Hold the interact
 * key while adjacent to patch it (Terminal's hold-to-progress contract:
 * `patch` returns true exactly on the completion frame, `idle` decays partial
 * progress). The machine "locks" the last un-patched station until its purge
 * phase — shown as an amber tint and a resisting prompt.
 *
 * Renders its own sprite from the arena tile's frame (the `substations` board
 * is in GameScene's ENTITY_LAYERS so the static renderer skips it). The sprite,
 * bar and hold timer are a {@link HoldTarget}, shared with {@link Terminal}.
 */
export class PressureSubStation {
  readonly index: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly x: number;
  readonly y: number;

  private patched = false;
  private locked = false;
  private readonly hold: HoldTarget;

  constructor(
    scene: Phaser.Scene,
    tile: GameTile,
    tileSize: number,
    index: number,
    stats: Vent4Stats = VENT4_DEFAULTS,
  ) {
    this.index = index;
    this.tileX = tile.x;
    this.tileY = tile.y;
    this.hold = new HoldTarget(scene, tile, tileSize, stats.patchTime, HOLD_BAR_CYAN);
    this.x = this.hold.x;
    this.y = this.hold.y;
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
    if (!this.hold.advance(dt)) return false;
    this.finish();
    return true;
  }

  /** Called when the player isn't patching this frame — decays partial progress. */
  idle(dt: number): void {
    if (this.patched) return;
    this.hold.decay(dt);
  }

  /** The machine resists the finisher station until the purge phase. */
  setLocked(locked: boolean): void {
    if (this.patched || locked === this.locked) return;
    this.locked = locked;
    if (locked) this.hold.setTint(0xffb03b);
    else this.hold.clearTint();
  }

  /** Restores a patched state on arena re-entry (no bar, no completion event). */
  restorePatched(): void {
    if (!this.patched) this.finish();
  }

  private finish(): void {
    this.patched = true;
    this.locked = false;
    this.hold.settle(0x5effa0); // patched = green
  }
}
