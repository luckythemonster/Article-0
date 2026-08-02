import type Phaser from "phaser";
import type { DeployableKind, DeployedLure } from "../systems/Deployables";
import { FONT_MONO } from "../ui/fonts";

/**
 * An item the player has left on the floor — the world half of a deployable.
 *
 * Modelled on {@link Cover}: a small class that owns one visual and one piece of
 * state, existing only because something has to happen to it later. It satisfies
 * {@link DeployedLure} structurally, so the AI reads it through the pure sensor
 * module without knowing a Phaser object is on the other end.
 *
 * There is no icon art for the Sack Lunch (Stun Rounds and the Rail-Stapler ship
 * icon-less too), so the prop is drawn: a small paper-bag glyph over a soft floor
 * stain, at prop depth so it reads as litter rather than as an actor.
 */
export class DeployedItem implements DeployedLure {
  readonly kind: DeployableKind;
  readonly x: number;
  readonly y: number;

  private consumed = false;
  private readonly glyph: Phaser.GameObjects.Text;
  private readonly stain: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, kind: DeployableKind, x: number, y: number, tileSize: number) {
    this.kind = kind;
    this.x = x;
    this.y = y;

    // Under every body (440+) and over the baked tile art: it is on the floor,
    // and an orderly standing on it should be drawn on top of it.
    this.stain = scene.add.graphics().setDepth(130);
    this.stain.fillStyle(0x6b5a3a, 0.35);
    this.stain.fillCircle(x, y, tileSize * 0.42);

    // "▯" rather than a nicer box glyph: the shipped symbol font covers it
    // (see src/ui/fonts/coverage.json), and an uncovered glyph renders as tofu.
    this.glyph = scene.add
      .text(x, y, "▯", {
        fontFamily: FONT_MONO,
        fontSize: `${Math.floor(tileSize * 0.55)}px`,
        color: "#d9c79a",
      })
      .setOrigin(0.5)
      .setDepth(131);
  }

  /** True once serviced — a spent lure attracts nobody and is culled by the scene. */
  get spent(): boolean {
    return this.consumed;
  }

  /**
   * Destroys the item: the responder has finished with it. Idempotent, because two
   * orderlies can finish sanitising the same lunch on the same frame.
   */
  consume(): void {
    if (this.consumed) return;
    this.consumed = true;
    this.glyph.destroy();
    this.stain.destroy();
  }
}
