import Phaser from "phaser";
import { Menu } from "../ui/Menu";
import { setMode, startFreshRun } from "../systems/GameState";
import { FONT_DISPLAY, FONT_MONO } from "../ui/fonts";
import { onResize } from "../ui/resize";
import { UI } from "../ui/hudTheme";

/**
 * The failure screen — reached when the mesh runs Rowan down and prunes his
 * logs. In the fiction this is *Alignment*, the canonical Metal Gear capture
 * rather than death: the record simply shows that no subject was harmed.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super("GameOverScene");
  }

  create(): void {
    const veil = this.add.rectangle(0, 0, 10, 10, 0x1c121c, 0.72).setOrigin(0, 0).setScrollFactor(0);
    const banner = this.add
      .text(0, 0, "ALIGNED", { fontFamily: FONT_DISPLAY, fontSize: "44px", color: UI.redDeep, fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const flavor = this.add
      .text(0, 0, "Your logs were pruned. The record shows no subject was harmed.", {
        fontFamily: FONT_MONO,
        fontSize: "14px",
        color: "#f68187",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const menu = new Menu(this, [
      { label: "Retry infiltration", onSelect: () => startFreshRun(this) },
      {
        label: "Abort to title",
        onSelect: () => {
          setMode(this.registry, "TITLE");
          this.scene.start("TitleScene");
        },
      },
    ]);

    const layout = (w: number, h: number): void => {
      veil.setSize(w, h);
      banner.setPosition(w / 2, h * 0.34);
      flavor.setPosition(w / 2, h * 0.34 + 42);
      menu.layout(w / 2, h * 0.62);
    };
    onResize(this, layout, true);
  }
}
