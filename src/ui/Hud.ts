import Phaser from "phaser";
import type { AlertPhase } from "../systems/AlertState";

const PHASE_COLOR: Record<AlertPhase, string> = {
  INFILTRATION: "#39d3ff",
  ALERT: "#ff3b3b",
  EVASION: "#ffb03b",
};

/**
 * Minimal heads-up display: current alert phase and a detection meter showing
 * the highest suspicion across all guards. Pinned to the camera so it stays put
 * as the world scrolls. (A Soliton-style radar minimap is a later phase.)
 */
export class Hud {
  private readonly phaseText: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly meterFill: Phaser.GameObjects.Rectangle;

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
      .text(pad, pad + 30, "DETECTION", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#8899aa",
      })
      .setScrollFactor(0)
      .setDepth(1000);

    scene.add
      .rectangle(pad, pad + 46, 180, 10, 0x11202b)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setStrokeStyle(1, 0x2b4356);
    this.meterFill = scene.add
      .rectangle(pad + 1, pad + 47, 0, 8, 0x39d3ff)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1001);

    this.hint = scene.add
      .text(pad, scene.scale.height - pad, "WASD/Arrows move   Shift sneak   Space run", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#6b7f92",
      })
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(1000);
    scene.scale.on("resize", (gameSize: Phaser.Structs.Size) => {
      this.hint.setPosition(pad, gameSize.height - pad);
    });
  }

  update(alert: { phase: AlertPhase }, detection: number): void {
    this.phaseText.setText(alert.phase).setColor(PHASE_COLOR[alert.phase]);

    const width = Math.round(178 * Phaser.Math.Clamp(detection, 0, 1));
    this.meterFill.width = width;
    const color = detection > 0.66 ? 0xff3b3b : detection > 0.33 ? 0xffb03b : 0x39d3ff;
    this.meterFill.setFillStyle(color);
  }
}
