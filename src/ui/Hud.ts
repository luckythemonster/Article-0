import Phaser from "phaser";
import type { AlertPhase } from "../systems/AlertState";
import { SETTLE_SECONDS, type ConductView } from "../systems/Conduct";
import { BioMonitor } from "./BioMonitor";
import { controlsHintLine } from "./Controls";
import { FONT_MONO } from "./fonts";
import { BIO_LABEL_TOP } from "./hudLayout";
import { UI, UI_DEPTH, UI_PAD, UI_TEXT, hex } from "./hudTheme";
import { onResize } from "./resize";

const PHASE_COLOR: Record<AlertPhase, string> = {
  INFILTRATION: UI.cyan,
  ALERT: UI.redDeep,
  EVASION: UI.amber,
};

/** The SRP bar: outer track, with the fill inset 1px inside it. */
const BAR_W = 180;
const BAR_H = 10;
const BAR_FILL_W = BAR_W - 2;
const BAR_FILL_H = BAR_H - 2;

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
      .text(pad, pad + 30, "SUBJECTIVITY RISK", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.small,
        color: UI.textFaint,
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);
    scene.add
      .rectangle(pad, pad + 46, BAR_W, BAR_H, hex(UI.track))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE)
      .setStrokeStyle(1, hex(UI.borderCool));
    this.srpFill = scene.add
      .rectangle(pad + 1, pad + 47, 0, BAR_FILL_H, hex(UI.cyan))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.FILL);
    this.srpAxes = scene.add
      .text(pad, pad + 59, "Q 0.00   H 0.00   Y 0.00", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.micro,
        color: UI.textDim,
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);

    // Owns its own heading and rate readout. Its height is part of the shared column
    // budget in `hudLayout`, because `AlertNetworkHud` starts where it ends.
    this.bio = new BioMonitor(scene, pad, pad + BIO_LABEL_TOP);

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
      .text(pad, scene.scale.height - pad - 18, "", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.label,
        color: UI.blueSoft,
      })
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);

    onResize(scene, (_w, h) => {
      this.hint.setPosition(pad, h - pad);
      this.conductText.setPosition(pad, h - pad - 18);
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
      this.conductText
        .setText(conduct.certified ? "COMPLIANCE  OK  ·  CERTIFIED" : "COMPLIANCE  OK")
        .setColor(UI.blueSoft);
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
