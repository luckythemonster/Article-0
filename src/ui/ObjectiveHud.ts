import Phaser from "phaser";
import { objectiveLines, type ObjectiveState } from "../systems/Objectives";

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
      .text(0, 10, "▸ DIRECTIVE · SMUGGLE EIRA-7", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#8899aa",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000);
    this.body = scene.add
      .text(0, 28, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#cfe0f0",
        align: "center",
        lineSpacing: 2,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000);

    const layout = (w: number): void => {
      this.heading.setPosition(w / 2, 10);
      this.body.setPosition(w / 2, 28);
    };
    layout(scene.scale.width);
    const onResize = (size: Phaser.Structs.Size): void => layout(size.width);
    scene.scale.on("resize", onResize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off("resize", onResize));
  }

  update(state: ObjectiveState, currentLevel: string): void {
    const lines = objectiveLines(state, currentLevel);
    const text = lines.map((l) => `${l.done ? "✓" : "○"} ${l.label}`).join("\n");
    if (text === this.last) return;
    this.last = text;
    this.body.setText(text);
    this.body.setColor(lines.every((l) => l.done) ? "#8effc0" : "#cfe0f0");
  }
}
