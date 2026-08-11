import { describe, it, expect } from "vitest";
import {
  advanceTrace,
  beatsPerMinute,
  createTrace,
  flatlinePulse,
  pqrst,
  traceAmplitude,
  traceAngle,
  traceColor,
} from "./ekg";
import { UI, hex } from "./hudTheme";

/** Every sample of one cycle, at the resolution the sweep actually writes. */
function cycle(step = 0.001): number[] {
  const out: number[] = [];
  for (let t = 0; t < 1; t += step) out.push(pqrst(t));
  return out;
}

describe("pqrst", () => {
  it("stays finite and inside ±1 across the whole cycle", () => {
    for (const v of cycle()) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it("makes the R spike the dominant feature", () => {
    const samples = cycle();
    const peak = Math.max(...samples);
    expect(peak).toBeCloseTo(1, 2);

    // Nothing else in the cycle comes close, in either direction — that contrast is
    // what reads as an EKG rather than as an oscillation.
    const away = samples.filter((_, i) => i * 0.001 < 0.18 || i * 0.001 > 0.3);
    expect(Math.max(...away.map(Math.abs))).toBeLessThan(0.4);
  });

  it("rises and falls within a few hundredths of a beat", () => {
    // A rounded peak of the same height would not read as a heartbeat. Pin the
    // sharpness: baseline-to-peak-to-baseline inside a tenth of the cycle.
    expect(pqrst(0.19)).toBeLessThan(0);
    expect(pqrst(0.23)).toBeCloseTo(1, 5);
    expect(pqrst(0.27)).toBeLessThan(0);
  });

  it("returns to the isoelectric baseline between beats", () => {
    expect(pqrst(0)).toBe(0);
    expect(pqrst(0.6)).toBe(0);
    expect(pqrst(0.95)).toBe(0);
  });

  it("wraps, so callers can accumulate beats without normalising", () => {
    expect(pqrst(7.23)).toBeCloseTo(pqrst(0.23), 10);
    expect(pqrst(-0.77)).toBeCloseTo(pqrst(0.23), 10);
  });

  it("degrades to the baseline on junk instead of propagating NaN", () => {
    expect(pqrst(Number.NaN)).toBe(0);
    expect(pqrst(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("beatsPerMinute", () => {
  it("rests near 62 at full bio-integrity and peaks near 150 at zero", () => {
    expect(beatsPerMinute(1)).toBeCloseTo(62, 5);
    expect(beatsPerMinute(0)).toBeCloseTo(150, 5);
  });

  it("never falls as health falls", () => {
    let previous = beatsPerMinute(1);
    for (let f = 1; f >= 0; f -= 0.01) {
      const bpm = beatsPerMinute(f);
      expect(bpm).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = bpm;
    }
  });

  it("is continuous across the knee", () => {
    // Two segments meeting at 0.35. They have deliberately different slopes, so this
    // has to be probed tightly — the point is that there is no step, not that the
    // rate is flat through the corner.
    expect(beatsPerMinute(0.35 + 1e-9)).toBeCloseTo(beatsPerMinute(0.35 - 1e-9), 6);
  });

  it("spends most of its range below the knee, where the emergency is", () => {
    // Losing the first two thirds should read as exertion; the last third is what has
    // to feel different. More than half the total climb belongs below the knee.
    const climbAbove = beatsPerMinute(0.35) - beatsPerMinute(1);
    const climbBelow = beatsPerMinute(0) - beatsPerMinute(0.35);
    expect(climbBelow).toBeGreaterThan(climbAbove);
  });

  it("treats junk as flatlined rather than as healthy", () => {
    expect(beatsPerMinute(Number.NaN)).toBeCloseTo(150, 5);
    expect(beatsPerMinute(-3)).toBeCloseTo(150, 5);
    expect(beatsPerMinute(9)).toBeCloseTo(62, 5);
  });
});

describe("traceAmplitude", () => {
  it("shrinks the complex as bio-integrity drops, without vanishing", () => {
    expect(traceAmplitude(1)).toBeCloseTo(1, 5);
    expect(traceAmplitude(0)).toBeCloseTo(0.45, 5);
    expect(traceAmplitude(0.5)).toBeGreaterThan(traceAmplitude(0.2));
  });
});

describe("traceColor", () => {
  // These are the thresholds the fill bar used before the EKG replaced it. The
  // display changed; the danger signal must not have.
  //
  // Asserted against the palette rather than against literals: the boundaries are
  // what this test is for, and pinning the hex here would mean a palette change had
  // to be made in two places, which is the drift `hudTheme.test.ts` exists to stop.
  // (`COLOR_OK` was `0x59d98e`, matching no token; it is now `--c-green`.)
  it("keeps the bar's boundaries exactly", () => {
    expect(traceColor(1)).toBe(hex(UI.green));
    expect(traceColor(0.51)).toBe(hex(UI.green));
    expect(traceColor(0.5)).toBe(hex(UI.amber));
    expect(traceColor(0.26)).toBe(hex(UI.amber));
    expect(traceColor(0.25)).toBe(hex(UI.redDeep));
    expect(traceColor(0)).toBe(hex(UI.redDeep));
  });

  it("keeps the three bands distinct", () => {
    // Guards the reconciliation itself: three tokens that collapsed to one value
    // would still satisfy every assertion above.
    const bands = new Set([traceColor(1), traceColor(0.4), traceColor(0.1)]);
    expect(bands.size).toBe(3);
  });
});

describe("flatlinePulse", () => {
  /** One second of the alarm, finely sampled. */
  const sweep = (): number[] => {
    const out: number[] = [];
    for (let ms = 0; ms < 1000; ms += 1) out.push(flatlinePulse(ms));
    return out;
  };

  it("stays within its alpha bounds", () => {
    for (const a of sweep()) {
      expect(a).toBeGreaterThanOrEqual(0.3 - 1e-9);
      expect(a).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("actually throbs across the full range", () => {
    // The assertion that fails if the sine is ever flattened to a constant, or if the
    // swing is tuned down far enough that the alarm stops reading as one.
    const values = sweep();
    expect(Math.min(...values)).toBeCloseTo(0.3, 2);
    expect(Math.max(...values)).toBeCloseTo(1, 2);
  });

  it("cycles about once every 700ms", () => {
    // Slow enough to read as a pulse rather than a flicker, fast enough to feel urgent
    // across the ~1.2s the death hold gives it — call it two throbs before the card.
    const period = 2 * Math.PI * 110;
    expect(period).toBeGreaterThan(600);
    expect(period).toBeLessThan(800);
    expect(flatlinePulse(0)).toBeCloseTo(flatlinePulse(period), 6);
    expect(flatlinePulse(250)).toBeCloseTo(flatlinePulse(250 + period), 6);
  });

  it("fails bright rather than invisible on junk", () => {
    // An alarm that degrades to alpha 0 is worse than one stuck on.
    expect(flatlinePulse(Number.NaN)).toBe(1);
    expect(flatlinePulse(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("traceAngle", () => {
  /** Where a sample lands on a unit dial, in screen coordinates (y down). */
  const at = (index: number, count = 120): { x: number; y: number } => {
    const t = traceAngle(index, count);
    return { x: Math.cos(t), y: Math.sin(t) };
  };

  it("starts at 12 o'clock", () => {
    const p = at(0);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBeCloseTo(-1, 10); // screen y is down, so up is negative
  });

  it("runs counter-clockwise", () => {
    // The assertion that actually pins the direction. A clockwise dial puts the
    // quarter mark at 3 o'clock (x = +1) and every other property here still holds,
    // so this is the one that fails if the sign of the angle is ever flipped.
    const quarter = at(30);
    expect(quarter.x).toBeCloseTo(-1, 10);
    expect(quarter.y).toBeCloseTo(0, 10);

    const half = at(60);
    expect(half.x).toBeCloseTo(0, 10);
    expect(half.y).toBeCloseTo(1, 10);
  });

  it("returns to the start after a full lap", () => {
    const start = at(0);
    const lap = at(120);
    expect(lap.x).toBeCloseTo(start.x, 10);
    expect(lap.y).toBeCloseTo(start.y, 10);
  });

  it("is continuous across the wrap", () => {
    const before = at(119);
    const after = at(120);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.1);
  });

  it("degrades to 12 o'clock on junk rather than emitting NaN", () => {
    expect(traceAngle(Number.NaN, 120)).toBeCloseTo(-Math.PI / 2, 10);
    expect(traceAngle(0, 0)).toBeCloseTo(-Math.PI / 2, 10);
    expect(traceAngle(0, -5)).toBeCloseTo(-Math.PI / 2, 10);
  });
});

describe("advanceTrace", () => {
  it("starts blank, so nothing is drawn before the first sweep", () => {
    const trace = createTrace(64);
    expect([...trace.samples].every(Number.isNaN)).toBe(true);
  });

  it("does nothing on a zero or junk delta", () => {
    const trace = createTrace(64);
    advanceTrace(trace, 0, 1);
    advanceTrace(trace, Number.NaN, 1);
    advanceTrace(trace, -0.5, 1);
    expect(trace.cursor).toBe(0);
    expect([...trace.samples].every(Number.isNaN)).toBe(true);
  });

  it("writes the columns the cursor crosses", () => {
    const trace = createTrace(64);
    advanceTrace(trace, 0.5, 1);
    expect(trace.samples.some((s) => !Number.isNaN(s))).toBe(true);
    expect(trace.cursor).toBeGreaterThan(0);
  });

  it("leaves an erase gap ahead of the cursor", () => {
    const trace = createTrace(64);
    advanceTrace(trace, 0.5, 1);
    const head = Math.floor(trace.cursor);
    // The written column is behind the head; the columns in front of it are cleared,
    // which is what gives the sweep a visible leading edge.
    expect(Number.isNaN(trace.samples[(head + 1) % 64])).toBe(true);
    expect(Number.isNaN(trace.samples[(head + 3) % 64])).toBe(true);
  });

  it("survives a tabbed-out delta without over-running the buffer", () => {
    const trace = createTrace(64);
    advanceTrace(trace, 600, 1);
    expect(trace.cursor).toBeGreaterThanOrEqual(0);
    expect(trace.cursor).toBeLessThan(64);
    for (const s of trace.samples) expect(Number.isNaN(s) || Number.isFinite(s)).toBe(true);
  });

  it("flatlines at zero bio-integrity", () => {
    const trace = createTrace(64);
    advanceTrace(trace, 1, 0);
    const written = [...trace.samples].filter((s) => !Number.isNaN(s));
    expect(written.length).toBeGreaterThan(0);
    for (const s of written) expect(s).toBe(0);
  });

  it("keeps the beat phase bounded over a long run", () => {
    const trace = createTrace(180);
    for (let i = 0; i < 5_000; i++) advanceTrace(trace, 1 / 60, 0.8);
    expect(trace.beatPhase).toBeGreaterThanOrEqual(0);
    expect(trace.beatPhase).toBeLessThan(1);
  });

  it("beats faster when health is low", () => {
    const beats = (frac: number): number => {
      const trace = createTrace(180);
      let peaks = 0;
      let previous = 0;
      // Ten seconds at 60fps, counting R spikes.
      for (let i = 0; i < 600; i++) {
        advanceTrace(trace, 1 / 60, frac);
        const phase = trace.beatPhase;
        if (phase < previous) peaks++;
        previous = phase;
      }
      return peaks;
    };
    expect(beats(0.1)).toBeGreaterThan(beats(1));
  });
});
