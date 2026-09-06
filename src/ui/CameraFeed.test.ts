import { describe, it, expect } from "vitest";
import {
  FEED_H,
  FEED_MIN_H,
  FEED_MIN_W,
  FEED_W,
  chromeRects,
  feedViewport,
} from "./CameraFeed";
import {
  ENCOUNTER_TOP,
  MIN_CANVAS_H,
  MIN_CANVAS_W,
  STATUS_STACK_RIGHT,
  radarLeft,
} from "./hudLayout";
import { UI_PAD } from "./hudTheme";

/** The canvas sizes the HUD is budgeted across — the floor, a laptop, the cap. */
const SIZES: [number, number][] = [
  [MIN_CANVAS_W, MIN_CANVAS_H],
  [1024, 640],
  [1280, 800],
  // Deliberately odd, to catch a fractional centre surviving into the rect.
  [901, 617],
];

describe("feedViewport", () => {
  it("lands on whole pixels at every canvas size", () => {
    for (const [w, h] of SIZES) {
      const vp = feedViewport(w, h);
      for (const v of [vp.x, vp.y, vp.w, vp.h]) {
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });

  it("never exceeds the preferred size", () => {
    for (const [w, h] of SIZES) {
      const vp = feedViewport(w, h);
      expect(vp.w).toBeLessThanOrEqual(FEED_W);
      expect(vp.h).toBeLessThanOrEqual(FEED_H);
    }
  });

  it("stays at least the minimum worth opening", () => {
    for (const [w, h] of SIZES) {
      const vp = feedViewport(w, h);
      expect(vp.w).toBeGreaterThanOrEqual(FEED_MIN_W);
      expect(vp.h).toBeGreaterThanOrEqual(FEED_MIN_H);
    }
  });

  it("stays on screen", () => {
    for (const [w, h] of SIZES) {
      const vp = feedViewport(w, h);
      expect(vp.x).toBeGreaterThanOrEqual(0);
      expect(vp.y).toBeGreaterThanOrEqual(0);
      expect(vp.x + vp.w).toBeLessThanOrEqual(w);
      expect(vp.y + vp.h).toBeLessThanOrEqual(h);
    }
  });

  it("clears the permanent HUD columns and the objective band", () => {
    for (const [w, h] of SIZES) {
      const vp = feedViewport(w, h);
      expect(vp.x).toBeGreaterThanOrEqual(STATUS_STACK_RIGHT + UI_PAD);
      expect(vp.x + vp.w).toBeLessThanOrEqual(radarLeft(w) - UI_PAD);
      expect(vp.y).toBeGreaterThanOrEqual(ENCOUNTER_TOP);
    }
  });

  it("leaves the bottom edge to the conduct line the feed is costing you", () => {
    for (const [w, h] of SIZES) {
      const vp = feedViewport(w, h);
      expect(vp.y + vp.h).toBeLessThan(h - 40);
    }
  });

  it("gets its full preferred size once there is room for it", () => {
    const vp = feedViewport(1280, 800);
    expect(vp.w).toBe(FEED_W);
    expect(vp.h).toBe(FEED_H);
  });

  it("is screen-centred on a canvas wide enough for both columns", () => {
    const vp = feedViewport(1280, 800);
    expect(vp.x + vp.w / 2).toBe(640);
  });

  it("gives up the centre rather than the status column when squeezed", () => {
    // At the 640 floor the two columns leave less than the screen centre wants,
    // so the box is pushed right — the same crossover `objectiveCentre` makes.
    const vp = feedViewport(MIN_CANVAS_W, MIN_CANVAS_H);
    expect(vp.x).toBeGreaterThanOrEqual(STATUS_STACK_RIGHT + UI_PAD);
  });
});

describe("chromeRects", () => {
  it("covers every pixel the viewport does not, exactly once", () => {
    for (const [w, h] of SIZES) {
      const vp = feedViewport(w, h);
      const bands = chromeRects(vp, w, h);
      const area = bands.reduce((sum, b) => sum + b.w * b.h, 0);
      expect(area).toBe(w * h - vp.w * vp.h);
    }
  });

  it("never overlaps the picture", () => {
    for (const [w, h] of SIZES) {
      const vp = feedViewport(w, h);
      for (const b of chromeRects(vp, w, h)) {
        const apart =
          b.x + b.w <= vp.x || b.x >= vp.x + vp.w || b.y + b.h <= vp.y || b.y >= vp.y + vp.h;
        expect(apart).toBe(true);
      }
    }
  });

  it("drops a band a flush viewport leaves nothing for", () => {
    const flush = { x: 0, y: 0, w: 100, h: 100 };
    const bands = chromeRects(flush, 100, 200);
    // Nothing above and nothing to either side: only the band below survives.
    expect(bands).toEqual([{ x: 0, y: 100, w: 100, h: 100 }]);
  });
});
