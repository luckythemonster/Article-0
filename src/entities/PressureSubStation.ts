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
 *
 * When `public/assets/sprites/terminal-substation.png` is present the HoldTarget
 * draws that instead. The source's four tags line up with this machine's own
 * states almost exactly: a black screen at rest, a working readout whose status
 * ring runs GOOD→WARNING→ERROR, a glitching purge, and a dead panel showing a
 * red cross and then a flatline face. Patching a station is what kills it, so
 * `deactivated` is the *finished* state — the same thing the green tint has
 * always meant here.
 */

/** At rest: black screen, cyan ring. */
const CLIP_IDLE = "idle";
/** Being patched: the readout churning, ring cycling GOOD/WARNING/ERROR. */
const CLIP_PATCHING = "active";
/** Patched: red cross, alarm, and a flatlined face. */
const CLIP_PATCHED = "deactivated";

/** The tint a patched station gets when there is no art. */
const PATCHED_GREEN = 0x5effa0;
/**
 * The amber a locked station gets — over the art as well as over the tile frame.
 *
 * The one state the source has no clip for. Tinting rather than inventing one
 * is deliberate: "locked" is the boss resisting the finisher, a fiction of this
 * arena rather than a thing the machine does, and it lasts seconds.
 */
const LOCKED_AMBER = 0xffb03b;
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
    this.hold = new HoldTarget(
      scene,
      tile,
      tileSize,
      stats.patchTime,
      HOLD_BAR_CYAN,
      "terminal-substation",
    );
    this.x = this.hold.x;
    this.y = this.hold.y;
    this.hold.play(CLIP_IDLE);
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
    // Idempotent, so it can sit on the per-frame path — see Terminal.hack.
    this.hold.play(CLIP_PATCHING);
    if (!this.hold.advance(dt)) return false;
    this.finish();
    return true;
  }

  /** Called when the player isn't patching this frame — decays partial progress. */
  idle(dt: number): void {
    if (this.patched) return;
    this.hold.decay(dt);
    // Only once the partial patch has drained — while it drains the machine is
    // still disturbed, and the bar on screen says so.
    if (!this.hold.inProgress && !this.locked) this.hold.play(CLIP_IDLE);
  }

  /** The machine resists the finisher station until the purge phase. */
  setLocked(locked: boolean): void {
    if (this.patched || locked === this.locked) return;
    this.locked = locked;
    if (locked) this.hold.setTint(LOCKED_AMBER);
    else this.hold.clearTint();
  }

  /** Restores a patched state on arena re-entry (no bar, no completion event). */
  restorePatched(): void {
    if (!this.patched) this.finish();
  }

  private finish(): void {
    this.patched = true;
    this.locked = false;
    this.hold.settle(PATCHED_GREEN, CLIP_PATCHED);
  }
}
