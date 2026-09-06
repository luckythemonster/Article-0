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
 * When `public/assets/sprites/terminal.png` is present the HoldTarget draws
 * that instead. The source has three tags — `IDLE`, `IN_USE`, `DESTROYED` —
 * and only the first two are wired here. `IDLE` is the untouched machine;
 * `IN_USE` (its `status_light` cels step READY → WORKING → RUN, then loop) is
 * the only art for a machine being worked. There is no dedicated "finished"
 * clip, so a completed hack does **not** pass `IN_USE` to {@link HoldTarget.settle}
 * — that would let `settle` find the clip already playing and skip the tint
 * (`play` succeeding is exactly what `settle` treats as "the art already shows
 * done, don't tint"), leaving a breached terminal looking identical to one still
 * being worked. Passing no clip name forces the {@link HACKED_GREEN} fallback tint
 * instead, over whichever `IN_USE` frame is showing — the same marker an object
 * with no art at all gets. `DESTROYED` (`status_light` runs to ERROR) is the art
 * for {@link Terminal.brick} — the compliance puzzle's wrong-answer consequence —
 * with the same {@link BRICKED_RED} fallback tint for a terminal with no art.
 */

/** Untouched: the art's idle frames, no bar, no tint. */
const CLIP_IDLE = "IDLE";
/** Being worked on, and — once tinted green — breached: the art's in-use frames. */
const CLIP_HACKING = "IN_USE";
/** Permanently destroyed — see {@link Terminal.brick}. */
const CLIP_DESTROYED = "DESTROYED";

/** The tint a finished hack gets, art or no art — see the class doc above. */
const HACKED_GREEN = 0x5effa0;
/** The tint a bricked terminal gets, art or no art — see {@link Terminal.brick}. */
const BRICKED_RED = 0xff5c6a;
export class Terminal {
  readonly tileX: number;
  readonly tileY: number;
  readonly x: number;
  readonly y: number;
  readonly stats: TerminalStats;

  private hacked = false;
  private bricked = false;
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
   * Whether this terminal was destroyed rather than breached.
   *
   * {@link brick} sets `hacked` as well, so every "already done with this one"
   * check in the interaction scan excludes a bricked panel without knowing the
   * difference — which was the whole point, right up until something needed to
   * tell a *breached* terminal from a *dead* one. The camera feed does: a panel
   * you got into keeps answering (`src/scenes/game/CameraFeeds.ts`), and a panel
   * you burnt is scrap.
   */
  get isBricked(): boolean {
    return this.bricked;
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
    this.hold.settle(HACKED_GREEN);
    return true;
  }

  /**
   * Reverts a completed breach so the terminal can be hacked again. Used when a
   * log-cache breach launches the compliance puzzle and the player aborts it —
   * the mission-critical log must stay recoverable, so the terminal is re-armed.
   * A no-op once bricked: that terminal is gone for the run.
   */
  reopen(): void {
    if (this.bricked) return;
    this.hacked = false;
    this.hold.reset(CLIP_IDLE);
  }

  /**
   * Permanently destroys the terminal — the compliance puzzle's wrong-answer
   * consequence. Never hackable or reopenable again: `hacked` stays true so the
   * normal "already hacked" checks (the interaction scan, `hack()`) keep
   * excluding it with no changes needed there.
   */
  brick(): void {
    this.bricked = true;
    this.hacked = true;
    this.hold.settle(BRICKED_RED, CLIP_DESTROYED);
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
