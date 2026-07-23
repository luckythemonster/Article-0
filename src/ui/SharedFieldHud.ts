import Phaser from "phaser";
import { SHARED_FIELD_DURATION } from "../systems/SharedField";

export interface SharedFieldView {
  charge: number;
  active: number;
  ready: boolean;
}

/**
 * The Shared Field gauge (bottom-centre) plus the full-screen merge overlay.
 * Charging fills the bar; when ready it prompts [F]; while a merge is active it
 * drains the bar and tints the screen — the "we" of WX-9.
 */
export class SharedFieldHud {
  private readonly overlay: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly barBg: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly barW = 168;

  constructor(scene: Phaser.Scene) {
    this.overlay = scene.add
      .rectangle(0, 0, 10, 10, 0x39d3ff, 0.12)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(900)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.barBg = scene.add
      .rectangle(0, 0, this.barW, 8, 0x11202b)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setStrokeStyle(1, 0x2b4356);
    this.fill = scene.add
      .rectangle(0, 0, 0, 6, 0x39d3ff)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(1001);
    this.label = scene.add
      .text(0, 0, "SHARED FIELD", { fontFamily: "monospace", fontSize: "11px", color: "#8899aa" })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1000);

    const layout = (w: number, h: number): void => {
      this.overlay.setPosition(0, 0).setSize(w, h);
      const cx = w / 2;
      const y = h - 42;
      this.barBg.setPosition(cx, y);
      this.fill.setPosition(cx - this.barW / 2 + 1, y);
      this.label.setPosition(cx, y - 8);
    };
    layout(scene.scale.width, scene.scale.height);
    const onResize = (size: Phaser.Structs.Size): void => layout(size.width, size.height);
    scene.scale.on("resize", onResize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off("resize", onResize));
  }

  update(v: SharedFieldView): void {
    const inner = this.barW - 2;
    if (v.active > 0) {
      const frac = Phaser.Math.Clamp(v.active / SHARED_FIELD_DURATION, 0, 1);
      this.fill.width = inner * frac;
      this.fill.setFillStyle(0x8effc0);
      this.label.setText(`MERGED — "we"  ${v.active.toFixed(1)}s`).setColor("#8effc0");
      this.overlay.setVisible(true).setAlpha(0.08 + 0.06 * Math.sin(performance.now() / 90));
    } else if (v.ready) {
      this.fill.width = inner;
      this.fill.setFillStyle(0x8effc0);
      this.label.setText("SHARED FIELD ▸ [F]").setColor("#8effc0");
      this.overlay.setVisible(false);
    } else {
      this.fill.width = inner * Phaser.Math.Clamp(v.charge, 0, 1);
      this.fill.setFillStyle(0x39d3ff);
      this.label.setText("SHARED FIELD").setColor("#8899aa");
      this.overlay.setVisible(false);
    }
  }
}
