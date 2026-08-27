import { describe, it, expect } from "vitest";
import {
  DIRECTIONS,
  TICK_FRAME_COUNT,
  TICK_SIZE,
  frameFor,
  jammedFrameFor,
  scanPulse,
  sourcePulse,
  stateForLevel,
  tickFrame,
  tickOffset,
  type Direction,
} from "./radarDirections";
import { NOISE_SECTORS } from "../systems/Radar";
import { UI_TEXTURES } from "./UiTextures";

const SHEET = UI_TEXTURES.find((t) => t.key === "ui-radar-directions");
const BEZEL = UI_TEXTURES.find((t) => t.key === "ui-radar-bezel");
const STATES = ["ping", "loud", "medium", "quiet", "dark"] as const;

describe("radarDirections manifest", () => {
  it("declares the sheet to the loader at the size it was cut", () => {
    expect(SHEET?.size).toBe(TICK_SIZE);
    expect(SHEET?.sheet?.count).toBe(TICK_FRAME_COUNT);
  });

  it("keeps the ticks a separate texture from the ring", () => {
    // The ring is one static image and these are a grid; conflating them would
    // end the static-ring assertion in tools/radar/build_radar_bezel.py.
    expect(BEZEL?.sheet).toBeUndefined();
    expect(SHEET?.key).not.toBe(BEZEL?.key);
  });

  it("has one direction per radar sector", () => {
    expect(DIRECTIONS).toHaveLength(NOISE_SECTORS);
    expect(new Set(DIRECTIONS).size).toBe(NOISE_SECTORS);
  });

  it("gives every direction a distinct spot inside the bezel", () => {
    const seen = new Map<string, Direction>();
    for (const dir of DIRECTIONS) {
      const { x, y } = tickOffset(dir);
      // Inside the 96x96 art, with the whole tick on the canvas.
      expect(x, dir).toBeGreaterThanOrEqual(0);
      expect(y, dir).toBeGreaterThanOrEqual(0);
      expect(x + TICK_SIZE, dir).toBeLessThanOrEqual(96);
      expect(y + TICK_SIZE, dir).toBeLessThanOrEqual(96);
      const at = `${x},${y}`;
      expect(seen.has(at), `${dir} overlaps ${seen.get(at)}`).toBe(false);
      seen.set(at, dir);
    }
  });
});

describe("tickFrame", () => {
  it("keeps every frame inside the sheet", () => {
    for (const dir of DIRECTIONS) {
      for (const state of STATES) {
        const f = tickFrame(dir, state);
        expect(f, `${dir}/${state}`).toBeGreaterThanOrEqual(0);
        expect(f, `${dir}/${state}`).toBeLessThan(TICK_FRAME_COUNT);
      }
    }
  });

  it("never gives two directions the same frame", () => {
    const claimed = new Map<number, string>();
    for (const dir of DIRECTIONS) {
      for (const state of STATES) {
        const f = tickFrame(dir, state);
        expect(claimed.has(f), `${dir}/${state} collides with ${claimed.get(f)}`).toBe(false);
        claimed.set(f, `${dir}/${state}`);
      }
    }
    expect(claimed.size).toBe(DIRECTIONS.length * STATES.length);
  });
});

