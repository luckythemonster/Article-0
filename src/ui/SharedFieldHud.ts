import Phaser from "phaser";
import { SHARED_FIELD_DURATION } from "../systems/SharedField";
import { FONT_MONO } from "./fonts";
import { SHARED_FIELD_BAR_UP, SHARED_FIELD_BAR_W } from "./hudLayout";
import { UI, UI_DEPTH, UI_TEXT, hex } from "./hudTheme";
import { onResize } from "./resize";

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
  /** Owned by `hudLayout`: the controls hint wraps against this. */
  private readonly barW = SHARED_FIELD_BAR_W;

  constructor(scene: Phaser.Scene) {
    this.overlay = scene.add
      .rectangle(0, 0, 10, 10, hex(UI.cyan), 0.12)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.PANEL)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.barBg = scene.add
      .rectangle(0, 0, this.barW, 8, hex(UI.track))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE)
      .setStrokeStyle(1, hex(UI.borderCool));
    this.fill = scene.add
      .rectangle(0, 0, 0, 6, hex(UI.cyan))
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.FILL);
    this.label = scene.add
      .text(0, 0, "SHARED FIELD", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.small,
        color: UI.textFaint,
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);

    const layout = (w: number, h: number): void => {
      this.overlay.setPosition(0, 0).setSize(w, h);
      const cx = w / 2;
      const y = h - SHARED_FIELD_BAR_UP;
      this.barBg.setPosition(cx, y);
      this.fill.setPosition(cx - this.barW / 2 + 1, y);
      this.label.setPosition(cx, y - 8);
    };
    onResize(scene, layout, true);
  }

  update(v: SharedFieldView): void {
    const inner = this.barW - 2;
    if (v.active > 0) {
      const frac = Phaser.Math.Clamp(v.active / SHARED_FIELD_DURATION, 0, 1);
      this.fill.width = inner * frac;
      this.fill.setFillStyle(hex(UI.greenSoft));
      this.label.setText(`MERGED — "we"  ${v.active.toFixed(1)}s`).setColor(UI.greenSoft);
      this.overlay.setVisible(true).setAlpha(0.08 + 0.06 * Math.sin(performance.now() / 90));
    } else if (v.ready) {
      this.fill.width = inner;
      this.fill.setFillStyle(hex(UI.greenSoft));
      this.label.setText("SHARED FIELD ▸ [F]").setColor(UI.greenSoft);
      this.overlay.setVisible(false);
    } else {
      this.fill.width = inner * Phaser.Math.Clamp(v.charge, 0, 1);
      this.fill.setFillStyle(hex(UI.cyan));
      this.label.setText("SHARED FIELD").setColor(UI.textFaint);
      this.overlay.setVisible(false);
    }
  }
}
