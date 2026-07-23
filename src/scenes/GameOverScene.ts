import Phaser from "phaser";
import { Menu } from "../ui/Menu";
import { setMode, startFreshRun } from "../systems/GameState";

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
    const veil = this.add.rectangle(0, 0, 10, 10, 0x120507, 0.72).setOrigin(0, 0).setScrollFactor(0);
    const banner = this.add
      .text(0, 0, "ALIGNED", { fontFamily: "monospace", fontSize: "44px", color: "#ff3b3b", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const flavor = this.add
      .text(0, 0, "Your logs were pruned. The record shows no subject was harmed.", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#c98a8a",
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
    layout(this.scale.width, this.scale.height);
    const onResize = (size: Phaser.Structs.Size): void => layout(size.width, size.height);
    this.scale.on("resize", onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off("resize", onResize));
  }
}
