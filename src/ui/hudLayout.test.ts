import { describe, it, expect } from "vitest";
import { catalogedNames } from "../systems/ItemCatalog";
import { CONSUMABLE_ORDER, MAX_CONSUMABLES, consumableSlots, isKeyItem } from "../systems/EntityStats";
import { controlsHintLine } from "./Controls";
import { inventoryLines } from "./inventoryLines";
import { ACTS, allFeatures, initialObjectives, objectiveSummary, objectiveSummaryText } from "../systems/Objectives";
import {
  ACT_CARD_MAX_CHARS,
  ENCOUNTER_TOP,
  INVENTORY_MAX_CHARS,
  INVENTORY_RESERVE_W,
  INVENTORY_TOP_LIMIT,
  MIN_CANVAS_H,
  MIN_CANVAS_W,
  NETWORK_DETAIL_TOP,
  NETWORK_LINE_H,
  NETWORK_MAX_CHARS,
  NETWORK_MAX_LINES,
  NETWORK_PANEL_H,
  NETWORK_PANEL_W,
  NETWORK_TOP,
  OBJECTIVE_BLOCK_H,
  OBJECTIVE_PAD_X,
  OBJECTIVE_TOP,
  PANEL_INSET,
  RADAR_BOTTOM,
  STATUS_STACK_RIGHT,
  hintWrapWidth,
  monoWidth,
  objectiveCentre,
  objectiveWrapWidth,
  radarLeft,
  sharedFieldLeft,
} from "./hudLayout";
import { UI_PAD, UI_TEXT } from "./hudTheme";
import { UI_TEXTURES } from "./UiTextures";

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

  it("benchmarks execution time and verifies parity between uncached and cached slots", () => {
    const items = worstCaseInventory();
    const active = {
      chaffRemaining: 99,
      thermalRemaining: 99,
      flashlightOwned: true,
      flashlightOn: false,
      flashlightCharge: 1,
      sackLunchOpened: true,
    };
    const selected = CONSUMABLE_ORDER[0];
    const slots = consumableSlots(items);

    const uncachedResult = inventoryLines(items, active, selected);
    const cachedResult = inventoryLines(items, active, selected, slots);

    expect(cachedResult).toEqual(uncachedResult);

    const N = 50000;
    const startUncached = performance.now();
    for (let i = 0; i < N; i++) {
      inventoryLines(items, active, selected);
    }
    const durationUncached = performance.now() - startUncached;

    const startCached = performance.now();
    for (let i = 0; i < N; i++) {
      inventoryLines(items, active, selected, slots);
    }
    const durationCached = performance.now() - startCached;

    console.log(
      `[BENCHMARK] inventoryLines (${N} calls) — Uncached: ${durationUncached.toFixed(
        2,
      )}ms, Cached: ${durationCached.toFixed(2)}ms (Speedup: ${(
        durationUncached / durationCached
      ).toFixed(2)}x)`,
    );
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

  it("reaches neither the gauge nor the inventory, at any supported width", () => {
    // Two bugs this replaces, one region apart. The hint ran from x=12 to x=744 at
    // 942px — the canvas a 1024px display gives — while the inventory started at
    // x=722. Reserving only the inventory then put it under the Shared Field gauge,
    // whose centreline is 42px up, which two wrapped lines of hint reach.
    for (const width of [MIN_CANVAS_W, 800, 942, 1178, 1280]) {
      const hintRight = UI_PAD + hintWrapWidth(width);
      expect(hintRight, `inventory, at ${width}px`).toBeLessThanOrEqual(
        width - UI_PAD - INVENTORY_RESERVE_W,
      );
      expect(hintRight, `gauge, at ${width}px`).toBeLessThanOrEqual(sharedFieldLeft(width));
    }
  });

  it("is wide enough that wrapping stays bounded", () => {
    // The gauge binds at every width, so the hint is a block rather than the strip
    // it used to be: two lines at 1280px, four at the 640px floor where the gauge
    // sits only 212px from the left pad and there is genuinely nowhere else for the
    // text to go. That is the accepted cost of never printing through the gauge,
    // and a compact block in the corner arguably reads better than a 732px line
    // across the screen. A dozen lines would mean the reserves had eaten the
    // column rather than shared it.
    const width = monoWidth(controlsHintLine().length, 12);
    expect(Math.ceil(width / hintWrapWidth(MIN_CANVAS_W))).toBeLessThanOrEqual(4);
    expect(Math.ceil(width / hintWrapWidth(1280))).toBeLessThanOrEqual(2);
  });
});

