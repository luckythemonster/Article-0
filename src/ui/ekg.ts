/**
 * The bio-integrity monitor's waveform model.
 *
 * Split out of {@link BioMonitor} the way `format.ts` was split out of
 * `PauseMenuView`: everything here is arithmetic over numbers, so it can be pinned
 * down in a node test run without dragging Phaser in. The widget that draws it owns
 * no logic beyond turning these samples into line segments.
 *
 * The display it feeds replaced a plain fill bar. A bar could only say *how much*
 * bio-integrity is left; the trace says that three ways at once — the rate climbs,
 * the complex shrinks, the colour crosses the same two thresholds the bar used — and
 * at zero it does the one thing a bar cannot, which is flatline.
 */

/**
 * Samples the sweep crosses per second.
 *
 * Counted in samples rather than pixels because the trace is drawn around a dial: a
 * sample is one step of arc, and how many pixels that is depends on the radius the
 * widget picked. Over the ~163-sample ring {@link BioMonitor} builds, this is a
 * revolution every ~3.5s — about 3.6 complexes around the dial at rest, and roughly
 * nine once the rate is critical.
 */
const SWEEP_SAMPLES_PER_SEC = 46;

/**
 * Samples blanked ahead of the write cursor.
 *
 * The erase gap on a bedside monitor: without it the cursor writes straight over the
 * previous sweep and there is no visible "now", just a waveform that changes in place.
 */
const ERASE_GAP = 5;

/** Resting rate, at full bio-integrity. */
const BPM_CALM = 62;

/** Rate as bio-integrity reaches zero. */
const BPM_CRITICAL = 150;

/**
 * Where the rate curve steepens.
 *
 * Above this the climb is gentle — losing the first third of your health should read
 * as exertion, not as an emergency. Below it the remaining range is spent fast, so
 * the critical band is unmistakable at a glance rather than a shade of the same thing.
 */
const BPM_KNEE = 0.35;

/** Amplitude of the complex at full health, and at zero. */
const AMPLITUDE_STRONG = 1;
const AMPLITUDE_WEAK = 0.45;

/** The bar's colour thresholds, kept verbatim so the danger signal did not move. */
const COLOR_OK = 0x59d98e;
const COLOR_WARN = 0xffb03b;
const COLOR_CRITICAL = 0xff3b3b;

/** A finite `frac` in 0..1. Junk (NaN, ±Infinity) reads as flatlined, not as full. */
function clampFrac(frac: number): number {
  if (!Number.isFinite(frac)) return 0;
  return frac < 0 ? 0 : frac > 1 ? 1 : frac;
}

/** A rounded bump of unit height, centred in `[from, to)` and zero outside it. */
function bump(phase: number, from: number, to: number): number {
  if (phase < from || phase >= to) return 0;
  return Math.sin(((phase - from) / (to - from)) * Math.PI);
}

/**
 * One cardiac cycle, as amplitude in −1..1 over `phase`.
 *
 * P wave, then the QRS complex — a shallow Q dip, the tall R spike, a deeper S dip —
 * then the rounded T, then an isoelectric tail out to the next beat. The R spike is
 * built from straight ramps rather than a curve on purpose: the sharp corner is the
 * whole silhouette of an EKG, and a smooth peak of the same height reads as a sine
 * wave with extra steps.
 *
 * The phase wraps, so callers can accumulate beats without ever normalising.
 */
export function pqrst(phase: number): number {
  if (!Number.isFinite(phase)) return 0;
  const t = phase - Math.floor(phase);

  // P — atrial depolarisation, a low bump well clear of the complex.
  if (t < 0.16) return 0.15 * bump(t, 0.02, 0.14);

  // QRS — the part that has to be sharp. Ramps, not curves.
  if (t < 0.2) return -0.18 * ((t - 0.16) / 0.04); // Q, down
  if (t < 0.23) return -0.18 + 1.18 * ((t - 0.2) / 0.03); // R, up through zero
  if (t < 0.26) return 1 - 1.28 * ((t - 0.23) / 0.03); // R, down past zero
  if (t < 0.3) return -0.28 + 0.28 * ((t - 0.26) / 0.04); // S, back to baseline

  // T — ventricular repolarisation, broad and low.
  if (t < 0.52) return 0.28 * bump(t, 0.34, 0.52);

  // Isoelectric until the next P.
  return 0;
}

/**
 * Heart rate for a bio-integrity fraction.
 *
 * Two straight segments meeting at {@link BPM_KNEE} rather than one curve, because the
 * knee is the point of the shape and an eased curve blurs exactly the moment the
 * player needs to notice.
 */
