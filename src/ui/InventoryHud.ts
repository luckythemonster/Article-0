import Phaser from "phaser";
import { CHAFF_PACK_ITEM, THERMAL_GEL_ITEM } from "../systems/EntityStats";
import type { ActiveItemsView } from "../systems/ActiveItems";

/**
 * A compact inventory readout pinned to the bottom-right of the screen. Lists
 * the items the player has collected from chests, with the Chaff Pack and
 * Thermal Gel consumables broken out as hotkey slots ([1]/[2]) showing their
 * count and, while in use, their remaining active duration. Purely a display —
 * it reads the inventory/active-item state the scene publishes to the
 * registry and renders it; GameScene owns spending the items.
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

  update(items: string[], active: ActiveItemsView): void {
    const count = (name: string): number => items.filter((i) => i === name).length;
    const rest = items.filter((i) => i !== CHAFF_PACK_ITEM && i !== THERMAL_GEL_ITEM);

    const lines: string[] = [`INVENTORY (${items.length})`];
    lines.push(hotkeyLine(1, CHAFF_PACK_ITEM, count(CHAFF_PACK_ITEM), active.chaffRemaining));
    lines.push(hotkeyLine(2, THERMAL_GEL_ITEM, count(THERMAL_GEL_ITEM), active.thermalRemaining));
    if (items.length === 0) lines.push("(empty)");
    else lines.push(...rest.map((i) => `• ${i}`));

    const body = lines.join("\n");
    // Text.setText reflows the object; skip it when nothing changed.
    if (body === this.lastRender) return;
    this.lastRender = body;
    this.text.setText(body);
  }
}

/** Renders one hotkey slot line, e.g. "[1] Chaff Pack ×2" or "... (ACTIVE 6s)". */
function hotkeyLine(key: number, name: string, count: number, remaining: number): string {
  if (count === 0 && remaining <= 0) return `[${key}] ${name} — none`;
  const status = remaining > 0 ? ` (ACTIVE ${Math.ceil(remaining)}s)` : "";
  return `[${key}] ${name} ×${count}${status}`;
}
