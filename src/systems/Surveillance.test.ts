import { describe, it, expect } from "vitest";
import {
  LOOP_SECONDS,
  buildChannels,
  feedJammed,
  feedLabel,
  isLooped,
  loopFeed,
  loopRemaining,
  nextChannel,
  surveillanceState,
  tickLoops,
  type FeedUnit,
  type SurveillanceState,
} from "./Surveillance";

/** A 36×36 deck, the shape the shipped levels are. */
const W = 36;
const H = 36;

function stateOf(units: FeedUnit[]) {
  return surveillanceState(buildChannels(units, W, H));
}

describe("feedLabel", () => {
  it("numbers channels from one, zero-padded", () => {
    expect(feedLabel(0, 18, 18, W, H)).toMatch(/^CAM 01 /);
    expect(feedLabel(9, 18, 18, W, H)).toMatch(/^CAM 10 /);
  });

  it("names the third of the deck the camera watches from", () => {
    expect(feedLabel(0, 2, 2, W, H)).toBe("CAM 01 · NW");
    expect(feedLabel(0, 18, 2, W, H)).toBe("CAM 01 · N");
    expect(feedLabel(0, 34, 2, W, H)).toBe("CAM 01 · NE");
    expect(feedLabel(0, 18, 18, W, H)).toBe("CAM 01 · CENTRAL");
    expect(feedLabel(0, 2, 34, W, H)).toBe("CAM 01 · SW");
    expect(feedLabel(0, 34, 34, W, H)).toBe("CAM 01 · SE");
  });

  it("keeps a camera on the last row or column inside the grid", () => {
    // `v / span` is exactly 1 there, and an unclamped floor would index off the
    // end of the bearing table.
    expect(() => feedLabel(0, W, H, W, H)).not.toThrow();
    expect(feedLabel(0, W, H, W, H)).toBe("CAM 01 · SE");
  });

  it("survives a level with no extent rather than dividing by zero", () => {
    expect(feedLabel(0, 0, 0, 0, 0)).toBe("CAM 01 · CENTRAL");
  });
});

describe("buildChannels", () => {
  it("orders row-major by tile, whatever order the boards were swept in", () => {
    // Deliberately shuffled: `main2` files its cameras on a board of their own
    // while `main1` and `main2vault` use `sensors`, so the sweep order is stable
    // only by accident.
    const channels = buildChannels(
      [
        { tx: 30, ty: 20 },
        { tx: 4, ty: 4 },
        { tx: 20, ty: 4 },
      ],
      W,
      H,
    );
    expect(channels.map((c) => c.label)).toEqual([
      "CAM 01 · NW",
      "CAM 02 · N",
      "CAM 03 · E",
    ]);
  });

  it("keeps each channel pointing at the camera it was built from", () => {
    const channels = buildChannels([{ tx: 30, ty: 20 }, { tx: 4, ty: 4 }], W, H);
    // Sorted first, so channel 0 is the *second* sensor in the scene's array.
    expect(channels[0].unit).toBe(1);
    expect(channels[1].unit).toBe(0);
  });

  it("returns nothing for a deck with no cameras", () => {
    expect(buildChannels([], W, H)).toEqual([]);
  });
});

describe("surveillanceState", () => {
  it("opens on the first channel", () => {
    expect(stateOf([{ tx: 4, ty: 4 }]).index).toBe(0);
  });

  it("has no channel to open on when the deck has no cameras", () => {
    expect(stateOf([]).index).toBe(-1);
  });
});

describe("nextChannel", () => {
  const four: FeedUnit[] = [
    { tx: 4, ty: 4 },
    { tx: 30, ty: 4 },
    { tx: 4, ty: 30 },
    { tx: 30, ty: 30 },
  ];

  it("wraps forwards and backwards", () => {
    const s = stateOf(four);
    nextChannel(s, 1);
    expect(s.index).toBe(1);
    nextChannel(s, -1);
    expect(s.index).toBe(0);
    nextChannel(s, -1);
    expect(s.index).toBe(3);
    nextChannel(s, 1);
    expect(s.index).toBe(0);
  });

  it("stays put on a deck with one camera", () => {
    const s = stateOf([{ tx: 4, ty: 4 }]);
    nextChannel(s, 1);
    expect(s.index).toBe(0);
    nextChannel(s, -1);
    expect(s.index).toBe(0);
  });

  it("does nothing on a deck with none", () => {
    const s = stateOf([]);
    nextChannel(s, 1);
    expect(s.index).toBe(-1);
  });
});

describe("looping", () => {
  it("blinds the channel for LOOP_SECONDS and then gives it back", () => {
    const s = stateOf([{ tx: 4, ty: 4 }, { tx: 30, ty: 30 }]);
    expect(loopFeed(s, 0)).toBe(true);
    expect(isLooped(s, 0)).toBe(true);
    expect(loopRemaining(s, 0)).toBe(LOOP_SECONDS);

    tickBy(s, LOOP_SECONDS - 0.5);
    expect(isLooped(s, 0)).toBe(true);
    tickBy(s, 0.5);
    expect(isLooped(s, 0)).toBe(false);
    expect(loopRemaining(s, 0)).toBe(0);
  });

  it("loops one channel without touching its neighbours", () => {
    const s = stateOf([{ tx: 4, ty: 4 }, { tx: 30, ty: 30 }]);
    loopFeed(s, 0);
    expect(isLooped(s, 1)).toBe(false);
  });

  it("re-looping a live channel refills it rather than stacking", () => {
    const s = stateOf([{ tx: 4, ty: 4 }]);
    loopFeed(s, 0);
    tickBy(s, 5);
    loopFeed(s, 0);
    expect(loopRemaining(s, 0)).toBe(LOOP_SECONDS);
  });

  it("never runs a timer below zero", () => {
    const s = stateOf([{ tx: 4, ty: 4 }]);
    loopFeed(s, 0);
    tickBy(s, LOOP_SECONDS * 3);
    expect(loopRemaining(s, 0)).toBe(0);
  });

  it("refuses an index with no channel behind it", () => {
    const s = stateOf([{ tx: 4, ty: 4 }]);
    expect(loopFeed(s, -1)).toBe(false);
    expect(loopFeed(s, 4)).toBe(false);
    expect(isLooped(s, 4)).toBe(false);
    expect(loopRemaining(s, 4)).toBe(0);
  });
});

describe("feedJammed", () => {
  it("takes the picture away during ALERT, and only then", () => {
    expect(feedJammed("ALERT")).toBe(true);
    expect(feedJammed("EVASION")).toBe(false);
    expect(feedJammed("INFILTRATION")).toBe(false);
  });
});

/** Runs the loop timers down by `seconds`, in the 1/60s steps a frame uses. */
function tickBy(s: SurveillanceState, seconds: number): void {
  const step = 1 / 60;
  let left = seconds;
  while (left > 0) {
    const dt = Math.min(step, left);
    tickLoops(s, dt);
    left -= dt;
  }
}
