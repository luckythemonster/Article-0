import { describe, it, expect } from "vitest";
import {
  BADGE_BASE,
  COUNT_MAX,
  INDICATOR_FRAME_COUNT,
  INDICATOR_SIZE,
  SCREEN_OFF,
  SCREEN_ON,
  SPOT_BASE,
  SUSP_BASE,
  UNIT_BASE,
  badgeFrame,
  badgeStateFor,
  countFrame,
  disconnectedFrames,
  framesFor,
  type BadgeState,
} from "./NetworkPanel";
import { UI_TEXTURES } from "./UiTextures";
import { PANEL_INSET } from "./hudLayout";
import type { AlertNetworkSnapshot } from "../systems/AlertNetwork";

/**
 * The indicator sheet's contract, asserted from the code side.
 *
 * `tools/panel/build_panel.py` cuts the sheet and checks the *pixels*; this
 * checks the arithmetic that addresses them. The failure this is really guarding
 * against is silent: a frame index that runs off the end of the sheet draws
 * whatever Phaser generated for an empty slot, which is nothing, and a panel
 * that quietly stops showing a count looks identical to a count of zero.
 */

const INDICATORS = UI_TEXTURES.find((t) => t.key === "ui-network-indicators");
const CHROME = UI_TEXTURES.find((t) => t.key === "ui-panel");

const quiet: AlertNetworkSnapshot = {
  status: "INFILTRATION",
  total: 0,
  alerted: 0,
  suspicious: 0,
  converging: 0,
  target: null,
  countdown: 0,
};

describe("the indicator sheet's manifest entry", () => {
  it("is declared with the frame count the code addresses", () => {
    expect(INDICATORS?.sheet?.count).toBe(INDICATOR_FRAME_COUNT);
  });

  it("is authored at the nine-slice inset, so it lands flush in a corner", () => {
    // The indicators are cropped to the corner they occupy, and nine-slice
    // reproduces corners at native size. If these two ever diverge the sprites
    // stop lining up with the panel they sit on.
    expect(INDICATORS?.size).toBe(INDICATOR_SIZE);
    expect(CHROME?.slice).toBe(INDICATOR_SIZE);
    expect(PANEL_INSET).toBe(INDICATOR_SIZE);
  });

  it("gives the chrome exactly the two screen frames", () => {
    expect(CHROME?.sheet?.count).toBe(2);
    expect(SCREEN_OFF).toBe(0);
    expect(SCREEN_ON).toBe(1);
  });
});

describe("countFrame", () => {
  it("maps 0..7 onto consecutive frames from each base", () => {
    for (const base of [UNIT_BASE, SPOT_BASE, SUSP_BASE]) {
      for (let n = 0; n <= COUNT_MAX; n++) {
        expect(countFrame(base, n), `base ${base} count ${n}`).toBe(base + n);
      }
    }
  });

  it("clamps above the top rather than wrapping", () => {
    // Wrapping would show a busy base as `...` — "nothing here" at the exact
    // moment the readout matters most.
    expect(countFrame(UNIT_BASE, 8)).toBe(UNIT_BASE + COUNT_MAX);
    expect(countFrame(UNIT_BASE, 99)).toBe(UNIT_BASE + COUNT_MAX);
  });

  it("clamps below zero, and floors fractions", () => {
    expect(countFrame(SPOT_BASE, -1)).toBe(SPOT_BASE);
    expect(countFrame(SPOT_BASE, 2.9)).toBe(SPOT_BASE + 2);
  });

  it("never leaves the sheet, at any count", () => {
    for (const base of [UNIT_BASE, SPOT_BASE, SUSP_BASE]) {
      for (const n of [-5, 0, 3, 7, 8, 1000]) {
        const f = countFrame(base, n);
        expect(f, `base ${base} count ${n}`).toBeGreaterThanOrEqual(0);
        expect(f, `base ${base} count ${n}`).toBeLessThan(INDICATOR_FRAME_COUNT);
      }
    }
  });
});

