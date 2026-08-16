import { describe, it, expect } from "vitest";
import {
  ALERT_FLASH_MS,
  ALERT_PULSE_MS,
  INDICATOR_FRAME_COUNT,
  INDICATOR_SIZE,
  SCREEN_ALERT_FLASH,
  SCREEN_FRAME_COUNT,
  SCREEN_OFF,
  SCREEN_ON,
  SPOT,
  SUSP,
  UNIT,
  alertPulse,
  badgeFrame,
  badgeStateFor,
  countBlinkFrame,
  countFrame,
  countMax,
  disconnectedFrames,
  framesFor,
  type BadgeState,
  type CountKind,
} from "./NetworkPanel";
import { UI_TEXTURES } from "./UiTextures";
import { PANEL_INSET } from "./hudLayout";
import type { AlertNetworkSnapshot } from "../systems/AlertNetwork";

/**
 * The indicator sheet's contract, asserted from the code side.
 *
 * `tools/panel/build_panel.py` cuts the sheet and checks the *pixels*; this
 * checks the arithmetic that addresses them. The failure this really guards
 * against is silent: a frame index that runs off the end draws whatever Phaser
 * generated for an empty slot, which is nothing, and a count that quietly stops
 * updating looks identical to a count of zero.
 */

const INDICATORS = UI_TEXTURES.find((t) => t.key === "ui-network-indicators");
const CHROME = UI_TEXTURES.find((t) => t.key === "ui-panel");
const KINDS: CountKind[] = [UNIT, SPOT, SUSP];

const quiet: AlertNetworkSnapshot = {
  status: "INFILTRATION",
  total: 0,
  alerted: 0,
  suspicious: 0,
  converging: 0,
  target: null,
  countdown: 0,
};

describe("the generated frame map", () => {
  it("is what the manifest declares, so art and loader cannot drift", () => {
    expect(INDICATORS?.sheet?.count).toBe(INDICATOR_FRAME_COUNT);
    expect(INDICATORS?.size).toBe(INDICATOR_SIZE);
  });

  it("crops indicators to the nine-slice inset, so they land flush in a corner", () => {
    // Nine-slice reproduces corners at native size; the indicators are cropped
    // to that same corner. If these diverge the sprites stop lining up.
    expect(CHROME?.slice).toBe(INDICATOR_SIZE);
    expect(PANEL_INSET).toBe(INDICATOR_SIZE);
  });

  it("gives the chrome one frame per screen state, all addressable", () => {
    expect(CHROME?.sheet?.count).toBe(SCREEN_FRAME_COUNT);
    const screens = [SCREEN_OFF, SCREEN_ON, SCREEN_ALERT_FLASH];
    expect(new Set(screens).size).toBe(screens.length);
    for (const f of screens) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(SCREEN_FRAME_COUNT);
    }
  });

  it("counts the same distance on every cluster", () => {
    // Three corners disagreeing about what "4" looks like would be worse than
    // any of them being wrong.
    expect(new Set(KINDS.map(countMax)).size).toBe(1);
  });

  it("reaches at least 10, which is what the art draws", () => {
    expect(countMax(UNIT)).toBeGreaterThanOrEqual(10);
  });
});

describe("countFrame", () => {
  it("maps every count the art draws onto its own frame", () => {
    for (const kind of KINDS) {
      const seen = new Set<number>();
      for (let n = 0; n <= countMax(kind); n++) seen.add(countFrame(kind, n));
      expect(seen.size, `${kind} reuses a frame`).toBe(countMax(kind) + 1);
    }
  });

  it("is consecutive from the base, so the index is the value", () => {
    for (const kind of KINDS) {
      const base = countFrame(kind, 0);
      for (let n = 0; n <= countMax(kind); n++) {
        expect(countFrame(kind, n), `${kind} ${n}`).toBe(base + n);
      }
    }
  });

  it("shows the overflow frame past the top rather than holding at the max", () => {
    for (const kind of KINDS) {
      const top = countFrame(kind, countMax(kind));
      const over = countFrame(kind, countMax(kind) + 1);
      expect(over, kind).not.toBe(top);
      // And everything beyond is the same overflow frame, not a walk off the end.
      expect(countFrame(kind, countMax(kind) + 50), kind).toBe(over);
    }
  });

  it("floors fractions and treats negatives as zero", () => {
    expect(countFrame(UNIT, 2.9)).toBe(countFrame(UNIT, 2));
    expect(countFrame(UNIT, -1)).toBe(countFrame(UNIT, 0));
    expect(countFrame(UNIT, Number.NaN)).toBe(countFrame(UNIT, 0));
  });

  it("never leaves the sheet, at any count", () => {
    for (const kind of KINDS) {
      for (const n of [-5, 0, 3, 10, 11, 1000]) {
        const f = countFrame(kind, n);
        expect(f, `${kind} ${n}`).toBeGreaterThanOrEqual(0);
        expect(f, `${kind} ${n}`).toBeLessThan(INDICATOR_FRAME_COUNT);
      }
      expect(countBlinkFrame(kind)).toBeLessThan(INDICATOR_FRAME_COUNT);
    }
  });

  it("gives each cluster a run that does not collide with another's", () => {
    const owned = new Map<number, CountKind>();
    for (const kind of KINDS) {
      for (let n = 0; n <= countMax(kind) + 1; n++) {
        const f = countFrame(kind, n);
        expect(owned.has(f), `frame ${f} claimed by ${owned.get(f)} and ${kind}`).toBe(false);
        owned.set(f, kind);
      }
    }
  });
});

