import { describe, it, expect } from "vitest";
import { catalogedNames } from "../systems/ItemCatalog";
import { CONSUMABLE_ORDER, MAX_CONSUMABLES, isKeyItem } from "../systems/EntityStats";
import { controlsHintLine } from "./Controls";
import { inventoryLines } from "./inventoryLines";
import {
  INVENTORY_MAX_CHARS,
  INVENTORY_RESERVE_W,
  INVENTORY_TOP_LIMIT,
  MIN_CANVAS_H,
  MIN_CANVAS_W,
  RADAR_BOTTOM,
  hintWrapWidth,
  monoWidth,
} from "./hudLayout";
import { UI_PAD } from "./hudTheme";

/**
 * The HUD's budget guard.
 *
 * Every collision this file checks for has already happened once. The directive
 * grew to five lines and ran through the encounter title; the debug inspector was
 * drawn on top of the radar; the controls hint and the inventory readout printed
 * through each other on any canvas narrower than about 960px, which is most
 * laptops. None of them were catchable in a diff, because in each case no single
 * file was wrong — two files were each individually reasonable and jointly
 * impossible.
 *
 * So the arithmetic is asserted here, against the *real* content: the widest line
 * the inventory can build from the actual item catalogue, the real controls hint
 * string. A new item with a long name, or a tenth binding on the hint, fails the
 * build rather than the screen.
 */

/** `InventoryHud`'s rendered line height: 12px type plus its 2px `lineSpacing`. */
const INVENTORY_LINE_HEIGHT = 14;

/** Every consumable held at once, one of them stacked to the cap, all buffs running. */
function worstCaseInventory(): string[] {
  const items: string[] = [];
  // Distinct types drive the line *count*; a full stack drives the widest count suffix.
  for (const name of CONSUMABLE_ORDER) items.push(name);
  for (let i = 1; i < MAX_CONSUMABLES; i++) items.push(CONSUMABLE_ORDER[0]);
  // Key items are uncapped and the catalogue is the whole universe of them.
  for (const name of catalogedNames()) if (isKeyItem(name)) items.push(name);
  return items;
}

const WORST_LINES = inventoryLines(
  worstCaseInventory(),
  {
    chaffRemaining: 99,
    thermalRemaining: 99,
    flashlightOwned: true,
    flashlightOn: false,
    flashlightCharge: 1,
    sackLunchOpened: true,
  },
  CONSUMABLE_ORDER[0],
);

describe("hudLayout: the bottom-right inventory", () => {
  it("never renders a line wider than its reserved column", () => {
    const widest = WORST_LINES.reduce((n, l) => Math.max(n, l.length), 0);
    expect(
      widest,
      `widest inventory line is ${widest} chars: ${JSON.stringify(
        WORST_LINES.find((l) => l.length === widest),
      )}`,
    ).toBeLessThanOrEqual(INVENTORY_MAX_CHARS);
  });

  it("never grows up into the radar", () => {
    const height = WORST_LINES.length * INVENTORY_LINE_HEIGHT;
    const top = MIN_CANVAS_H - UI_PAD - height;
    expect(
      top,
      `${WORST_LINES.length} lines reach y=${top}, above the radar's ${INVENTORY_TOP_LIMIT}`,
    ).toBeGreaterThanOrEqual(INVENTORY_TOP_LIMIT);
  });
});

describe("hudLayout: the bottom-left controls hint", () => {
  it("leaves the inventory's column alone at the narrowest supported canvas", () => {
    const wrap = hintWrapWidth(MIN_CANVAS_W);
    expect(wrap + INVENTORY_RESERVE_W + UI_PAD * 2).toBeLessThanOrEqual(MIN_CANVAS_W);
  });

  it("still has room to be readable once the inventory is reserved", () => {
    // The failure this guards is the opposite one: reserving so much for the
    // inventory that the hint wraps to a column too narrow to read.
    const chars = hintWrapWidth(MIN_CANVAS_W) / (12 * 0.54);
    expect(chars).toBeGreaterThan(24);
  });

  it("never reaches the inventory's left edge, at any supported width", () => {
    // The bug this replaces: at 942px — the canvas a 1024px display gives — the
    // hint ran from x=12 to x=744 and the inventory started at x=722.
    for (const width of [MIN_CANVAS_W, 800, 942, 1178, 1280]) {
      const hintRight = UI_PAD + hintWrapWidth(width);
      const inventoryLeft = width - UI_PAD - INVENTORY_RESERVE_W;
      expect(hintRight, `at ${width}px`).toBeLessThanOrEqual(inventoryLeft);
    }
  });

  it("is wide enough that wrapping stays bounded", () => {
    // Two or three lines is the intended trade for a hint that fades out; a dozen
    // would mean the reserve had eaten the column rather than shared it.
    const lines = Math.ceil(monoWidth(controlsHintLine().length, 12) / hintWrapWidth(MIN_CANVAS_W));
    expect(lines).toBeLessThanOrEqual(3);
  });
});

describe("hudLayout: the top-right stack", () => {
  it("starts the debug inspector below the radar", () => {
    expect(INVENTORY_TOP_LIMIT).toBeGreaterThan(RADAR_BOTTOM);
    expect(RADAR_BOTTOM).toBeGreaterThan(UI_PAD);
  });
});
