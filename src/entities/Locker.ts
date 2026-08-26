import type Phaser from "phaser";
import type { GameTile } from "../map/types";
import { LOCKER_STASH_TIME } from "../systems/EntityStats";
import { HoldTarget, HOLD_BAR_AMBER } from "./HoldTarget";
import type { EntitySpriteId } from "./EntitySprites";

/**
 * A container a body fits in.
 *
 * The stealth genre's oldest housekeeping verb, and until now the one thing this
 * game had no answer to: every way of putting somebody down — the Stun Rounds
 * dart, the Rail-Stapler's field mode, and now the EMP's shutdown — left a body
 * lying where it fell, and `src/scenes/game/Anomalies.ts` correctly reports that
 * body to every patrol that walks past. There was no way to tidy up, so the
 * non-lethal options all carried a permanent tell and the quiet route through a
 * room was to avoid touching anyone at all.
 *
 * **One body, and it goes back in and out.** Capacity is deliberately one rather
 * than a count: a locker holding three is a bin, and a bin makes the decision of
 * *which* body to deal with — the interesting one — go away. It is also
 * reversible, because a wrong guess about where a patrol goes should cost time
 * rather than a run.
 *
 * **Two silhouettes, one behaviour.** `locker` is the upright keypad one and
 * `footlocker` the floor-standing chest; they differ in their art and in nothing
 * else, which is why the tag names below are read off whichever is mounted rather
 * than branched on. Both sources carry a `CODE_INPUT`/`UNLOCKING` sequence for a
 * lock mechanic that does not exist — the same situation `terminal.aseprite`'s
 * `DESTROYED` tag is in, and noted here for the same reason: nothing plays them,
 * and that is not a bug.
 *
 * Hold-to-open rather than a tap, sharing {@link HoldTarget} with the chest and
 * the terminal — putting a body away should cost the same kind of exposed,
 * committed seconds that searching a chest does, and for the same reason: it is
 * time spent standing still in a room you do not control.
 */
export class Locker {
  readonly tileX: number;
  readonly tileY: number;
  readonly x: number;
  readonly y: number;

  /** What is inside, or null. See the class doc on why this is not an array. */
  private body: StashedBody | null = null;
  private readonly hold: HoldTarget;

  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, art: EntitySpriteId) {
    this.tileX = tile.x;
    this.tileY = tile.y;
    this.hold = new HoldTarget(scene, tile, tileSize, LOCKER_STASH_TIME, HOLD_BAR_AMBER, art);
    this.x = this.hold.x;
    this.y = this.hold.y;
    this.hold.play("IDLE");
  }

  get isOccupied(): boolean {
    return this.body !== null;
  }

  /**
   * Advances a stash or a retrieval while the player holds interact.
   *
   * Returns `"stashed"` or `"retrieved"` on the frame the hold completes, and
   * `undefined` on every other frame. One method rather than two because from the
   * player's side it is one verb held at one place, and which way it runs is a
   * fact about the locker rather than about the press — but the caller has to
   * know which way it went, because only one of the two empties his hands.
   *
   * Which way is decided by {@link canWork}, and the two conditions it allows are
   * mutually exclusive on purpose: a carrying player at an occupied locker does
   * nothing at all rather than swapping. A swap would have to put one body down
   * and pick another up in the same press, and there is no moment in that where
   * Rowan is holding a defensible number of people.
   */
  work(dt: number, carried: StashedBody | null): LockerResult | undefined {
    if (!this.canWork(carried !== null)) return undefined;
    if (!this.hold.advance(dt)) return undefined;
    this.hold.reset();

    if (this.body) {
      const out = this.body;
      this.body = null;
      out.setStashed(false);
      // Back on the floor at the locker's feet, not at the player's — he is
      // standing next to it, and a body that materialised under him could appear
      // on the far side of a wall he happens to be pressed to.
      out.moveTo(this.x, this.y);
      this.hold.play("OPENING");
      return "retrieved";
    }

    this.body = carried;
    carried!.setStashed(true);
    this.hold.play("CLOSING");
    return "stashed";
  }

  /** Called when the player isn't working this locker — decays partial progress. */
  idle(dt: number): void {
    this.hold.decay(dt);
  }

  /**
   * Whether holding interact here would do anything.
   *
   * An empty locker with empty hands is a cupboard, and offering `[E] Stash` at
   * one would put a verb on screen that cannot complete — the prompt chain in
   * `src/scenes/game/InteractPrompt.ts` claims a press by showing a label, so a
   * label that leads nowhere eats the press a nearer object wanted.
   */
  canWork(carrying: boolean): boolean {
    return this.isOccupied ? !carrying : carrying;
  }
}

/** Which way a completed hold ran. See {@link Locker.work}. */
export type LockerResult = "stashed" | "retrieved";

/**
 * What a locker can hold.
 *
 * A structural type rather than `Orderly | Enforcer`, so this module does not
 * depend on either — the two classes share no base and have nothing else in
 * common, and the locker genuinely does not care which it has. Both satisfy it
 * through the matching pair of members added alongside this file.
 */
export interface StashedBody {
  readonly x: number;
  readonly y: number;
  setStashed(on: boolean): void;
  moveTo(x: number, y: number): void;
  readonly isCarryable: boolean;
  readonly isStashed: boolean;
}
