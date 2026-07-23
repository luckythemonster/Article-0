import Phaser from "phaser";

/**
 * A passive pause overlay. GameScene owns the pause *state* — it freezes its own
 * sim and physics and reads the resume/abort keys — so this scene is purely
 * visual: a dim veil, a banner and the key hints, launched on top of the frozen
 * GameScene and stopped when it resumes.
 */
export class PauseScene extends Phaser.Scene {
  constructor() {
    super("PauseScene");
  }

  create(): void {
    const veil = this.add.rectangle(0, 0, 10, 10, 0x05070a, 0.55).setOrigin(0, 0).setScrollFactor(0);
    const banner = this.add
      .text(0, 0, "PAUSED", { fontFamily: "monospace", fontSize: "36px", color: "#39d3ff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const hint = this.add
      .text(0, 0, "Esc — resume     Q — abort to title", { fontFamily: "monospace", fontSize: "14px", color: "#8899aa" })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const layout = (w: number, h: number): void => {
      veil.setSize(w, h);
      banner.setPosition(w / 2, h / 2 - 16);
      hint.setPosition(w / 2, h / 2 + 24);
    };
    layout(this.scale.width, this.scale.height);
    const onResize = (size: Phaser.Structs.Size): void => layout(size.width, size.height);
    this.scale.on("resize", onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off("resize", onResize));
  }
}
