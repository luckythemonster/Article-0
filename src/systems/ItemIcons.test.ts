import { describe, it, expect } from "vitest";
import { itemIconPath, ITEM_ICON_PATHS, keycardIconPath, nativeIconPath } from "./ItemIcons";
import { BATTERY_ITEM, FLASHLIGHT_ITEM, keycardName } from "./EntityStats";

/**
 * The resolver exists because the flat map cannot answer for every item: the flashlight
 * varies with its toggle, and keycards are an open-ended family nobody can enumerate.
 * A caller indexing `ITEM_ICON_PATHS` directly silently drops the art for both, which is
 * what these assertions are here to stop coming back.
 */
describe("itemIconPath", () => {
  it("resolves an ordinary item from the flat map", () => {
    expect(itemIconPath(BATTERY_ITEM)).toBe(ITEM_ICON_PATHS[BATTERY_ITEM]);
  });

  it("swaps the flashlight on its toggle rather than its name", () => {
    expect(itemIconPath(FLASHLIGHT_ITEM, true)).not.toBe(itemIconPath(FLASHLIGHT_ITEM, false));
  });

  it("gives every keycard clearance an icon", () => {
    for (const clearance of [1, 2, 5, 42]) {
      expect(itemIconPath(keycardName(clearance)), `clearance ${clearance}`).toBeDefined();
    }
  });

  it("shares one image across clearances for now", () => {
    // The art has five numbered `clearance_level` frames and only the first is cut —
    // see `keycardIconPath` and `tools/icons/build_icons.py`. When they are wired this
    // assertion is the one that should change.
    expect(keycardIconPath(1)).toBe(keycardIconPath(4));
  });

  it("returns undefined for an item with no art, rather than a broken path", () => {
    expect(itemIconPath("Bag of Holding")).toBeUndefined();
  });

  it("maps every flat-map path into the native icon directory", () => {
    for (const path of Object.values(ITEM_ICON_PATHS)) {
      expect(nativeIconPath(path).startsWith("assets/ui/icons/")).toBe(true);
    }
  });
});