describe("the frame bases", () => {
  it("give each indicator its own eight-frame run without overlapping", () => {
    const runs = [UNIT_BASE, SPOT_BASE, SUSP_BASE].map((b) => [b, b + COUNT_MAX]);
    runs.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i][0], "runs overlap").toBeGreaterThan(runs[i - 1][1]);
    }
  });

  it("puts the badge past every count run, inside the sheet", () => {
    expect(BADGE_BASE).toBeGreaterThan(Math.max(UNIT_BASE, SPOT_BASE, SUSP_BASE) + COUNT_MAX);
    expect(BADGE_BASE + 3).toBeLessThan(INDICATOR_FRAME_COUNT);
  });
});

describe("badgeStateFor", () => {
  it("agrees with the words AlertNetworkHud prints beside it", () => {
    const cases: [string, BadgeState][] = [
      ["INFILTRATION", "nominal"],
      ["EVASION", "warning"],
      ["ALERT", "alert"],
    ];
    for (const [status, state] of cases) expect(badgeStateFor(status), status).toBe(state);
  });

  it("falls back to nominal on an unrecognised status", () => {
    // `status` is a plain string on the snapshot; the text lookup falls back the
    // same way rather than leaving a stale reading on screen.
    expect(badgeStateFor("SOMETHING_NEW")).toBe("nominal");
    expect(badgeStateFor("")).toBe("nominal");
  });

  it("only ever names a badge the sheet has a frame for", () => {
    const states: BadgeState[] = ["disconnected", "warning", "alert", "nominal"];
    for (const s of states) {
      const f = badgeFrame(s);
      expect(f, s).toBeGreaterThanOrEqual(BADGE_BASE);
      expect(f, s).toBeLessThan(INDICATOR_FRAME_COUNT);
    }
    expect(new Set(states.map(badgeFrame)).size).toBe(states.length);
  });
});

describe("disconnectedFrames", () => {
  it("is a dark screen with everything blank", () => {
    const f = disconnectedFrames();
    expect(f.screen).toBe(SCREEN_OFF);
    expect(f.unit).toBe(UNIT_BASE);
    expect(f.spot).toBe(SPOT_BASE);
    expect(f.susp).toBe(SUSP_BASE);
    expect(f.badge).toBe(badgeFrame("disconnected"));
  });

  it("is distinguishable from a live-but-quiet network", () => {
    // Both read zero across the board; the screen and badge are what separate
    // "nothing to report" from "not reporting".
    const live = framesFor(quiet);
    expect(live.screen).not.toBe(disconnectedFrames().screen);
    expect(live.badge).not.toBe(disconnectedFrames().badge);
  });
});

describe("framesFor", () => {
  it("reads the same three numbers the detail line prints", () => {
    const f = framesFor({ ...quiet, total: 3, alerted: 1, suspicious: 2 });
    expect(f.unit).toBe(UNIT_BASE + 3);
    expect(f.spot).toBe(SPOT_BASE + 1);
    expect(f.susp).toBe(SUSP_BASE + 2);
  });

  it("lights the screen whenever there is a snapshot at all", () => {
    expect(framesFor(quiet).screen).toBe(SCREEN_ON);
    expect(framesFor({ ...quiet, status: "ALERT", alerted: 4 }).screen).toBe(SCREEN_ON);
  });

  it("tracks the phase on the badge", () => {
    expect(framesFor({ ...quiet, status: "ALERT" }).badge).toBe(badgeFrame("alert"));
    expect(framesFor({ ...quiet, status: "EVASION" }).badge).toBe(badgeFrame("warning"));
    expect(framesFor(quiet).badge).toBe(badgeFrame("nominal"));
  });

  it("keeps every frame inside the sheet for a busy base", () => {
    const f = framesFor({ ...quiet, status: "ALERT", total: 40, alerted: 12, suspicious: 9 });
    for (const [name, v] of Object.entries(f)) {
      if (name === "screen") continue;
      expect(v, name).toBeLessThan(INDICATOR_FRAME_COUNT);
    }
  });
});
