import Phaser from "phaser";
import {
  advanceTrace,
  beatsPerMinute,
  createTrace,
  flatlinePulse,
  traceAngle,
  traceColor,
  type TraceState,
} from "./ekg";
import { FONT_MONO } from "./fonts";
import { BIO_DIAL_SIZE, BIO_DIAL_TOP } from "./hudLayout";

/** Radius of the isoelectric ring — where the trace sits between beats. */
const BASE_RADIUS = 26;

/** Pixels of radial throw at full amplitude, so the R spike reaches r=37. */
const AMPLITUDE_PX = 11;

/** The bezel, and with it the dial's footprint. Derived so the two cannot drift. */
const BEZEL_RADIUS = BIO_DIAL_SIZE / 2;

/**
 * Samples around the ring, at roughly one per pixel of arc — the same density the
 * strip version had per pixel of width.
 */
const SAMPLE_COUNT = Math.round(2 * Math.PI * BASE_RADIUS);

/**
 * Alpha bands used to fade the trace behind the sweep head.
 *
 * Per-segment alpha would mean ~163 `strokePath` calls every frame, in a widget that
 * redraws in a second 60fps scene. Six bands is indistinguishable at this size.
 */
const FADE_BANDS = 6;
const FADE_NEWEST = 1;
const FADE_OLDEST = 0.25;

const PANEL_FILL = 0x11202b;
const BEZEL_COLOR = 0x2b4356;
const BASELINE_COLOR = 0x1c2c38;

const LABEL_COLOR = "#8899aa";