export function beatsPerMinute(frac: number): number {
  const f = clampFrac(frac);
  // Rate rises as health falls, so both segments are written against "how far gone".
  if (f >= BPM_KNEE) {
    const gone = (1 - f) / (1 - BPM_KNEE); // 0 at full, 1 at the knee
    return BPM_CALM + (BPM_CRITICAL - BPM_CALM) * 0.4 * gone;
  }
  const gone = 1 - f / BPM_KNEE; // 0 at the knee, 1 at zero
  const atKnee = BPM_CALM + (BPM_CRITICAL - BPM_CALM) * 0.4;
  return atKnee + (BPM_CRITICAL - atKnee) * gone;
}

/** How tall the complex draws. A failing heart makes a smaller one. */
export function traceAmplitude(frac: number): number {
  const f = clampFrac(frac);
  return AMPLITUDE_WEAK + (AMPLITUDE_STRONG - AMPLITUDE_WEAK) * f;
}

/** Trace colour, on the thresholds the fill bar used before it. */
export function traceColor(frac: number): number {
  const f = clampFrac(frac);
  return f > 0.5 ? COLOR_OK : f > 0.25 ? COLOR_WARN : COLOR_CRITICAL;
}

/**
 * Where sample `index` of `count` sits on the dial, in radians.
 *
 * Starts at 12 o'clock and runs **counter-clockwise**. The trace is bent into a ring
 * rather than scrolled along a line because a strip chart is our medical iconography —
 * a player reads it as a hospital they already know. The facility watching Rowan is
 * not working inside that paradigm, and running the sweep backwards is the cheapest
 * way to say so: legible, but it takes a beat to place why it feels wrong.
 *
 * Screen y points down, which mirrors the usual sense of rotation — so it is
 * *subtracting* the angle that runs counter-clockwise on screen. That inversion is
 * easy to reintroduce by accident from inside a draw call, which is why the convention
 * lives here with a test on it rather than inline in {@link BioMonitor}.
 */
export function traceAngle(index: number, count: number): number {
  if (!Number.isFinite(index) || !Number.isFinite(count) || count <= 0) return -Math.PI / 2;
  return -Math.PI / 2 - (index / count) * Math.PI * 2;
}

/**
 * The sweep's ring buffer.
 *
 * `samples[x]` is the amplitude drawn in column `x`, or `NaN` for a column inside the
 * erase gap — the widget breaks its polyline there rather than drawing a line across
 * the gap to whatever the last sweep left.
 */
export interface TraceState {
  readonly samples: Float32Array;
  /** Write head, in columns; fractional between frames. */
  cursor: number;
  /** Beats elapsed. Only the fraction matters to {@link pqrst}, which wraps it. */
  beatPhase: number;
}

/** A blank trace `width` columns wide. */
export function createTrace(width: number): TraceState {
  const samples = new Float32Array(Math.max(1, Math.floor(width)));
  samples.fill(Number.NaN);
  return { samples, cursor: 0, beatPhase: 0 };
}

/**
 * Advances the sweep by `dtSeconds`, writing every column it crosses.
 *
 * Columns advanced in one call are capped at the buffer width: a delta from a tabbed-out
 * window is measured in whole seconds, and without the cap that is an unbounded loop
 * writing the same buffer hundreds of times over for a result the player never sees.
 * One full wipe is all a gap that long can legibly mean.
 */
export function advanceTrace(state: TraceState, dtSeconds: number, frac: number): void {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
  const width = state.samples.length;

  const advance = dtSeconds * SWEEP_SAMPLES_PER_SEC;
  const columns = Math.min(width, Math.floor(state.cursor + advance) - Math.floor(state.cursor));
  const secondsPerColumn = 1 / SWEEP_SAMPLES_PER_SEC;
  const beatsPerColumn = (beatsPerMinute(frac) / 60) * secondsPerColumn;
  const amplitude = traceAmplitude(frac);
  const flat = clampFrac(frac) <= 0;

  for (let i = 0; i < columns; i++) {
    state.beatPhase += beatsPerColumn;
    const x = (Math.floor(state.cursor) + 1 + i) % width;
    // Dead is dead: the sweep keeps running so the flatline draws itself across the
    // window, which is the whole reason this display exists.
    state.samples[x] = flat ? 0 : pqrst(state.beatPhase) * amplitude;
    for (let g = 1; g <= ERASE_GAP; g++) state.samples[(x + g) % width] = Number.NaN;
  }

  state.cursor = (state.cursor + advance) % width;
  // Keep the accumulator small enough that float precision never coarsens the
  // waveform on a long run.
  state.beatPhase -= Math.floor(state.beatPhase);
}
