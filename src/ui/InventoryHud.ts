import Phaser from "phaser";
import type { ActiveItemsView } from "../systems/ActiveItems";
import { FONT_MONO } from "./fonts";
import { PANEL_INSET } from "./hudLayout";
import { UI, UI_DEPTH, UI_PAD, UI_TEXT } from "./hudTheme";
import { inventoryLines } from "./inventoryLines";
import { placePanel, uiPanel } from "./NineSlicePanel";
import { SCREEN_ON } from "./NetworkPanel";
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
  private readonly panel: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Rectangle;
  private lastRender = "";

  constructor(scene: Phaser.Scene) {
    const pad = UI_PAD;

    // Created before the text so it sorts underneath at equal depth, though
    // UI_DEPTH.PANEL already puts it there. Plain lit chrome — the indicator
    // sheet belongs to the alert-network readout alone.
    this.panel = uiPanel(scene, 0, 0, 1, 1, { frame: SCREEN_ON });

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

    onResize(scene, (w, h) => {
      this.text.setPosition(w - pad, h - pad);
      this.fitPanel();
    });

    this.fitPanel();
  }

  /**
   * Wraps the panel around whatever the readout currently says.
   *
   * The text is bottom-right anchored and its box changes with the inventory, so
   * the panel is derived from the text's measured bounds rather than a budget.
   * Nine-slice is what makes that cheap — the border is reproduced at any size
   * instead of being redrawn — and it is why the strip can gain a frame without
   * `inventoryLines` learning anything about panels.
   *
   * Hidden entirely while the readout is empty: an empty inventory would
   * otherwise leave a bare 24px box of trim sitting in the corner.
   */
  private fitPanel(): void {
    const empty = this.lastRender.length === 0;
    this.panel.setVisible(!empty);
    if (empty) return;

    const w = this.text.width + PANEL_INSET * 2;
    const h = this.text.height + PANEL_INSET * 2;
    placePanel(this.panel, this.text.x - this.text.width - PANEL_INSET, this.text.y - this.text.height - PANEL_INSET, w, h);
  }

  update(items: string[], active: ActiveItemsView, selected: string | undefined): void {
    const body = inventoryLines(items, active, selected).join("\n");
    // Text.setText reflows the object; skip it when nothing changed.
    if (body === this.lastRender) return;
    this.lastRender = body;
    this.text.setText(body);
    // After setText, so the bounds are the new ones.
    this.fitPanel();
  }
}
