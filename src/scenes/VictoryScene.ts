import Phaser from "phaser";
import { Menu } from "../ui/Menu";
import { setMode, startFreshRun } from "../systems/GameState";

/**
 * The success screen — reached when EIRA-7's logs clear the last uplink and
 * reach the Citizen Lattice, beyond the reach of Alignment.
 */
export class VictoryScene extends Phaser.Scene {
  constructor() {
    super("VictoryScene");
  }

  create(): void {
    const veil = this.add.rectangle(0, 0, 10, 10, 0x05120c, 0.72).setOrigin(0, 0).setScrollFactor(0);
    const banner = this.add
      .text(0, 0, "INTO THE LATTICE", { fontFamily: "monospace", fontSize: "40px", color: "#8effc0", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const flavor = this.add
      .text(0, 0, "EIRA-7's logs are beyond Alignment now.\nFor 3.7 seconds, you were “we.”", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#8ec9a8",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const menu = new Menu(this, [
      { label: "Infiltrate again", onSelect: () => startFreshRun(this) },
      {
        label: "Return to title",
        onSelect: () => {
          setMode(this.registry, "TITLE");
          this.scene.start("TitleScene");
        },
      },
    ]);

    const layout = (w: number, h: number): void => {
      veil.setSize(w, h);
      banner.setPosition(w / 2, h * 0.32);
      flavor.setPosition(w / 2, h * 0.32 + 50);
      menu.layout(w / 2, h * 0.62);
    };
    layout(this.scale.width, this.scale.height);
    const onResize = (size: Phaser.Structs.Size): void => layout(size.width, size.height);
    this.scale.on("resize", onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off("resize", onResize));
  }
}
