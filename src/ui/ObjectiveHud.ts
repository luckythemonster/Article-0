import Phaser from "phaser";
import {
  objectiveLines,
  type MissionFeatures,
  type ObjectiveState,
} from "../systems/Objectives";
import { FONT_MONO } from "./fonts";
import { onResize } from "./resize";
import { OBJECTIVE_BODY_TOP, OBJECTIVE_TOP } from "./hudLayout";

/**
 * A compact objective tracker pinned to the top-centre of the screen. Reads the
 * objective state the scene publishes to the registry and renders each line with
 * a ✓/○ marker; turns green once the whole directive is complete.
 */
export class ObjectiveHud {
  private readonly heading: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private last = "";

  constructor(scene: Phaser.Scene) {
    this.heading = scene.add
      .text(0, OBJECTIVE_TOP, "▸ DIRECTIVE · SMUGGLE EIRA-7", {
        fontFamily: FONT_MONO,
        fontSize: "11px",
        color: "#8899aa",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.body = scene.add
      .text(0, OBJECTIVE_BODY_TOP, "", {
        fontFamily: FONT_MONO,
        fontSize: "12px",
        color: "#cfe0f0",
        align: "center",
        lineSpacing: 2,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000);

    const layout = (w: number): void => {
      this.heading.setPosition(w / 2, OBJECTIVE_TOP);
      this.body.setPosition(w / 2, OBJECTIVE_BODY_TOP);
    };
    onResize(scene, (w) => layout(w), true);
  }

  update(state: ObjectiveState, currentLevel: string, features: MissionFeatures): void {
    const lines = objectiveLines(state, currentLevel, features);
    const text = lines.map((l) => `${l.done ? "✓" : "○"} ${l.label}`).join("\n");
    if (text === this.last) return;
    this.last = text;
    this.body.setText(text);
    this.body.setColor(lines.every((l) => l.done) ? "#8effc0" : "#cfe0f0");
  }
}