describe("stateForLevel", () => {
  it("reports nothing audible at zero", () => {
    expect(stateForLevel(0)).toBeNull();
    expect(stateForLevel(-1)).toBeNull();
  });

  it("climbs quiet to medium to loud as a source closes", () => {
    expect(stateForLevel(0.1)).toBe("quiet");
    expect(stateForLevel(0.5)).toBe("medium");
    expect(stateForLevel(0.9)).toBe("loud");
    expect(stateForLevel(1)).toBe("loud");
  });

  it("is monotonic — closing on a source never makes it read quieter", () => {
    const rank = { quiet: 1, medium: 2, loud: 3 };
    let last = 0;
    for (let level = 0.01; level <= 1; level += 0.01) {
      const state = stateForLevel(level);
      expect(state).not.toBeNull();
      const r = rank[state as keyof typeof rank];
      expect(r, `at ${level.toFixed(2)}`).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });
});

describe("the blink, as a function of the clock", () => {
  it("idles lit briefly and dark for most of its cycle", () => {
    expect(scanPulse(0)).toBe(true);
    expect(scanPulse(35)).toBe(true);
    expect(scanPulse(300)).toBe(false);
    expect(scanPulse(1200)).toBe(false);
  });

  it("blinks a source far faster than the idle sweep", () => {
    // Count lit frames over a second at 60Hz: a source must be lit far more often.
    let scan = 0;
    let source = 0;
    for (let t = 0; t < 1000; t += 1000 / 60) {
      if (scanPulse(t)) scan++;
      if (sourcePulse(t)) source++;
    }
    expect(source).toBeGreaterThan(scan * 5);
  });

  it("is periodic, so a long session looks like a short one", () => {
    for (const t of [0, 17, 340, 921]) {
      expect(scanPulse(t + 1296 * 9), `scan ${t}`).toBe(scanPulse(t));
      expect(sourcePulse(t + 136 * 40), `source ${t}`).toBe(sourcePulse(t));
    }
  });
});

describe("frameFor", () => {
  it("shows the idle sweep on a silent bearing, never a loudness colour", () => {
    for (const dir of DIRECTIONS) {
      const lit = frameFor(dir, 0, 0);
      const dark = frameFor(dir, 0, 300);
      expect(lit).toBe(tickFrame(dir, "ping"));
      expect(dark).toBe(tickFrame(dir, "dark"));
    }
  });

  it("blinks the loudness band on an audible bearing", () => {
    const dir = DIRECTIONS[0];
    expect(frameFor(dir, 0.9, 0)).toBe(tickFrame(dir, "loud"));
    expect(frameFor(dir, 0.5, 0)).toBe(tickFrame(dir, "medium"));
    expect(frameFor(dir, 0.1, 0)).toBe(tickFrame(dir, "quiet"));
    // ...and drops to the same dark tick on the blink's off half.
    expect(frameFor(dir, 0.9, 120)).toBe(tickFrame(dir, "dark"));
  });

  it("stays inside the sheet for any level and any instant", () => {
    for (const dir of DIRECTIONS) {
      for (const level of [0, 0.01, 0.33, 0.66, 1]) {
        for (const t of [0, 37, 99, 500, 123456]) {
          const f = frameFor(dir, level, t);
          expect(f, `${dir} ${level} @${t}`).toBeGreaterThanOrEqual(0);
          expect(f, `${dir} ${level} @${t}`).toBeLessThan(TICK_FRAME_COUNT);
        }
      }
    }
  });
});

describe("jammedFrameFor", () => {
  it("cycles colours that mean nothing, rather than going dark", () => {
    const dir = DIRECTIONS[0];
    const seen = new Set<number>();
    for (let t = 0; t < 1000; t += 17) seen.add(jammedFrameFor(dir, t));
    // Every lit band plus the dark one — a readout showing garbage.
    expect(seen.size).toBeGreaterThan(2);
  });

  it("does not strobe all eight bearings in unison", () => {
    // In-step ticks would read as a deliberate signal instead of interference.
    const atOnce = new Set(DIRECTIONS.map((d) => jammedFrameFor(d, 0) - tickFrame(d, "ping")));
    expect(atOnce.size).toBeGreaterThan(1);
  });

  it("stays inside the sheet at any instant", () => {
    for (const dir of DIRECTIONS) {
      for (const t of [0, 1, 67, 68, 4321, 999999]) {
        const f = jammedFrameFor(dir, t);
        expect(f, `${dir} @${t}`).toBeGreaterThanOrEqual(0);
        expect(f, `${dir} @${t}`).toBeLessThan(TICK_FRAME_COUNT);
      }
    }
  });
});