describe("hudLayout: the alert-network panel", () => {
  /** The type size the readout draws its rows at. */
  const SMALL = Number.parseInt(UI_TEXT.small, 10);

  it("insets its contents by the panel art's own nine-slice border", () => {
    // If these two ever disagree, the readout's text drifts onto the casing —
    // over the bevel and the rivets — instead of sitting in the flat well.
    const panel = UI_TEXTURES.find((t) => t.key === "ui-panel");
    expect(panel?.slice).toBe(PANEL_INSET);
  });

  it("fits its widest line inside the panel's interior", () => {
    // `CONVERGING 12 → (100,100)` is the longest string `update` can build.
    const widest = "CONVERGING 12 → (100,100)";
    expect(widest.length).toBeLessThanOrEqual(NETWORK_MAX_CHARS);
    const interior = NETWORK_PANEL_W - PANEL_INSET * 2;
    expect(monoWidth(NETWORK_MAX_CHARS, SMALL)).toBeLessThanOrEqual(interior);
  });

  it("fits the status row inside the panel's interior", () => {
    // The label sits at the interior's left edge and the phase 70px along it.
    const widestPhase = "SEARCHING".length;
    const interior = NETWORK_PANEL_W - PANEL_INSET * 2;
    expect(70 + monoWidth(widestPhase, SMALL)).toBeLessThanOrEqual(interior);
  });

  it("is tall enough for every row it can show", () => {
    const needed = PANEL_INSET * 2 + NETWORK_DETAIL_TOP + NETWORK_MAX_LINES * (NETWORK_LINE_H + 2);
    expect(NETWORK_PANEL_H).toBeGreaterThanOrEqual(needed);
  });

  it("stays on screen at the smallest supported canvas", () => {
    // The readout is the bottom of the left column, so it is the one that runs
    // out of room first when the window shrinks.
    expect(NETWORK_TOP + NETWORK_PANEL_H).toBeLessThanOrEqual(MIN_CANVAS_H);
    expect(UI_PAD + NETWORK_PANEL_W).toBeLessThanOrEqual(MIN_CANVAS_W);
  });
});

describe("hudLayout: the top-right stack", () => {
  it("starts the debug inspector below the radar", () => {
    expect(INVENTORY_TOP_LIMIT).toBeGreaterThan(RADAR_BOTTOM);
    expect(RADAR_BOTTOM).toBeGreaterThan(UI_PAD);
  });
});

describe("hudLayout: the top-centre objective tracker", () => {
  /** The type size the tracker draws at, matching `ObjectiveHud`. */
  const LABEL = Number.parseInt(UI_TEXT.label, 10);

  /**
   * The widest standing row the tracker can build, from the real labels.
   *
   * Worst case is the *bare* map, not the shipped one: it has the longest single
   * label (`Recover EIRA-7's logs (breach a log-cache)`, 42 chars) and the prefix
   * costs the same either way.
   */
  function widestRow(): string {
    const maps = [allFeatures("main2"), { ...allFeatures("main2"), hasLogBeta: false }];
    const rows = maps.map((f) => objectiveSummaryText(objectiveSummary(initialObjectives(), "main1", f)));
    return rows.reduce((a, b) => (b.length > a.length ? b : a));
  }

  it("clears the status stack and the radar at its widest, at every supported width", () => {
    // At a 588px canvas the directive ran from x=161 while the SRP bar ended at
    // x=192 — 31px of overlap, because the tracker centred on the viewport rather
    // than on the space actually left between its neighbours.
    for (const width of [MIN_CANVAS_W, 800, 942, 1178, 1280]) {
      // The plate, not the text: `ObjectiveHud` draws a `backgroundColor` that
      // reaches OBJECTIVE_PAD_X past the glyphs on each side, and it is the plate
      // the player sees touching the SRP meter.
      const block = objectiveWrapWidth(width) + OBJECTIVE_PAD_X * 2;
      const cx = objectiveCentre(width, block);
      expect(cx - block / 2, `status stack, at ${width}px`).toBeGreaterThanOrEqual(
        STATUS_STACK_RIGHT,
      );
      expect(cx + block / 2, `radar, at ${width}px`).toBeLessThanOrEqual(radarLeft(width));
    }
  });

  it("stays screen-centred when there is room for it", () => {
    // The nudge is a fallback, not the normal case: a short directive on a wide
    // canvas should sit exactly where it always has.
    expect(objectiveCentre(1280, 300)).toBe(640);
  });

  it("leaves the encounter band clear even fully expanded", () => {
    // The tracker stands as one row and expands to the whole checklist for six
    // seconds when an act completes. The band below can't know when that last
    // happened, so the budget is the expanded height, plate included.
    expect(OBJECTIVE_TOP + OBJECTIVE_BLOCK_H).toBeLessThanOrEqual(ENCOUNTER_TOP);
  });

  it("keeps the standing row to one line on any canvas worth the name", () => {
    // The row is the tracker's whole point — progress plus the act in hand, at a
    // glance. A row that wraps is two lines of chrome over the play field again,
    // which is the thing this replaced. Same bounded-wrapping check the controls
    // hint gets above, and built from the real labels for the same reason.
    const width = monoWidth(widestRow().length, LABEL);
    for (const canvas of [800, 942, 1178, 1280]) {
      expect(Math.ceil(width / objectiveWrapWidth(canvas)), `at ${canvas}px`).toBe(1);
    }
    // At the 640px floor there is genuinely nowhere else for it to go — the gap
    // between the SRP bar and the radar is 304px against a 389px row — so it wraps
    // once. Still a third of what the old block occupied.
    expect(Math.ceil(width / objectiveWrapWidth(MIN_CANVAS_W))).toBeLessThanOrEqual(2);
  });
});

describe("the act card", () => {
  it("fits every authored act's subtitle on the narrowest canvas", () => {
    // The card is the one piece of HUD text that is a sentence, and a sentence
    // that runs off both edges is the same failure as every other budget here,
    // reached from the other direction. A fifth act with a long place name
    // fails this rather than the window.
    for (const act of Object.values(ACTS)) {
      expect(act.subtitle.length, act.title).toBeLessThanOrEqual(ACT_CARD_MAX_CHARS);
      expect(act.title.length, act.title).toBeLessThanOrEqual(ACT_CARD_MAX_CHARS);
    }
  });

  it("budgets a real number of characters", () => {
    // Guards the derivation itself: a bad MONO_ADVANCE or pad would show up here
    // as a budget of three characters, which every subtitle would then fail.
    expect(ACT_CARD_MAX_CHARS).toBeGreaterThan(70);
  });
});
