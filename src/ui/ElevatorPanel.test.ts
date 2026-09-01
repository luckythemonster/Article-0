import { describe, it, expect } from "vitest";
import {
  BUTTON_STATES,
  PANEL_ALERT_FRAME,
  PANEL_DIGIT_COUNT,
  PANEL_FRAME_COUNT,
  buttonAt,
  buttonStateFor,
  elevatorButtonFrame,
  firstSelectable,
  nextSelectable,
  panelDigitFrame,
  panelSize,
} from "./ElevatorPanel";

describe("elevator call buttons", () => {
  it("gives every state its own frame, in strip order", () => {
    const frames = BUTTON_STATES.map(elevatorButtonFrame);
    expect(frames).toEqual([0, 1, 2, 3]);
    expect(new Set(frames).size).toBe(BUTTON_STATES.length);
  });

  it("reads sealed off the floor, not off the cursor", () => {
    // The lamp describes the floor. A sealed row the cursor happens to rest on
    // — an all-sealed panel, where there is nowhere else to be — still reads
    // sealed rather than lighting up as though it could be ridden to.
    expect(buttonStateFor({ sealed: true, selected: true, pressed: false })).toBe("SEALED");
    expect(buttonStateFor({ sealed: true, selected: false, pressed: false })).toBe("SEALED");
  });

  it("lights the selected floor, and flashes the one just pressed", () => {
    expect(buttonStateFor({ sealed: false, selected: false, pressed: false })).toBe("IDLE");
    expect(buttonStateFor({ sealed: false, selected: true, pressed: false })).toBe("LIT");
    expect(buttonStateFor({ sealed: false, selected: true, pressed: true })).toBe("PRESSED");
  });
});

describe("elevator panel layout", () => {
  it("grows with the shaft rather than being fixed", () => {
    const two = panelSize(2);
    const five = panelSize(5);
    expect(five.h).toBeGreaterThan(two.h);
    // The casing is nine-sliced precisely so the width does not have to move.
    expect(five.w).toBe(two.w);
  });

  it("stacks the buttons without overlapping them", () => {
    const a = buttonAt(0);
    const b = buttonAt(1);
    expect(b.x).toBe(a.x);
    expect(b.y - a.y).toBeGreaterThanOrEqual(24);
  });

  it("keeps every row inside the plate", () => {
    const rows = 6;
    const { h } = panelSize(rows);
    expect(buttonAt(rows - 1).y + 24).toBeLessThan(h);
  });
});

describe("elevator panel navigation", () => {
  const sealed = (...s: boolean[]): boolean[] => s;

  it("skips sealed floors on the way past", () => {
    expect(nextSelectable(sealed(false, true, false), 0, 1)).toBe(2);
    expect(nextSelectable(sealed(false, true, false), 2, -1)).toBe(0);
  });

  it("stops at the ends rather than wrapping", () => {
    // Same rule as SelectList, for its reason: a list that wraps makes it
    // impossible to tell you are at the bottom without looking.
    expect(nextSelectable(sealed(false, false), 1, 1)).toBe(1);
    expect(nextSelectable(sealed(false, false), 0, -1)).toBe(0);
  });

  it("stays put when everything past the cursor is sealed", () => {
    expect(nextSelectable(sealed(false, true, true), 0, 1)).toBe(0);
  });

  it("opens on the first floor that can be ridden to", () => {
    expect(firstSelectable(sealed(true, false, false))).toBe(1);
    expect(firstSelectable(sealed(false, false))).toBe(0);
  });

  it("reports no selection at all when every floor is sealed", () => {
    // -1, so the scene paints no lit lamp rather than lighting a sealed one.
    expect(firstSelectable(sealed(true, true))).toBe(-1);
  });
});

describe("elevator casing digit", () => {
  it("passes an in-range cursor straight through", () => {
    expect(panelDigitFrame(0)).toBe(0);
    expect(panelDigitFrame(5)).toBe(5);
    expect(panelDigitFrame(8)).toBe(8);
  });

  it("clamps a cursor past what the corner LEDs can show", () => {
    expect(panelDigitFrame(9)).toBe(8);
    expect(panelDigitFrame(20)).toBe(8);
  });

  it("reads no selection as digit 0 rather than going negative", () => {
    expect(panelDigitFrame(-1)).toBe(0);
  });

  it("keeps the digit count, alert frame and sheet size in step", () => {
    expect(PANEL_DIGIT_COUNT).toBe(9);
    expect(PANEL_ALERT_FRAME).toBe(9);
    expect(PANEL_FRAME_COUNT).toBe(10);
  });
});
