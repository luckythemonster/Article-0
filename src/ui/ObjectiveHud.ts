import Phaser from "phaser";
import {
  objectiveLines,
  type MissionFeatures,
  type ObjectiveState,
} from "../systems/Objectives";
import { FONT_MONO } from "./fonts";
import { onResize } from "./resize";
import {
  OBJECTIVE_BODY_TOP,
  OBJECTIVE_TOP,
  objectiveCentre,
  objectiveWrapWidth,
} from "./hudLayout";
import { UI, UI_DEPTH, UI_TEXT } from "./hudTheme";

/**
 * A compact objective tracker pinned to the top-centre of the screen. Reads the
 * objective state the scene publishes to the registry and renders each line with
 * a ✓/○ marker; turns green once the whole directive is complete.
 *
 * "Top-centre" means centred on the space between the status stack and the radar,
 * not on the viewport — see {@link objectiveCentre}. On a wide canvas those are the
 * same place; on a narrow one they are not, and the difference is the directive
 * printing through the SRP meter.
 */
export class ObjectiveHud {
  private readonly scene: Phaser.Scene;
  private readonly heading: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private last = "";

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.heading = scene.add
      .text(0, OBJECTIVE_TOP, "▸ DIRECTIVE · SMUGGLE EIRA-7", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.small,
        color: UI.textFaint,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);
    this.body = scene.add
      .text(0, OBJECTIVE_BODY_TOP, "", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.label,
        color: UI.textStrong,
        align: "center",
        lineSpacing: 2,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);

    onResize(scene, () => this.layout(), true);
  }

  /**
   * Re-centres both rows against the space available.
   *
   * Runs on resize *and* after every text change, because the block's width is
   * what decides whether the screen centre is usable and the directive grows and
   * shrinks as objectives complete.
   */
  private layout(): void {
    const width = this.scene.scale.width;
    this.body.setWordWrapWidth(objectiveWrapWidth(width));
    const cx = objectiveCentre(width, Math.max(this.body.width, this.heading.width));
    this.heading.setPosition(cx, OBJECTIVE_TOP);
    this.body.setPosition(cx, OBJECTIVE_BODY_TOP);
  }

  update(state: ObjectiveState, currentLevel: string, features: MissionFeatures): void {
    const lines = objectiveLines(state, currentLevel, features);
    const text = lines.map((l) => `${l.done ? "✓" : "○"} ${l.label}`).join("\n");
    if (text === this.last) return;
    this.last = text;
    this.body.setText(text);
    this.body.setColor(lines.every((l) => l.done) ? UI.greenSoft : UI.textStrong);
    this.layout();
  }
}
