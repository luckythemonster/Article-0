import Phaser from "phaser";
import type { AlertPhase } from "../systems/AlertState";
import { SETTLE_SECONDS, type ConductView } from "../systems/Conduct";
import { BioMonitor } from "./BioMonitor";
import { controlsHintLine } from "./Controls";
import { FONT_MONO } from "./fonts";
import {
  BAR_FILL_H,
  BAR_FILL_W,
  BAR_H,
  BAR_W,
  BIO_LABEL_TOP,
  HINT_FADE_MS,
  HINT_HOLD_MS,
  SRP_AXES_TOP,
  SRP_BAR_TOP,
  SRP_LABEL_TOP,
  hintWrapWidth,
} from "./hudLayout";
import { UI, UI_DEPTH, UI_PAD, UI_TEXT, hex } from "./hudTheme";
import { onResize } from "./resize";

const PHASE_COLOR: Record<AlertPhase, string> = {
  INFILTRATION: UI.cyan,
  ALERT: UI.redDeep,
  EVASION: UI.amber,
};

/**
 * Heads-up display. The detection meter is framed as the facility's
 * **Subjectivity Risk Profile**: being seen means registering as a *subject*, so
 * the H (Harm/Vulnerability) and Y (Yield) axes climb while Q (Qualia) stays
 * pinned at 0 by the Non-Subject Status Act. Beneath it, a {@link BioMonitor} traces
 * Rowan's bio-integrity (health) as an EKG. Pinned to the camera; runs in the parallel
 * UIScene.
 */
export class Hud {
  private readonly phaseText: Phaser.GameObjects.Text;
  private readonly conductText: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly srpFill: Phaser.GameObjects.Rectangle;
  private readonly srpAxes: Phaser.GameObjects.Text;
  private readonly bio: BioMonitor;

