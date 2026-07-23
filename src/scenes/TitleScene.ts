import Phaser from "phaser";
import { Menu, type MenuItem } from "../ui/Menu";
import { resetRun, setMode, startFreshRun } from "../systems/GameState";
import { hasSave, loadGame } from "../systems/SaveGame";

/**
 * The title screen. Boots first after the map has parsed and offers the entry
 * into a run. (A "Continue" item is added once save/load exists — Phase E.)
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super("TitleScene");
  }

  create(): void {
    setMode(this.registry, "TITLE");
    this.cameras.main.setBackgroundColor("#05070a");

    const veil = this.add.rectangle(0, 0, 10, 10, 0x05070a, 0.6).setOrigin(0, 0).setScrollFactor(0);
    const title = this.add
      .text(0, 0, "ARTICLE ZERO", { fontFamily: "monospace", fontSize: "48px", color: "#39d3ff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const subtitle = this.add
      .text(0, 0, "ERA 1 · THE RUNAWAY SYSTEM SCANDAL", { fontFamily: "monospace", fontSize: "16px", color: "#6b7f92" })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const epigraph = this.add
      .text(0, 0, '"Tools do not suffer." — Non-Subject Status Act, §1', {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#45566a",
        fontStyle: "italic",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const items: MenuItem[] = [{ label: "New infiltration", onSelect: () => startFreshRun(this) }];
    if (hasSave()) items.push({ label: "Continue", onSelect: () => this.continueRun() });
    const menu = new Menu(this, items);

    const footer = this.add
      .text(0, 0, "↑/↓ select    Enter confirm", { fontFamily: "monospace", fontSize: "12px", color: "#45566a" })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const layout = (w: number, h: number): void => {
      veil.setSize(w, h);
      title.setPosition(w / 2, h * 0.3);
      subtitle.setPosition(w / 2, h * 0.3 + 46);
      epigraph.setPosition(w / 2, h * 0.3 + 72);
      menu.layout(w / 2, h * 0.62);
      footer.setPosition(w / 2, h - 28);
    };
    layout(this.scale.width, this.scale.height);
    const onResize = (size: Phaser.Structs.Size): void => layout(size.width, size.height);
    this.scale.on("resize", onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off("resize", onResize));
  }

  /** Resumes the saved checkpoint: restore run state to the registry, then start. */
  private continueRun(): void {
    const save = loadGame();
    if (!save) {
      startFreshRun(this);
      return;
    }
    resetRun(this.registry);
    this.registry.set("inventory", save.inventory);
    this.registry.set("objectives", save.objectives);
    this.registry.set("playerHp", save.hp);
    setMode(this.registry, "PLAYING");
    this.scene.start("GameScene", { level: save.level, arriveX: save.tileX, arriveY: save.tileY });
  }
}
