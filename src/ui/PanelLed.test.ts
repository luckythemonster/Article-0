import { describe, it, expect } from "vitest";
import { PANEL_LED_CLIPS, advanceLed, ledStateFor, type PanelLedState } from "./PanelLed";
import { UI_TEXTURES } from "./UiTextures";
import type { AlertPhase } from "../systems/AlertState";

/**
 * The panel lamp's guard.
 *
 * Two things can go wrong here without anything failing to compile. A clip can
 * name a frame the spritesheet doesn't have — which draws whatever Phaser
 * generated for the empty slot, i.e. nothing — and the phase mapping can drift
 * from what `AlertNetworkHud` prints, so the lamp and the words disagree.
 */

const PANEL = UI_TEXTURES.find((t) => t.key === "ui-panel");
const STATES: PanelLedState[] = ["off", "active", "warning", "alert"];

describe("the panel's spritesheet", () => {
  it("is declared as a sheet with a frame count", () => {
    expect(PANEL?.sheet).toBeDefined();
    expect(PANEL?.sheet?.count).toBe(5);
  });

  it("declares fewer frames than its grid holds", () => {
    // 150x102 at margin 1 / spacing 2 is a 3x2 grid — six slots for five frames.
    // Phaser generates the sixth from the empty bottom-right corner, so anything
    // reading `count` as "frames in the grid" would land on a blank.
    const spec = PANEL!;
    const sheet = spec.sheet!;
    const across = (150 - sheet.margin * 2 + sheet.spacing) / (spec.size + sheet.spacing);
    const down = (102 - sheet.margin * 2 + sheet.spacing) / (spec.size + sheet.spacing);
    expect(Math.floor(across) * Math.floor(down)).toBeGreaterThan(sheet.count);
  });
});

describe("PANEL_LED_CLIPS", () => {
  it("only names frames the sheet actually has", () => {
    const count = PANEL!.sheet!.count;
    for (const state of STATES) {
      for (const step of PANEL_LED_CLIPS[state]) {
        expect(step.frame, `${state} frame`).toBeGreaterThanOrEqual(0);
        expect(step.frame, `${state} frame`).toBeLessThan(count);
      }
    }
  });

  it("covers every state, and never with an empty clip", () => {
    for (const state of STATES) expect(PANEL_LED_CLIPS[state].length).toBeGreaterThan(0);
  });

  it("gives every lit state a gap, so it reads as a blink", () => {
    // The unlit frame is 1. A "blink" that never returns to it is just a lamp.
    for (const state of ["active", "warning", "alert"] as const) {
      const frames = PANEL_LED_CLIPS[state].map((s) => s.frame);
      expect(new Set(frames).size, `${state} holds one frame`).toBeGreaterThan(1);
    }
  });

  it("blinks alert faster than it beats nominal", () => {
    const cycle = (s: PanelLedState): number =>
      PANEL_LED_CLIPS[s].reduce((n, step) => n + step.duration, 0);
    // The distinction the uneven durations exist to carry.
    expect(cycle("alert")).toBeLessThan(cycle("active"));
    expect(cycle("warning")).toBeLessThan(cycle("active"));
  });

  it("leaves `off` as a single unlit frame that never advances", () => {
    expect(PANEL_LED_CLIPS.off).toHaveLength(1);
    expect(PANEL_LED_CLIPS.off[0].duration).toBe(0);
  });
});

describe("ledStateFor", () => {
  it("agrees with the phases AlertNetworkHud reads", () => {
    const cases: [AlertPhase, PanelLedState][] = [
      ["INFILTRATION", "active"],
      ["EVASION", "warning"],
      ["ALERT", "alert"],
    ];
    for (const [phase, state] of cases) expect(ledStateFor(phase), phase).toBe(state);
  });

  it("covers every phase the alert state can be in", () => {
    const phases: AlertPhase[] = ["INFILTRATION", "ALERT", "EVASION"];
    for (const p of phases) expect(STATES).toContain(ledStateFor(p));
  });
});

describe("advanceLed", () => {
  it("holds a step until its duration is up", () => {
    // `alert` is 100ms per frame.
    expect(advanceLed("alert", 0, 40)).toEqual({ index: 0, elapsed: 40 });
    expect(advanceLed("alert", 0, 99)).toEqual({ index: 0, elapsed: 99 });
  });

  it("advances once the duration is met, keeping the remainder", () => {
    // Keeping the remainder is what stops a slow frame from resetting the phase.
    expect(advanceLed("alert", 0, 130)).toEqual({ index: 1, elapsed: 30 });
  });

  it("wraps around the end of a clip", () => {
    expect(advanceLed("alert", 1, 100)).toEqual({ index: 0, elapsed: 0 });
  });

  it("skips whole cycles rather than looping forever on a long delta", () => {
    // A backgrounded tab hands back a delta of seconds, not milliseconds.
    const out = advanceLed("alert", 0, 10_000);
    expect(out.index).toBe(0);
    expect(out.elapsed).toBe(0);
  });

  it("never advances `off`, whatever the delta", () => {
    expect(advanceLed("off", 0, 10_000)).toEqual({ index: 0, elapsed: 0 });
  });

  it("honours the uneven durations of the nominal beat", () => {
    // 500ms lit, then 100ms dark — not 300/300.
    expect(advanceLed("active", 0, 499).index).toBe(0);
    expect(advanceLed("active", 0, 500).index).toBe(1);
    expect(advanceLed("active", 1, 100)).toEqual({ index: 0, elapsed: 0 });
  });
});