describe("badgeStateFor", () => {
  it("is nominal on a quiet infiltration", () => {
    expect(badgeStateFor(quiet)).toBe("nominal");
  });

  it("goes suspicious the moment one unit half-notices you", () => {
    // Before the phase escalates — the badge leads the status word rather than
    // echoing it, which is the point of having it.
    expect(badgeStateFor({ ...quiet, suspicious: 1 })).toBe("suspicious");
  });

  it("goes suspicious while the network is searching", () => {
    expect(badgeStateFor({ ...quiet, status: "EVASION" })).toBe("suspicious");
  });

  it("goes red on ALERT, whatever the counts say", () => {
    expect(badgeStateFor({ ...quiet, status: "ALERT" })).toBe("alert");
    expect(badgeStateFor({ ...quiet, status: "ALERT", suspicious: 3 })).toBe("alert");
  });

  it("falls back to nominal on an unrecognised status", () => {
    // `status` is a plain string on the snapshot; the text lookup in
    // `AlertNetworkHud` falls back the same way.
    expect(badgeStateFor({ ...quiet, status: "SOMETHING_NEW" })).toBe("nominal");
  });

  it("only names badges the sheet has frames for, all distinct", () => {
    const states: BadgeState[] = ["disconnected", "nominal", "suspicious", "alert", "blink"];
    for (const s of states) {
      expect(badgeFrame(s), s).toBeLessThan(INDICATOR_FRAME_COUNT);
      expect(badgeFrame(s), s).toBeGreaterThanOrEqual(0);
    }
    // `blink` is pixel-identical to `disconnected` in the art but is its own
    // frame, so every state still addresses a distinct index.
    expect(new Set(states.map(badgeFrame)).size).toBe(states.length);
  });
});

describe("disconnectedFrames", () => {
  it("is a dark screen with everything blank", () => {
    const f = disconnectedFrames();
    expect(f.screen).toBe(SCREEN_OFF);
    expect(f.unit).toBe(countFrame(UNIT, 0));
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

describe("alertPulse", () => {
  it("is dark for a short blip rather than half the cycle", () => {
    // A 50/50 strobe is hard to read, and reading it is the point. Sampled
    // across a whole period rather than asserted on the constants, which would
    // just restate them.
    let dark = 0;
    for (let t = 0; t < ALERT_PULSE_MS; t++) if (alertPulse(t)) dark++;
    expect(dark).toBeGreaterThan(0);
    expect(dark).toBeLessThan(ALERT_PULSE_MS / 2);
  });

  it("holds the dark beat long enough to survive a dropped frame", () => {
    // Two frames at 60Hz is 33ms; anything shorter can vanish entirely.
    let dark = 0;
    for (let t = 0; t < ALERT_PULSE_MS; t++) if (alertPulse(t)) dark++;
    expect(dark).toBeGreaterThan(33);
  });

  it("repeats on the period, so it never drifts against the clock", () => {
    for (const t of [0, 137, 499, 550, 599]) {
      expect(alertPulse(t + ALERT_PULSE_MS * 7), `t=${t}`).toBe(alertPulse(t));
    }
  });

  it("is lit at the start of a cycle, so a fresh alert shows its counts", () => {
    expect(alertPulse(0)).toBe(false);
  });

  it("clears the entry flash inside one blink cycle", () => {
    // The stinger paints over the screen; outlasting a whole period would make
    // the first blink invisible and the alarm read as a solid red box.
    expect(ALERT_FLASH_MS).toBeLessThan(ALERT_PULSE_MS);
  });
});

describe("framesFor", () => {
  it("reads the same three numbers the detail line prints", () => {
    const f = framesFor({ ...quiet, total: 3, alerted: 1, suspicious: 2 });
    expect(f.unit).toBe(countFrame(UNIT, 3));
    expect(f.spot).toBe(countFrame(SPOT, 1));
    expect(f.susp).toBe(countFrame(SUSP, 2));
  });

  it("lights the screen whenever there is a snapshot at all", () => {
    expect(framesFor(quiet).screen).toBe(SCREEN_ON);
  });

  it("drops every indicator to dark on the alert pulse", () => {
    // The whole panel blinks as one — four things blinking independently would
    // read as a fault rather than an alarm.
    const alert = { ...quiet, status: "ALERT", total: 4, alerted: 2, suspicious: 1 };
    const off = framesFor(alert, true);
    expect(off.unit).toBe(countBlinkFrame(UNIT));
    expect(off.spot).toBe(countBlinkFrame(SPOT));
    expect(off.susp).toBe(countBlinkFrame(SUSP));
    expect(off.badge).toBe(badgeFrame("blink"));
  });

  it("ignores the pulse unless the phase is actually ALERT", () => {
    const searching = { ...quiet, status: "EVASION", total: 4 };
    expect(framesFor(searching, true)).toEqual(framesFor(searching, false));
  });

  it("keeps every frame inside the sheet for a busy base", () => {
    const f = framesFor({ ...quiet, status: "ALERT", total: 40, alerted: 12, suspicious: 9 });
    for (const [name, v] of Object.entries(f)) {
      if (name === "screen") continue;
      expect(v, name).toBeLessThan(INDICATOR_FRAME_COUNT);
    }
  });
});
