import type Phaser from "phaser";
import type { GameTile } from "../map/types";
import { breakerStatsFor, type BreakerStats } from "../systems/EntityStats";
import { KEYPAD_DIGITS, keypadCode, keypadSeed } from "../systems/PowerGrid";
import {
  clipFrames,
  ensureEntityClip,
  entitySpriteKey,
  framesLabelled,
  hasEntitySprite,
  type EntitySpriteId,
} from "./EntitySprites";

/**
 * A power breaker: tap to cut the circuit it feeds, tap again to restore it.
 *
 * The shipped one sits in `main1`'s `power` board at (3,7) and its `PowerGrid`
 * component names `light_overhead1` — a tile def the map places fifty times, so
 * this single switch is the whole main deck's overhead lighting. What that is
 * worth is in `src/systems/PowerGrid.ts`; what it *looks* like is here.
 *
 * **Not a {@link HoldTarget}.** That class is the hold-to-progress contract, and
 * a hold bar is the wrong reading of this art: the source is a fixed 2.4s
 * sequence at authored per-frame timings, not a fillable meter. A tap commits,
 * and the throw cannot be interrupted once it starts.
 */

const ART: EntitySpriteId = "breaker";

/** Layer names in `Breaker.aseprite`, which are the keys the manifest is written under. */
const LAYER_SCREEN = "SCREEN";
const LAYER_CONTROLS = "CONTROLS";
const LAYER_DOOR = "DOOR";

/** Cel labels. The screen's two states are also the two circuit states. */
const SCREEN_POWERED = "POWER_ON";
const SCREEN_UNPOWERED = "POWER_OFF";
const DOOR_OPEN = "OPEN";
const TAG_IDLE = "IDLE";

export class Breaker {
  readonly tileX: number;
  readonly tileY: number;
  /** Pixel centre — public for the same reason as {@link Terminal.x}. */
  readonly x: number;
  readonly y: number;
  readonly stats: BreakerStats;

  /** Live circuit state: true when the power is on. */
  private closed: boolean;
  private throwing = false;
  /** Bumped per throw, so each one punches a different code — see {@link keypadSeed}. */
  private throwCount = 0;

  private readonly sprite?: Phaser.GameObjects.Sprite;

