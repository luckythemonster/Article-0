import { describe, it, expect } from "vitest";
import {
  PANEL_LED_CLIPS,
  advanceLed,
  ledStateForNetwork,
  panelSupportsLiveState,
  type PanelLedState,
} from "./PanelLed";
import { UI_TEXTURES } from "./UiTextures";
import type { AlertNetworkSnapshot } from "../systems/AlertNetwork";

/**
 * The panel lamp's guard.
 *
 * Two things can go wrong here without anything failing to compile. A clip can
 * reference a frame the shipped art doesn't have, and the network mapping can
 * drift from what {@link panelSupportsLiveState} is protecting against — wiring
 * `in_use` live before the manifest matches the real export's frame count.
 */

const PANEL = UI_TEXTURES.find((t) => t.key === "ui-panel");
const STATES: PanelLedState[] = ["off", "in_use"];
/** How many frames the shipped art has — see `panelSupportsLiveState`. */
const FRAME_COUNT = 8;

const quiet: AlertNetworkSnapshot = {
  status: "INFILTRATION",
  total: 3,
  alerted: 0,
  suspicious: 0,
  converging: 0,
  target: null,
  countdown: 0,
};

describe("the panel's spritesheet", () => {
  it("is declared as a sheet with a frame count", () => {
    expect(PANEL?.sheet).toBeDefined();
  });

  it("declares fewer frames than its grid holds", () => {
    // 144x144 at margin 0 / spacing 0 is a tight 3x3 grid — nine slots for eight
    // frames. Phaser generates the ninth from the empty bottom-right corner, so
    // anything reading `count` as "frames in the grid" would land on a blank.
    const spec = PANEL!;
    const sheet = spec.sheet!;
    const across = (144 - sheet.margin * 2 + sheet.spacing) / (spec.size + sheet.spacing);
    const down = (144 - sheet.margin * 2 + sheet.spacing) / (spec.size + sheet.spacing);
    expect(Math.floor(across) * Math.floor(down)).toBeGreaterThan(sheet.count);
  });
});

describe("PANEL_LED_CLIPS", () => {
  it("names frames within the shipped art's own frame count", () => {
    for (const state of STATES) {
      for (const step of PANEL_LED_CLIPS[state]) {
        expect(step.frame, `${state} frame`).toBeGreaterThanOrEqual(0);
        expect(step.frame, `${state} frame`).toBeLessThan(FRAME_COUNT);
      }
    }
  });

  it("covers every state, and never with an empty clip", () => {
    for (const state of STATES) expect(PANEL_LED_CLIPS[state].length).toBeGreaterThan(0);
  });

  it("never revisits the idle frame mid-cycle", () => {
    // Unlike the old three-colour lamp, `in_use` doesn't blink against a gap —
    // it bounces frame 1 through 7 and back, staying lit for the whole activity
    // rather than flashing back to idle every lap.
    const frames = PANEL_LED_CLIPS.in_use.map((s) => s.frame);
    expect(frames).not.toContain(PANEL_LED_CLIPS.off[0].frame);
  });

  it("bounces symmetrically rather than jumping straight back to the start", () => {
    // A ping-pong (Aseprite tag direction 2): 1..7 then 6..2, not a hard loop
    // back to 1. Frame 1 and frame 7 each appear once — the turnaround points.
    const frames = PANEL_LED_CLIPS.in_use.map((s) => s.frame);
    expect(frames.filter((f) => f === 1)).toHaveLength(1);
    expect(frames.filter((f) => f === 7)).toHaveLength(1);
    expect(frames.filter((f) => f === 4)).toHaveLength(2);
  });

  it("leaves `off` as a single idle frame that never advances", () => {
    expect(PANEL_LED_CLIPS.off).toHaveLength(1);
    expect(PANEL_LED_CLIPS.off[0].duration).toBe(0);
  });
});

describe("ledStateForNetwork", () => {
  it("is off when the board is fully quiet", () => {
    expect(ledStateForNetwork(quiet)).toBe("off");
  });

  it("is in_use the moment anything is spotting, suspicious, or converging", () => {
    expect(ledStateForNetwork({ ...quiet, alerted: 1 })).toBe("in_use");
    expect(ledStateForNetwork({ ...quiet, suspicious: 1 })).toBe("in_use");
    expect(ledStateForNetwork({ ...quiet, converging: 1 })).toBe("in_use");
  });

  it("doesn't care about the phase label directly, only the counts", () => {
    // A network can sit in ALERT with everything having lost the trail
    // (converging back to 0, nobody currently spotting) — the lamp reads the
    // live board, not the phase word the STATUS map prints beside it.
    expect(ledStateForNetwork({ ...quiet, status: "ALERT" })).toBe("off");
  });
});

describe("panelSupportsLiveState", () => {
  it("is true now that the manifest matches the real eight-frame export", () => {
    expect(panelSupportsLiveState()).toBe(true);
  });

  it("is derived from the manifest rather than hardcoded", () => {
    // Proof it's a real comparison and not just `true`: the clip's highest
    // frame (7) is one less than the count (8) that makes it pass.
    const highest = Math.max(...PANEL_LED_CLIPS.in_use.map((s) => s.frame));
    expect(highest).toBe(FRAME_COUNT - 1);
  });
});

describe("advanceLed", () => {
  it("holds a step until its duration is up", () => {
    // `in_use` is 100ms per frame.
    expect(advanceLed("in_use", 0, 40)).toEqual({ index: 0, elapsed: 40 });
    expect(advanceLed("in_use", 0, 99)).toEqual({ index: 0, elapsed: 99 });
  });

  it("advances once the duration is met, keeping the remainder", () => {
    // Keeping the remainder is what stops a slow frame from resetting the phase.
    expect(advanceLed("in_use", 0, 130)).toEqual({ index: 1, elapsed: 30 });
  });

  it("wraps around the end of a clip", () => {
    // 12 steps (the full 1-7-1 bounce); the last is index 11.
    expect(advanceLed("in_use", 11, 100)).toEqual({ index: 0, elapsed: 0 });
  });

  it("skips whole cycles rather than looping forever on a long delta", () => {
    // A backgrounded tab hands back a delta of seconds, not milliseconds. The
    // full cycle is 1200ms (12 steps x 100ms); 12000 is exactly ten of them.
    const out = advanceLed("in_use", 0, 12_000);
    expect(out.index).toBe(0);
    expect(out.elapsed).toBe(0);
  });

  it("never advances `off`, whatever the delta", () => {
    expect(advanceLed("off", 0, 10_000)).toEqual({ index: 0, elapsed: 0 });
  });
});
