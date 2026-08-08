import Phaser from "phaser";
import { advanceTrace, beatsPerMinute, createTrace, traceColor, type TraceState } from "./ekg";
import { FONT_MONO } from "./fonts";
import { BIO_FRAME_HEIGHT, BIO_FRAME_TOP } from "./hudLayout";

/** Width of the framed trace window; matches the SRP meter's track above it. */
const WIDTH = 180;

// The two vertical numbers come from `hudLayout` rather than living here, because
// `AlertNetworkHud` starts where this widget ends and has no way to ask it.
const HEIGHT = BIO_FRAME_HEIGHT;
const FRAME_TOP = BIO_FRAME_TOP;

/** Panel treatment, shared with the SRP meter's track so the two read as one instrument. */
const PANEL_FILL = 0x11202b;
const PANEL_STROKE = 0x2b4356;
const BASELINE_COLOR = 0x1c2c38;

const LABEL_COLOR = "#8899aa";

/** `#rrggbb` for a Phaser fill colour, so the readout can take the trace's colour. */
function css(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/**
 * Rowan's bio-integrity, as a bedside EKG.
 *
 * This was a fill bar for most of the project's life, stacked directly under the
 * Subjectivity Risk Profile meter — two identical bars, which is what made the
 * top-left block hard to read at a speed the game is actually played at. A trace
 * separates them by shape before the player has read either label, and it suits what
 * the facility is doing: monitoring a body while the statute denies it is a subject's.
 *
 * The waveform itself lives in {@link ekg}. This class owns pixels only — the frame,
 * the polyline, and the BPM readout beside the heading.
 */
export class BioMonitor {
  private readonly trace: TraceState;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly bpmText: Phaser.GameObjects.Text;
  private readonly originX: number;
  private readonly originY: number;
  /** Last rendered readout, so a Text re-render only happens when it changed. */
  private lastBpm = "";
  private lastColor = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.originX = x;
    this.originY = y + FRAME_TOP;

    scene.add
      .text(x, y, "BIO-INTEGRITY", { fontFamily: FONT_MONO, fontSize: "11px", color: LABEL_COLOR })
      .setScrollFactor(0)
      .setDepth(1000);

    // Right-aligned on the heading's row: the rate is the number the bar's width used
    // to be, and it belongs with the label rather than on top of the trace.
    this.bpmText = scene.add
      .text(x + WIDTH, y, "", { fontFamily: FONT_MONO, fontSize: "10px", color: LABEL_COLOR })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000);

    scene.add
      .rectangle(this.originX, this.originY, WIDTH, HEIGHT, PANEL_FILL)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setStrokeStyle(1, PANEL_STROKE);

    this.trace = createTrace(WIDTH - 2);
    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(1001);
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
    this.draw(color);

    const bpm = frac > 0 ? `${Math.round(beatsPerMinute(frac))} BPM` : "--- BPM";
    if (bpm !== this.lastBpm) {
      this.bpmText.setText(bpm);
      this.lastBpm = bpm;
    }
    if (color !== this.lastColor) {
      this.bpmText.setColor(css(color));
      this.lastColor = color;
    }
  }

  /**
   * Walks the sample buffer into line segments.
   *
   * A `NaN` column is the erase gap ahead of the write cursor, and it ends the current
   * sub-path: stroking straight through it would draw a chord back to whatever the
   * previous sweep left there, which is the one artefact that gives away that this is
   * a ring buffer and not a moving stylus.
   */
  private draw(color: number): void {
    const g = this.graphics;
    g.clear();

    // Half-pixel offsets keep a 1px stroke on the pixel rather than straddling two.
    const left = this.originX + 1.5;
    const mid = this.originY + HEIGHT / 2 + 0.5;
    const scale = (HEIGHT - 6) / 2;

    g.lineStyle(1, BASELINE_COLOR, 1);
    g.beginPath();
    g.moveTo(left, mid);
    g.lineTo(left + this.trace.samples.length - 1, mid);
    g.strokePath();

    g.lineStyle(1, color, 1);
    let open = false;
    for (let i = 0; i < this.trace.samples.length; i++) {
      const sample = this.trace.samples[i];
      if (Number.isNaN(sample)) {
        if (open) g.strokePath();
        open = false;
        continue;
      }
      const px = left + i;
      const py = mid - sample * scale;
      if (!open) {
        g.beginPath();
        g.moveTo(px, py);
        open = true;
      } else {
        g.lineTo(px, py);
      }
    }
    if (open) g.strokePath();
  }
}