  /**
   * @param closed the circuit's live state, which is the persisted
   *   `PowerGridState` override if there is one and the map's authored `State`
   *   otherwise — so a deck the player darkened is still dark on the way back.
   */
  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, closed: boolean) {
    this.tileX = tile.x;
    this.tileY = tile.y;
    this.x = (tile.x + 0.5) * tileSize + tile.offsetX;
    this.y = (tile.y + 0.5) * tileSize + tile.offsetY;
    this.stats = breakerStatsFor(tile.components);
    this.closed = closed;

    // Off the tile, not the art — `breaker_main1` is authored at half a tile,
    // which is why the source is 16px. See `EntitySprites.displayTiles`.
    const width = tile.colSpan * tileSize;
    const height = tile.rowSpan * tileSize;

    if (hasEntitySprite(scene, ART)) {
      this.sprite = scene.add
        .sprite(this.x, this.y, entitySpriteKey(ART))
        .setDisplaySize(width, height)
        .setDepth(120);
      this.playIdle();
    } else if (tile.frame) {
      // Nothing keeps it: without art there is no clip to drive, and the switch
      // still works — it just flips instantly instead of playing out.
      scene.add
        .image(this.x, this.y, tile.frame.textureKey, tile.frame.frameKey)
        .setDisplaySize(width, height)
        .setFlipY(tile.flipY === true)
        .setTint(tile.tint)
        .setDepth(120);
    }
  }

  /** True when the circuit is live. */
  get isClosed(): boolean {
    return this.closed;
  }

  /** True while a throw is playing out — the tap that starts one is refused. */
  get isThrowing(): boolean {
    return this.throwing;
  }

  /**
   * Throws the switch, if one isn't already in progress.
   *
   * `onFlip` fires **mid-animation**, on the frame the artist drew the screen
   * changing colour, rather than when the clip ends — the cabinet visibly shuts
   * *after* the power goes, and firing at the end would put the room's lights
   * behind the sprite that just said they were gone.
   *
   * Returns whether a throw actually started, so the caller only spends its tap
   * (and its noise, and its conduct charge) when something happened.
   */
  toggle(onFlip: (closed: boolean) => void): boolean {
    if (this.throwing) return false;

    const nextClosed = !this.closed;
    const sprite = this.sprite;

    // No art on disk: the seam stays open, so flip immediately and silently.
    if (!sprite) {
      this.closed = nextClosed;
      this.throwCount++;
      onFlip(nextClosed);
      return true;
    }

    const code = keypadCode(
      keypadSeed(this.tileX, this.tileY, this.throwCount),
      KEYPAD_DIGITS,
    );
    const frames = this.throwFrames(nextClosed, code);
    if (frames.length === 0) {
      // The art loaded but no longer carries the labels this reads. Fall back to
      // the instant flip rather than leaving a switch that does nothing.
      this.closed = nextClosed;
      this.throwCount++;
      onFlip(nextClosed);
      return true;
    }

    const key = ensureEntityClip(
      sprite.scene,
      ART,
      `${ART}:throw:${this.tileX},${this.tileY}:${this.throwCount}`,
      frames,
      0,
    );
    if (key === undefined) return false;

    // The destination screen's blank-keypad frame is where the colour changes;
    // Phaser numbers animation frames from 1.
    const toScreen = nextClosed ? SCREEN_POWERED : SCREEN_UNPOWERED;
    const flipAt = frames.indexOf(this.blankKeypadFrame(toScreen) ?? -1) + 1;
    let flipped = false;
    const flip = (): void => {
      if (flipped) return;
      flipped = true;
      this.closed = nextClosed;
      onFlip(nextClosed);
    };

    this.throwing = true;
    sprite.on(
      "animationupdate",
      (_anim: unknown, frame: Phaser.Animations.AnimationFrame) => {
        if (flipAt > 0 && frame.index >= flipAt) flip();
      },
    );
    sprite.once("animationcomplete", () => {
      sprite.off("animationupdate");
      // A clip cut short by a scene teardown must still leave the state coherent.
      flip();
      this.throwing = false;
      this.throwCount++;
      this.playIdle();
    });
    sprite.play(key);
    return true;
  }

  /** Settles on the resting frame for the current circuit state. */
  private playIdle(): void {
    const sprite = this.sprite;
    if (!sprite) return;
    const screen = this.closed ? SCREEN_POWERED : SCREEN_UNPOWERED;
    const idle = this.idleFrame(screen);
    if (idle === undefined) return;
    const key = ensureEntityClip(sprite.scene, ART, `${ART}:rest:${screen}`, [idle], 0);
    if (key !== undefined) sprite.play(key);
  }

  /**
   * The frame sequence for one throw, composed from the artist's labels.
   *
   * Cutting power reads: shut cabinet on a green screen, cabinet open, the four
   * digits punched in against that green screen, the screen red, cabinet shut.
   * Restoring is the exact mirror through the red-screen digits. The source
   * draws every digit twice — once per screen colour — which is what makes both
   * directions available from one 24-frame strip.
   */
  private throwFrames(nextClosed: boolean, code: readonly number[]): number[] {
    const from = nextClosed ? SCREEN_UNPOWERED : SCREEN_POWERED;
    const to = nextClosed ? SCREEN_POWERED : SCREEN_UNPOWERED;

    const startIdle = this.idleFrame(from);
    const startOpen = this.blankKeypadFrame(from);
    const endOpen = this.blankKeypadFrame(to);
    const endIdle = this.idleFrame(to);
    if (
      startIdle === undefined ||
      startOpen === undefined ||
      endOpen === undefined ||
      endIdle === undefined
    ) {
      return [];
    }

    const digits: number[] = [];
    for (const digit of code) {
      const frame = this.digitFrame(digit, from);
      if (frame === undefined) return [];
      digits.push(frame);
    }
    return [startIdle, startOpen, ...digits, endOpen, endIdle];
  }

  /**
   * The shut-cabinet frame for a screen state.
   *
   * The source has **two** `IDLE` tags — the cabinet shut on a live circuit and
   * the cabinet shut on a dead one — which is precisely the case `clipFrames`'
   * label argument exists for: the screen's own cel label picks the occurrence.
   */
  private idleFrame(screen: string): number | undefined {
    return clipFrames(ART, TAG_IDLE, screen)[0];
  }

  /** The frame showing `digit` on the keypad, against `screen`. */
  private digitFrame(digit: number, screen: string): number | undefined {
    const onScreen = framesLabelled(ART, screen, LAYER_SCREEN);
    for (const frame of framesLabelled(ART, String(digit), LAYER_CONTROLS)) {
      if (onScreen.has(frame)) return frame;
    }
    return undefined;
  }

  /**
   * The open-cabinet frame with nothing on the keypad, for a screen colour.
   *
   * Found by subtraction rather than by name, because the artist only labelled
   * one of the two: the red one carries `idle` on `CONTROLS` and the green one
   * carries no `CONTROLS` label at all. What both share is being open with no
   * *digit* showing, and that is expressible without leaning on either quirk.
   */
  private blankKeypadFrame(screen: string): number | undefined {
    const onScreen = framesLabelled(ART, screen, LAYER_SCREEN);
    const open = framesLabelled(ART, DOOR_OPEN, LAYER_DOOR);
    for (const frame of open) {
      if (!onScreen.has(frame)) continue;
      if (isDigitFrame(frame)) continue;
      return frame;
    }
    return undefined;
  }
}

/** Whether the keypad shows a digit on this frame. */
function isDigitFrame(frame: number): boolean {
  for (let digit = 0; digit <= 9; digit++) {
    if (framesLabelled(ART, String(digit), LAYER_CONTROLS).has(frame)) return true;
  }
  return false;
}
