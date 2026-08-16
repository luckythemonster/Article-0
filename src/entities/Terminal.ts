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
 *
 * When `public/assets/sprites/terminal.png` is present the HoldTarget draws that
 * instead, and the three states below become its three clips. The mapping is
 * read off the art rather than guessed at: the source's `active` frame is a
 * teal screen with a `#5effa0` lamp — the exact green this class has always
 * tinted a finished hack — so `active` is the *breached* terminal, not one
 * being worked on. `idle` is a dark screen with a 77ms yellow blip once a
 * second, and `alert` flashes amber and red at 100ms, which is what a machine
 * does while it is being broken into.
 */

/** Untouched: dark screen, one yellow standby blip a second. */
const CLIP_IDLE = "idle";
/** Mid-hack: the screen flashing amber and red while the breach runs. */
const CLIP_HACKING = "alert";
/** Breached: teal screen and the green lamp, matching {@link HACKED_GREEN}. */
const CLIP_HACKED = "active";

/** The tint a finished hack gets when there is no art — and the art's own lamp. */
const HACKED_GREEN = 0x5effa0;
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
    this.hold = new HoldTarget(
      scene,
      tile,
      tileSize,
      this.stats.hackTime,
      HOLD_BAR_CYAN,
      "terminal",
    );
    this.x = this.hold.x;
    this.y = this.hold.y;
    this.hold.play(CLIP_IDLE);
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
    // Idempotent — the clip only restarts if it isn't already the one playing —
    // so this can sit on the per-frame path rather than needing a transition flag.
    this.hold.play(CLIP_HACKING);
    if (!this.hold.advance(dt)) return false;
    this.hacked = true;
    this.hold.settle(HACKED_GREEN, CLIP_HACKED);
    return true;
  }

  /**
   * Reverts a completed breach so the terminal can be hacked again. Used when a
   * log-cache breach launches the compliance puzzle and the player aborts it —
   * the mission-critical log must stay recoverable, so the terminal is re-armed.
   */
  reopen(): void {
    this.hacked = false;
    this.hold.reset(CLIP_IDLE);
  }

  /** Called when the player isn't hacking this frame — decays partial progress. */
  idle(dt: number): void {
    if (this.hacked) return;
    this.hold.decay(dt);
    // Only once the partial breach has drained away: while it is still draining
    // the machine is still disturbed, and the bar on screen says so.
    if (!this.hold.inProgress) this.hold.play(CLIP_IDLE);
  }
}
