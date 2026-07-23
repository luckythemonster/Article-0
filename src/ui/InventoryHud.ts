import Phaser from "phaser";

/**
 * A compact inventory readout pinned to the bottom-right of the screen. Lists
 * the items the player has collected from chests. Purely a display — it reads
 * the item list the scene publishes to the registry and renders it; item
 * effects are a later phase.
 */
export class InventoryHud {
  private readonly text: Phaser.GameObjects.Text;
  private lastRender = "";

  constructor(scene: Phaser.Scene) {
    const pad = 12;
    this.text = scene.add
      .text(scene.scale.width - pad, scene.scale.height - pad, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#cfe0f0",
        align: "right",
        lineSpacing: 2,
      })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(1000);

    const onResize = (size: Phaser.Structs.Size): void => {
      this.text.setPosition(size.width - pad, size.height - pad);
    };
    scene.scale.on("resize", onResize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off("resize", onResize));
  }

  update(items: string[]): void {
    const body =
      items.length === 0
        ? "INVENTORY\n(empty)"
        : `INVENTORY (${items.length})\n${items.map((i) => `• ${i}`).join("\n")}`;
    // Text.setText reflows the object; skip it when nothing changed.
    if (body === this.lastRender) return;
    this.lastRender = body;
    this.text.setText(body);
  }
}
