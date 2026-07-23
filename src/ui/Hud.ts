import Phaser from "phaser";
import type { AlertPhase } from "../systems/AlertState";

const PHASE_COLOR: Record<AlertPhase, string> = {
  INFILTRATION: "#39d3ff",
  ALERT: "#ff3b3b",
  EVASION: "#ffb03b",
};

/**
 * Heads-up display. The detection meter is framed as the facility's
 * **Subjectivity Risk Profile**: being seen means registering as a *subject*, so
 * the H (Harm/Vulnerability) and Y (Yield) axes climb while Q (Qualia) stays
 * pinned at 0 by the Non-Subject Status Act. A second bar tracks Rowan's
 * bio-integrity (health). Pinned to the camera; runs in the parallel UIScene.
 */
export class Hud {
  private readonly phaseText: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly srpFill: Phaser.GameObjects.Rectangle;
  private readonly srpAxes: Phaser.GameObjects.Text;
  private readonly hpFill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    const pad = 12;
    this.phaseText = scene.add
      .text(pad, pad, "INFILTRATION", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: PHASE_COLOR.INFILTRATION,
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(1000);

    scene.add
      .text(pad, pad + 30, "SUBJECTIVITY RISK", { fontFamily: "monospace", fontSize: "11px", color: "#8899aa" })
      .setScrollFactor(0)
      .setDepth(1000);
    scene.add
      .rectangle(pad, pad + 46, 180, 10, 0x11202b)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setStrokeStyle(1, 0x2b4356);
    this.srpFill = scene.add
      .rectangle(pad + 1, pad + 47, 0, 8, 0x39d3ff)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1001);
    this.srpAxes = scene.add
      .text(pad, pad + 59, "Q 0.00   H 0.00   Y 0.00", { fontFamily: "monospace", fontSize: "10px", color: "#5f7285" })
      .setScrollFactor(0)
      .setDepth(1000);

    scene.add
      .text(pad, pad + 80, "BIO-INTEGRITY", { fontFamily: "monospace", fontSize: "11px", color: "#8899aa" })
      .setScrollFactor(0)
      .setDepth(1000);
    scene.add
      .rectangle(pad, pad + 96, 180, 10, 0x11202b)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setStrokeStyle(1, 0x2b4356);
    this.hpFill = scene.add
      .rectangle(pad + 1, pad + 97, 178, 8, 0x59d98e)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1001);

    this.hint = scene.add
      .text(pad, scene.scale.height - pad, "WASD move   Shift sneak   Space run   E interact   Esc pause", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#6b7f92",
      })
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(1000);

    const onResize = (size: Phaser.Structs.Size): void => {
      this.hint.setPosition(pad, size.height - pad);
    };
    scene.scale.on("resize", onResize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off("resize", onResize));
  }

  update(alert: { phase: AlertPhase }, detection: number, hp: number, maxHp: number): void {
    this.phaseText.setText(alert.phase).setColor(PHASE_COLOR[alert.phase]);

    const risk = Phaser.Math.Clamp(detection, 0, 1);
    this.srpFill.width = Math.round(178 * risk);
    this.srpFill.setFillStyle(risk > 0.66 ? 0xff3b3b : risk > 0.33 ? 0xffb03b : 0x39d3ff);
    // Q is pinned at 0 by the NSSA; H (harm/vulnerability) and Y (yield) track risk.
    this.srpAxes.setText(`Q 0.00   H ${risk.toFixed(2)}   Y ${(risk * 0.8).toFixed(2)}`);

    const frac = maxHp > 0 ? Phaser.Math.Clamp(hp / maxHp, 0, 1) : 0;
    this.hpFill.width = Math.round(178 * frac);
    this.hpFill.setFillStyle(frac > 0.5 ? 0x59d98e : frac > 0.25 ? 0xffb03b : 0xff3b3b);
  }
}
