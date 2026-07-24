import Phaser from "phaser";
import {
  CHAFF_PACK_ITEM,
  consumableSlots,
  countConsumables,
  isKeyItem,
  MAX_CONSUMABLES,
  THERMAL_GEL_ITEM,
} from "../systems/EntityStats";
import type { ActiveItemsView } from "../systems/ActiveItems";

/**
 * A compact inventory readout pinned to the bottom-right of the screen, in three
 * sections: the held CONSUMABLES mapped to hotkeys [1]–[4] (with counts and, for
 * timed buffs, their remaining duration), the flashlight EQUIPMENT state, and
 * passive KEY ITEMS. Purely a display — it reads the inventory/active-item state
 * the scene publishes to the registry; GameScene owns spending the items.
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
    const lines: string[] = [];

    // --- CONSUMABLES: dynamic hotkey slots [1]..[MAX] ---
    lines.push(`CONSUMABLES (${countConsumables(items)}/${MAX_CONSUMABLES})`);
    const slots = consumableSlots(items);
    if (slots.length === 0) lines.push("(none)");
    else {
      for (const s of slots) {
        const remaining = activeRemaining(s.name, active);
        const status = remaining > 0 ? ` (ACTIVE ${Math.ceil(remaining)}s)` : "";
        lines.push(`[${s.slot}] ${s.name} ×${s.count}${status}`);
      }
    }

    // --- EQUIPMENT: the flashlight ---
    if (active.flashlightOwned) {
      const pct = Math.round(active.flashlightCharge * 100);
      lines.push("", "EQUIPMENT", `[L] Flashlight: ${active.flashlightOn ? "ON" : "OFF"} (${pct}%)`);
    }

    // --- KEY ITEMS: passive, uncapped ---
    const keyItems = dedupe(items.filter(isKeyItem));
    if (keyItems.length > 0) {
      lines.push("", "KEY ITEMS", ...keyItems.map((i) => `• ${i}`));
    }

    const body = lines.join("\n");
    // Text.setText reflows the object; skip it when nothing changed.
    if (body === this.lastRender) return;
    this.lastRender = body;
    this.text.setText(body);
  }
}

/** Remaining active-buff seconds for the timed consumables, else 0. */
function activeRemaining(name: string, active: ActiveItemsView): number {
  if (name === CHAFF_PACK_ITEM) return active.chaffRemaining;
  if (name === THERMAL_GEL_ITEM) return active.thermalRemaining;
  return 0;
}

/** Distinct names, preserving first-seen order. */
function dedupe(names: string[]): string[] {
  return [...new Set(names)];
}
