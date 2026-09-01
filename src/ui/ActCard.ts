import Phaser from "phaser";
import { FONT_DISPLAY, FONT_MONO } from "./fonts";
import { onResize } from "./resize";
import { UI, hex } from "./hudTheme";
import {
  ACT_CARD_BAND_H,
  ACT_CARD_SUBTITLE_SIZE,
  ACT_CARD_TITLE_SIZE,
  ACT_CARD_TITLE_UP,
} from "./hudLayout";
import type { Act } from "../systems/Objectives";

/**
 * The act card: two centred lines, once, when the story moves.
 *
 * *Article Zero* has had four named acts since it had a mission, and it has
 * never told the player which one they are in. The objective tracker names the
 * next **task** — breach BETA, silence the core — which is a different thing:
 * a checklist is not a chapter heading, and a run that reads as one long errand
 * is the thing four acts were supposed to prevent.
 *
 * Deliberately not the {@link ./EncounterBand}, though it is the same kind of
 * widget. That band is a *readout*: it lives at the top of the screen for as
 * long as a fight lasts and reports a number. This is a title card. It owns the
 * middle of the screen for three seconds, says nothing that changes, and leaves.
 * Sharing an implementation would mean one of the two growing a flag for the
 * other's job.
 *
 * Drawn by `UIScene`, which is unzoomed, so the type is at its authored size.
 */

/** Fade in, hold, fade out — the whole card, in milliseconds. */
const FADE_IN_MS = 420;
const HOLD_MS = 2200;
const FADE_OUT_MS = 700;

export class ActCard {
  private readonly band: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text;
  private tween?: Phaser.Tweens.TweenChain;

  constructor(private readonly scene: Phaser.Scene) {
    // A screen-wide band behind the type, and not decoration: the card lands
    // over whatever the level happens to look like, and 12px of --c-text-dim on
    // a lit tile floor is a line nobody reads. Everything else in the HUD sits in
    // a corner against its own plate; this is the one widget that has to hold the
    // middle of the play field, so it brings its own ground.
    this.band = scene.add
      .rectangle(0, 0, 10, ACT_CARD_BAND_H, hex(UI.bgVoid), 0.82)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(1099)
      .setAlpha(0)
      .setVisible(false);
    this.title = scene.add
      .text(0, 0, "", {
        fontFamily: FONT_DISPLAY,
        fontSize: `${ACT_CARD_TITLE_SIZE}px`,
        color: UI.cyan,
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      // Above the encounter band and its banners: for the three seconds this is
      // up it is the only thing on screen that is being said.
      .setDepth(1100)
      .setAlpha(0)
      .setVisible(false);
    this.subtitle = scene.add
      .text(0, 0, "", {
        fontFamily: FONT_MONO,
        fontSize: `${ACT_CARD_SUBTITLE_SIZE}px`,
        color: UI.textMuted,
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1100)
      .setAlpha(0)
      .setVisible(false);

    const layout = (w: number, h: number): void => {
      this.band.setPosition(0, h / 2).setSize(w, ACT_CARD_BAND_H);
      this.title.setPosition(w / 2, h / 2 - ACT_CARD_TITLE_UP);
      this.subtitle.setPosition(w / 2, h / 2 - ACT_CARD_TITLE_UP + 8);
    };
    onResize(scene, layout, true);
  }

  /**
   * Shows a card, replacing whatever was up.
   *
   * Replacing rather than queueing: two acts cannot both be the one you have
   * just walked into, so a second call is a correction, not a backlog. (It
   * happens for real — a debug warp straight from `main1` into `roof_array`
   * fires Act IV while Act I is still fading.)
   */
  play(act: Act): void {
    this.tween?.destroy();
    this.band.setVisible(true).setAlpha(0);
    this.title.setText(act.title).setVisible(true).setAlpha(0);
    this.subtitle.setText(act.subtitle).setVisible(true).setAlpha(0);
    // A chain rather than one tween with `yoyo`, which would reuse the
    // in-duration on the way out. A title card should leave more slowly than it
    // arrives — the fade-out is the beat the player reads the second line in.
    this.tween = this.scene.tweens.chain({
      targets: [this.band, this.title, this.subtitle],
      tweens: [
        { alpha: { from: 0, to: 1 }, duration: FADE_IN_MS, hold: HOLD_MS },
        { alpha: 0, duration: FADE_OUT_MS },
      ],
      onComplete: () => this.hide(),
    });
  }

  /** Hides the card and forgets the tween — `UIScene` outlives levels. */
  hide(): void {
    this.tween?.destroy();
    this.tween = undefined;
    this.band.setVisible(false).setAlpha(0);
    this.title.setVisible(false).setAlpha(0);
    this.subtitle.setVisible(false).setAlpha(0);
  }
}
