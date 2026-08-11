import Phaser from "phaser";
import type { ActiveItemsView } from "../systems/ActiveItems";
import { FONT_MONO } from "./fonts";
import { UI, UI_DEPTH, UI_PAD, UI_TEXT } from "./hudTheme";
import { inventoryLines } from "./inventoryLines";
import { onResize } from "./resize";

/**
 * A compact inventory readout pinned to the bottom-right of the screen, in three
 * sections: the held CONSUMABLES (with counts and, for timed buffs, their
 * remaining duration) with a cursor (▸) on whichever one `,`/`.` has selected
 * and `Enter` would use, the flashlight EQUIPMENT state, and passive KEY ITEMS.
 * Purely a display — it reads the inventory/active-item/selection state the
 * scene publishes to the registry; GameScene owns spending the items.
 *
 * The text itself is built by {@link inventoryLines}, which is a pure function so
 * that `hudLayout.test.ts` can check the widest and tallest shapes this can take
 * against the bottom-right budget without standing up a canvas.
 */
export class InventoryHud {
  private readonly text: Phaser.GameObjects.Text;
  private lastRender = "";

  constructor(scene: Phaser.Scene) {
    const pad = UI_PAD;
    this.text = scene.add
      .text(scene.scale.width - pad, scene.scale.height - pad, "", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.label,
        color: UI.textStrong,
        align: "right",
        lineSpacing: 2,
      })
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);

    onResize(scene, (w, h) => this.text.setPosition(w - pad, h - pad));
  }

  update(items: string[], active: ActiveItemsView, selected: string | undefined): void {
    const body = inventoryLines(items, active, selected).join("\n");
    // Text.setText reflows the object; skip it when nothing changed.
    if (body === this.lastRender) return;
    this.lastRender = body;
    this.text.setText(body);
  }
}
