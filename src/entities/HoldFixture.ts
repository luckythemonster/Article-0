import type Phaser from "phaser";
import type { GameTile } from "../map/types";
import { HoldTarget, HOLD_BAR_CYAN } from "./HoldTarget";

/** The tint a completed fixture settles to. Was a bare literal at four call sites. */
export const HOLD_SETTLED_GREEN = 0x5effa0;

/**
 * A world fixture the player completes by holding the interact key.
 *
 * {@link HoldTarget} owns the sprite, the progress bar and the timer. What kept getting
 * rewritten on top of it was the *state* — a `done` flag, a `finish()` that settles the
 * tint, an `idle()` that decays, and some subset of "restore without firing the
 * completion event" and "un-finish". The vent core's sub-stations, the vault's correction
 * nodes and the roof's pedestals each grew their own copy, and they drifted in exactly the
 * way you would expect: only two of them could be restored on level re-entry, only one
 * could be un-finished, and each named the same green a fifth time.
 *
 * This is that state, once. Composed over `HoldTarget` rather than extending it, for the
 * reason `HoldTarget`'s own doc gives: the users need different *vocabulary* (patch,
 * desynchronise, calibrate) over identical mechanics, and a base class would have forced
 * them to share names they shouldn't.
 */
export class HoldFixture {
  /** Pixel centre, from the tile the fixture stands on. */
  readonly x: number;
  readonly y: number;

  private done = false;
  private readonly hold: HoldTarget;

  constructor(
    scene: Phaser.Scene,
    tile: GameTile,
    tileSize: number,
    /** Position in its owner's board order — the index its core counts by. */
    readonly index: number,
    holdTime: number,
    barColor: number = HOLD_BAR_CYAN,
    private readonly settleColor: number = HOLD_SETTLED_GREEN,
  ) {
    this.hold = new HoldTarget(scene, tile, tileSize, holdTime, barColor);
    this.x = this.hold.x;
    this.y = this.hold.y;
  }

  get isDone(): boolean {
    return this.done;
  }

  /**
   * Advances the hold. True on the **exact completion frame** only, so the caller's core
   * counts it once however long the key stays down.
   */
  advance(dt: number): boolean {
    if (this.done) return false;
    if (!this.hold.advance(dt)) return false;
    this.finish();
    return true;
  }

  /** Not being worked this frame: drain partial progress. */
  idle(dt: number): void {
    if (!this.done) this.hold.decay(dt);
  }

  /** Restores a completed state on re-entry — no bar, and no completion event. */
  restoreDone(): void {
    if (!this.done) this.finish();
  }

  /**
   * Un-finishes the fixture: back to untouched.
   *
   * What a terminal does when a minigame is aborted, and what NW-SMAC-01 does when it
   * repairs a node out from under the player.
   */
  reset(): void {
    if (!this.done) return;
    this.done = false;
    this.hold.reset();
  }

  /** Recolour without touching progress — a sub-station being held locked. */
  setTint(color: number): void {
    this.hold.setTint(color);
  }

  clearTint(): void {
    this.hold.clearTint();
  }

  private finish(): void {
    this.done = true;
    this.hold.settle(this.settleColor);
  }
}

/**
 * Nearest fixture to a point, in tiles.
 *
 * Every encounter runs this loop to decide which of its fixtures the interact key is
 * aimed at, and each had written its own. Returns null when the list is empty so callers
 * can `if (!near)` rather than testing a sentinel distance.
 */
export function nearestFixture<T extends { x: number; y: number }>(
  items: readonly T[],
  px: number,
  py: number,
  tileSize: number,
): { item: T; tiles: number } | null {
  let best: T | undefined;
  let bestDist = Infinity;
  for (const item of items) {
    const dx = item.x - px;
    const dy = item.y - py;
    const d = Math.sqrt(dx * dx + dy * dy) / tileSize;
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return best ? { item: best, tiles: bestDist } : null;
}
