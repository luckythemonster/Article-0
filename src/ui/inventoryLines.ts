import {
  CHAFF_PACK_ITEM,
  consumableSlots,
  countConsumables,
  isKeyItem,
  MAX_CONSUMABLES,
  SACK_LUNCH_ITEM,
  THERMAL_GEL_ITEM,
} from "../systems/EntityStats";
import type { ActiveItemsView } from "../systems/ActiveItems";

/**
 * The inventory readout's text, as lines.
 *
 * Split out of {@link ../ui/InventoryHud} so the widest and tallest shapes it can
 * take are checkable without a canvas. The readout is bottom-right and grows both
 * up and leftwards, so it is one of the two widgets whose *content* decides
 * whether the HUD collides — `hudLayout.test.ts` builds the worst case from here
 * and asserts it still fits the budget. Keeping this a pure function of the state
 * is what lets that test exercise the real formatting rather than a copy of it
 * that could drift.
 */
export function inventoryLines(
  items: string[],
  active: ActiveItemsView,
  selected: string | undefined,
): string[] {
  const lines: string[] = [];

  // --- CONSUMABLES: the item cursor's list, in canonical order ---
  lines.push(`CONSUMABLES (${countConsumables(items)}/${MAX_CONSUMABLES})`);
  const slots = consumableSlots(items);
  if (slots.length === 0) lines.push("(none)");
  else {
    for (const s of slots) {
      const remaining = activeRemaining(s.name, active);
      const status =
        remaining > 0
          ? ` (ACTIVE ${Math.ceil(remaining)}s)`
          : // The Sack Lunch has state instead of a timer, and the open state
            // costs the player something — so it gets the same slot's worth of
            // attention the timed buffs get.
            s.name === SACK_LUNCH_ITEM && active.sackLunchOpened
            ? " (OPENED)"
            : "";
      const cursor = s.name === selected ? "▸" : " ";
      lines.push(`${cursor} ${s.name} ×${s.count}${status}`);
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

  return lines;
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