  constructor(scene: Phaser.Scene) {
    const pad = UI_PAD;
    this.phaseText = scene.add
      .text(pad, pad, "INFILTRATION", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.title,
        color: PHASE_COLOR.INFILTRATION,
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);

    scene.add
      .text(pad, SRP_LABEL_TOP, "SUBJECTIVITY RISK", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.small,
        color: UI.textFaint,
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);
    scene.add
      .rectangle(pad, SRP_BAR_TOP, BAR_W, BAR_H, hex(UI.track))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE)
      .setStrokeStyle(1, hex(UI.borderCool));
    this.srpFill = scene.add
      .rectangle(pad + 1, SRP_BAR_TOP + 1, 0, BAR_FILL_H, hex(UI.cyan))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.FILL);
    this.srpAxes = scene.add
      .text(pad, SRP_AXES_TOP, "Q 0.00   H 0.00   Y 0.00", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.micro,
        color: UI.textDim,
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);

    // Owns its own heading and rate readout. Its height is part of the shared column
    // budget in `hudLayout`, because `AlertNetworkHud` starts where it ends.
    this.bio = new BioMonitor(scene, pad, BIO_LABEL_TOP);

    this.hint = scene.add
      .text(pad, scene.scale.height - pad, controlsHintLine(), {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.label,
        color: UI.textDim,
      })
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);

    // Bottom-left, just above the controls hint. Deliberately not up beside the phase:
    // the objective heading is centred on the viewport, so a fixed-x readout up there
    // collides with it as soon as the window narrows.
    this.conductText = scene.add
      .text(pad, scene.scale.height - pad, "", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.label,
        color: UI.blueSoft,
      })
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);

    onResize(scene, (w, h) => this.layoutBottom(w, h), true);
    this.scheduleHintFade(scene);
  }

  /**
   * Lays out the bottom-left column against whatever the hint currently occupies.
   *
   * The hint and the inventory readout used to share a baseline from opposite ends
   * of the screen, and the hint is the widest thing the HUD draws — 113 characters,
   * about 732px at 12px type. On the ~940px canvas a 1024px display gives, the two
   * printed through each other. Wrapping the hint inside the width the inventory
   * doesn't claim fixes that; the conduct line then rides above however many lines
   * that turned out to be, and drops back to the bottom pad once the hint has gone.
   */
  private layoutBottom(width: number, height: number): void {
    const bottom = height - UI_PAD;
    this.hint.setWordWrapWidth(hintWrapWidth(width));
    this.hint.setPosition(UI_PAD, bottom);
    this.conductText.setPosition(UI_PAD, bottom - (this.hint.visible ? this.hint.height + 4 : 0));
  }

  /**
   * Retires the controls hint once it has done its job.
   *
   * `UIScene` outlives level swaps, so this runs once a session rather than once a
   * level — which is the right frequency for a teaching aid. The bindings stay
   * permanently available in the pause menu's CONTROLS tab.
   */
  private scheduleHintFade(scene: Phaser.Scene): void {
    scene.time.delayedCall(HINT_HOLD_MS, () => {
      scene.tweens.add({
        targets: this.hint,
        alpha: 0,
        duration: HINT_FADE_MS,
        onComplete: () => {
          this.hint.setVisible(false);
          this.layoutBottom(scene.scale.width, scene.scale.height);
        },
      });
    });
  }

  /**
   * @param deltaMs frame time, for the EKG sweep. 0 holds the trace still while an
   *   overlay owns the screen — see the call site in `UIScene`.
   */
  update(
    alert: { phase: AlertPhase },
    detection: number,
    hp: number,
    maxHp: number,
    deltaMs: number,
    conduct?: ConductView,
  ): void {
    this.phaseText.setText(alert.phase).setColor(PHASE_COLOR[alert.phase]);
    this.updateConduct(conduct);

    const risk = Phaser.Math.Clamp(detection, 0, 1);
    this.srpFill.width = Math.round(BAR_FILL_W * risk);
    this.srpFill.setFillStyle(
      risk > 0.66 ? hex(UI.redDeep) : risk > 0.33 ? hex(UI.amber) : hex(UI.cyan),
    );
    // Q is pinned at 0 by the NSSA; H (harm/vulnerability) and Y (yield) track risk.
    this.srpAxes.setText(`Q 0.00   H ${risk.toFixed(2)}   Y ${(risk * 0.8).toFixed(2)}`);

    this.bio.update(hp, maxHp, deltaMs);
  }

  /**
   * Whether Rowan currently passes as staff, and if not, what gave him away.
   *
   * The countdown is only shown once there's meaningfully more than the settle period
   * left — for a breach that's still happening (running, sneaking, an active alert) the
   * timer is pinned at its floor, so a ticking number there would be noise.
   */
  private updateConduct(conduct?: ConductView): void {
    if (!conduct) {
      this.conductText.setText("");
      return;
    }
    if (conduct.compliant) {
      // Call the credential out while it's held: a passive buff the player never learns
      // they have is the exact mistake this reward existed as for so long.
      //
      // CLEARED is the same argument for the keycard, and it is the only thing that
      // makes restricted ground legible to a player carrying the card. Nothing is drawn
      // in the world, so without a readout that changes on the threshold, holding the
      // right card would mean crossing every area in the game and never learning one
      // was there. It outranks CERTIFIED because it is the one that is *doing* something
      // where he is standing; the cert is a standing condition anywhere.
      const badge =
        conduct.restricted > 0 && conduct.cleared
          ? "  ·  CLEARED"
          : conduct.certified
            ? "  ·  CERTIFIED"
            : "";
      this.conductText.setText(`COMPLIANCE  OK${badge}`).setColor(UI.blueSoft);
      return;
    }
    const countdown =
      conduct.flaggedRemaining > SETTLE_SECONDS + 0.1
        ? `  ${conduct.flaggedRemaining.toFixed(1)}s`
        : "";
    this.conductText
      .setText(`COMPLIANCE  ${conduct.breach ?? "FLAGGED"}${countdown}`)
      .setColor(conduct.breach === "ALERT" ? UI.redDeep : UI.amber);
  }
}