/** `#rrggbb` for a Phaser fill colour, so the readout can take the trace's colour. */
function css(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * Rowan's bio-integrity, as an EKG bent into a dial.
 *
 * This was a fill bar, then a left-to-right strip. The strip read correctly and that
 * was the problem: a scrolling trace is *our* medical iconography, so the player
 * recognised a hospital instead of noticing an instrument. Wrapping it into a ring
 * that sweeps counter-clockwise keeps everything the trace earned — rate, shape,
 * colour, flatline — while making the machine itself unfamiliar, which is the whole
 * point of a facility that will not call the body it is monitoring a subject's.
 *
 * The waveform lives in {@link ekg}, unchanged by the move: `advanceTrace` fills an
 * index-addressed ring buffer, and whether index `i` means a column or an angle was
 * always this file's business. Angles come from `traceAngle`.
 */
export class BioMonitor {
  private readonly trace: TraceState;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly bpmValue: Phaser.GameObjects.Text;
  private readonly bpmUnit: Phaser.GameObjects.Text;
  private readonly cx: number;
  private readonly cy: number;
  /** Last rendered readout, so a Text re-render only happens when it changed. */
  private lastBpm = "";
  private lastColor = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.cx = x + BEZEL_RADIUS;
    this.cy = y + BIO_DIAL_TOP + BEZEL_RADIUS;

    scene.add
      .text(x, y, "BIO-INTEGRITY", { fontFamily: FONT_MONO, fontSize: "11px", color: LABEL_COLOR })
      .setScrollFactor(0)
      .setDepth(1000);

    // Dial face and bezel, drawn once. The bezel matches `Radar`'s so the HUD's two
    // circular instruments read as a family rather than as a coincidence.
    scene.add
      .graphics()
      .fillStyle(PANEL_FILL, 1)
      .fillCircle(this.cx, this.cy, BEZEL_RADIUS)
      .lineStyle(2, BEZEL_COLOR, 1)
      .strokeCircle(this.cx, this.cy, BEZEL_RADIUS)
      .setScrollFactor(0)
      .setDepth(1000);

    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(1001);

    // The rate goes in the middle of the dial, where a dial's number belongs and
    // where there is otherwise nothing but face.
    this.bpmValue = scene.add
      .text(this.cx, this.cy - 4, "", {
        fontFamily: FONT_MONO,
        fontSize: "15px",
        color: LABEL_COLOR,
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1002);
    this.bpmUnit = scene.add
      .text(this.cx, this.cy + 10, "BPM", {
        fontFamily: FONT_MONO,
        fontSize: "9px",
        color: LABEL_COLOR,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1002);

    this.trace = createTrace(SAMPLE_COUNT);
  }

  /**
   * Steps the sweep and redraws it.
   *
   * @param deltaMs frame time. Callers pass 0 to hold the trace still — the sim is
   *   suspended behind an overlay and a heart beating through the pause menu is a lie
   *   about whether the game is running.
   */
  update(hp: number, maxHp: number, deltaMs: number): void {
    const frac = maxHp > 0 ? Phaser.Math.Clamp(hp / maxHp, 0, 1) : 0;
    advanceTrace(this.trace, deltaMs / 1000, frac);

    const color = traceColor(frac);
    // Flatlined, not merely critical: the alarm is for a heart that has stopped, and
    // it must not start throbbing while there is still one to read.
    const flatlined = frac <= 0;
    const pulse = flatlined ? flatlinePulse(performance.now()) : 1;
    this.draw(color, flatlined ? pulse : null);

    const bpm = frac > 0 ? `${Math.round(beatsPerMinute(frac))}` : "---";
    if (bpm !== this.lastBpm) {
      this.bpmValue.setText(bpm);
      this.lastBpm = bpm;
    }
    if (color !== this.lastColor) {
      const hex = css(color);
      this.bpmValue.setColor(hex);
      this.bpmUnit.setColor(hex);
      this.lastColor = color;
    }
    // The readout alarms with the ring rather than sitting steady inside it — half a
    // pulsing instrument reads as a rendering bug, not as an alarm. Set every frame
    // (unlike the text and colour, which are memoised) because it changes every frame.
    this.bpmValue.setAlpha(pulse);
    this.bpmUnit.setAlpha(pulse);
  }

  /** Screen position of sample `i`, at its amplitude. */
  private point(i: number): { x: number; y: number } {
    const sample = this.trace.samples[i];
    const r = BASE_RADIUS + sample * AMPLITUDE_PX;
    const theta = traceAngle(i, this.trace.samples.length);
    return { x: this.cx + r * Math.cos(theta), y: this.cy + r * Math.sin(theta) };
  }

  /**
   * Draws the ring, brightest at the sweep head and dimming with age.
   *
   * Walked oldest band first so the bright end lands on top at the seams. Each band
   * reaches one sample past its own end, because a band that stopped exactly at its
   * boundary would leave the segment spanning it undrawn — five hairline gaps around
   * the dial, evenly spaced, which reads as a rendering fault rather than as a fade.
   *
   * A `NaN` sample is the erase gap ahead of the head and ends the current sub-path;
   * stroking through it would draw a chord back across the dial to whatever the
   * previous revolution left there.
   *
   * @param pulse when flatlined, the alarm alpha every band takes instead of the age
   *   ramp — `null` while there is still a heartbeat. The fade describes a sweep:
   *   where the head is and which way it went. A flat trace has no such structure for
   *   it to describe, so keeping the ramp there would leave a ring that both fades and
   *   throbs and reads as neither. Overriding it makes dead and alive differ in shape
   *   rather than only in colour. The erase gap still breaks the ring, so the machine
   *   is visibly still sweeping and still finding nothing.
   */
  private draw(color: number, pulse: number | null): void {
    const g = this.graphics;
    const n = this.trace.samples.length;
    const head = Math.floor(this.trace.cursor);
    g.clear();

    g.lineStyle(1, BASELINE_COLOR, 1);
    g.strokeCircle(this.cx, this.cy, BASE_RADIUS);

    const perBand = n / FADE_BANDS;
    for (let band = FADE_BANDS - 1; band >= 0; band--) {
      const alpha =
        pulse ??
        FADE_NEWEST - ((FADE_NEWEST - FADE_OLDEST) * band) / Math.max(1, FADE_BANDS - 1);
      g.lineStyle(1, color, alpha);

      let open = false;
      // `age` counts back from the head, so band 0 is the freshest arc.
      const from = Math.round(band * perBand);
      const to = Math.round((band + 1) * perBand);
      for (let age = from; age <= to; age++) {
        const i = (head - age + n * 2) % n;
        if (Number.isNaN(this.trace.samples[i])) {
          if (open) g.strokePath();
          open = false;
          continue;
        }
        const { x, y } = this.point(i);
        if (!open) {
          g.beginPath();
          g.moveTo(x, y);
          open = true;
        } else {
          g.lineTo(x, y);
        }
      }
      if (open) g.strokePath();
    }
  }
}
