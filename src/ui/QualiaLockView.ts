/**
 * The Qualia Phase-Lock minigame's interactive view — a self-contained,
 * framework-agnostic DOM controller (no Phaser, no registry) so the exact same
 * widget drives the in-game {@link QualiaLockScene} overlay and the standalone
 * demo page.
 *
 * It renders an oscilloscope: the statutory **Q0 baseline** in crisp cyan and
 * the rack's **erratic Q>0 live signal** in amber→red, driven by AMPLITUDE /
 * FREQUENCY / PHASE / DAMPING sliders. A `requestAnimationFrame` loop advances
 * the pure {@link QualiaLockState} core, redraws both waves, and refreshes the
 * SIGNAL_DRIFT / ALIGNMENT / STATUS readouts plus the phase-lock and
 * instability meters. Sustaining ≥95% alignment for the lock duration fires
 * `onSolved`; the instability meter filling fires `onPurged`; ABORT / Esc fires
 * `onClose`.
 */
import {
  createState,
  playerWaveAt,
  setPlayer,
  signalDrift,
  targetWaveAt,
  tick,
  type PlayerParams,
  type QualiaLockConfig,
  type QualiaLockState,
  type QualiaRound,
} from "../systems/QualiaLock";
import { DEBUG_ALLOWED } from "../systems/DebugFlag";
import "./QualiaLockView.css";

export interface QualiaLockViewCallbacks {
  /** Fired once the bypass completes (≥95% alignment sustained). */
  onSolved?: () => void;
  /** Fired once the instability meter trips an environmental purge. */
  onPurged?: () => void;
  /** Fired when the player aborts (Esc / ABORT) without a result. */
  onClose?: () => void;
}

const TWO_PI = Math.PI * 2;

/** Live-wave palette (target baseline is the fixed cyan #39d3ff). */
const AMBER: RGB = [255, 176, 59];
const RED: RGB = [255, 59, 59];

type RGB = [number, number, number];

/** A mulberry32 PRNG — deterministic, cheap per-frame jitter for the live wave. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(a: RGB, b: RGB, t: number): string {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = Math.round(a[0] + (b[0] - a[0]) * k);
  const g = Math.round(a[1] + (b[1] - a[1]) * k);
  const bl = Math.round(a[2] + (b[2] - a[2]) * k);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Small typed helper for building elements. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class QualiaLockView {
  private readonly cfg: QualiaLockConfig;
  private readonly callbacks: QualiaLockViewCallbacks;
  private readonly root: HTMLDivElement;
  private readonly state: QualiaLockState;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** Vertical half-range the plot maps to the canvas, with headroom over max A. */
  private readonly yMax: number;

  // Live readout regions, refreshed each frame.
  private readonly driftEl: HTMLSpanElement;
  private readonly alignEl: HTMLSpanElement;
  private readonly statusEl: HTMLDivElement;
  private readonly lockFillEl: HTMLDivElement;
  private readonly lockTimeEl: HTMLSpanElement;
  private readonly instFillEl: HTMLDivElement;
  private readonly bannerEl: HTMLDivElement;
  private readonly debugEl: HTMLDivElement;

  private raf = 0;
  private lastTime = 0;
  private noiseSeed = 0x51ac;
  private cssW = 0;
  private cssH = 0;
  private ended = false;
  /** Debug-only: freezes the lock / instability timers (wave stays live). */
  private debugPaused = false;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      this.callbacks.onClose?.();
    } else if (DEBUG_ALLOWED && (e.key === "p" || e.key === "P")) {
      e.preventDefault();
      this.debugPaused = !this.debugPaused;
      this.updateDebugBadge();
    }
  };

  constructor(mount: HTMLElement, round: QualiaRound, callbacks: QualiaLockViewCallbacks = {}) {
    this.cfg = round.config;
    this.callbacks = callbacks;
    this.state = createState(round.target, round.config, round.initialPlayer);
    this.yMax = round.config.amplitudeRange[1] + 0.2;

    this.root = el("div", "qualia-root");
    const panel = el("div", "qualia-panel");

    const header = el("div", "qualia-header");
    header.append(
      el("span", "qualia-header-title", "◎ QUALIA PHASE-LOCK — DIAGNOSTIC BYPASS"),
      el("span", "qualia-header-sub", "NW-SMAC-01 · SILICATE RACK · Q0 MASK"),
    );

    const flagnote = el(
      "div",
      "qualia-flagnote",
      "Q>0 QUALIA FEEDBACK DETECTED — mask the live signal onto the Q0 baseline and hold ≥85% to complete the bypass.",
    );

    // --- oscilloscope ---
    const scope = el("div", "qualia-scope");
    this.canvas = el("canvas", "qualia-canvas");
    scope.appendChild(this.canvas);
    const legend = el("div", "qualia-legend");
    const legCyan = el("span", "qualia-legend-item");
    legCyan.append(el("span", "qualia-swatch qualia-swatch--target"), document.createTextNode("Q0 BASELINE"));
    const legLive = el("span", "qualia-legend-item");
    legLive.append(el("span", "qualia-swatch qualia-swatch--live"), document.createTextNode("LIVE Q>0 SIGNAL"));
    legend.append(legCyan, legLive);
    scope.appendChild(legend);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("QualiaLockView: 2D canvas context unavailable");
    this.ctx = ctx;

    // --- readouts ---
    const readouts = el("div", "qualia-readouts");
    this.driftEl = el("span", "qualia-readout-val");
    this.alignEl = el("span", "qualia-readout-val");
    readouts.append(
      this.readoutRow("SIGNAL_DRIFT", this.driftEl),
      this.readoutRow("ALIGNMENT", this.alignEl),
    );

    this.statusEl = el("div", "qualia-status");

    // --- meters ---
    const meters = el("div", "qualia-meters");
    this.lockTimeEl = el("span", "qualia-meter-val");
    const lock = this.meterRow("PHASE LOCK", "qualia-fill--lock", this.lockTimeEl);
    this.lockFillEl = lock.fill;
    const inst = this.meterRow("INSTABILITY", "qualia-fill--inst");
    this.instFillEl = inst.fill;
    meters.append(lock.row, inst.row);

    // --- controls ---
    const controls = el("div", "qualia-controls");
    const p = this.state.player;
    controls.append(
      this.slider("AMPLITUDE", "", round.config.amplitudeRange, 0.01, p.amplitude, (v) =>
        this.applyControl({ amplitude: v }),
      ),
      this.slider("FREQUENCY", "", round.config.frequencyRange, 0.01, p.frequency, (v) =>
        this.applyControl({ frequency: v }),
      ),
      this.slider("PHASE SHIFT", " rad", round.config.phaseRange, 0.01, p.phase, (v) =>
        this.applyControl({ phase: v }),
      ),
      this.slider("DAMPING", " (opt)", round.config.dampingRange, 0.01, p.damping, (v) =>
        this.applyControl({ damping: v }),
      ),
    );

    // --- actions + result banner ---
    this.bannerEl = el("div", "qualia-banner");
    const actions = el("div", "qualia-actions");
    const abort = el("button", "qualia-btn qualia-btn--abort", "ABORT  [Esc]");
    abort.type = "button";
    abort.addEventListener("click", () => this.callbacks.onClose?.());
    actions.append(this.bannerEl, abort);

    // Debug-only affordance: a faint hint that becomes a "TIMERS PAUSED" badge.
    this.debugEl = el("div", "qualia-debug");
    if (!DEBUG_ALLOWED) this.debugEl.style.display = "none";
    this.updateDebugBadge();

    panel.append(header, flagnote, scope, readouts, this.statusEl, meters, this.debugEl, controls, actions);
    this.root.appendChild(panel);
    mount.appendChild(this.root);

    document.addEventListener("keydown", this.onKeyDown);
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Detaches the widget, its RAF loop, and its listeners. Idempotent. */
  destroy(): void {
    cancelAnimationFrame(this.raf);
    document.removeEventListener("keydown", this.onKeyDown);
    this.root.remove();
  }

  /** Reflects the debug-pause state in the badge (debug builds only). */
  private updateDebugBadge(): void {
    if (!DEBUG_ALLOWED) return;
    this.debugEl.textContent = this.debugPaused
      ? "⏸ DEBUG · TIMERS PAUSED · [P] resume"
      : "DEBUG · [P] pause timers";
    this.debugEl.classList.toggle("is-paused", this.debugPaused);
  }

  // --- construction helpers ------------------------------------------------

  private readoutRow(label: string, valueEl: HTMLSpanElement): HTMLDivElement {
    const row = el("div", "qualia-readout");
    row.append(el("span", "qualia-readout-label", label), valueEl);
    return row;
  }

  private meterRow(
    label: string,
    fillClass: string,
    valueEl?: HTMLSpanElement,
  ): { row: HTMLDivElement; fill: HTMLDivElement } {
    const row = el("div", "qualia-meter");
    const head = el("div", "qualia-meter-head");
    head.append(el("span", "qualia-meter-label", label));
    if (valueEl) head.appendChild(valueEl);
    const track = el("div", "qualia-meter-track");
    const fill = el("div", `qualia-fill ${fillClass}`);
    track.appendChild(fill);
    row.append(head, track);
    return { row, fill };
  }

  private slider(
    label: string,
    unit: string,
    [min, max]: readonly [number, number],
    step: number,
    initial: number,
    onInput: (v: number) => void,
  ): HTMLDivElement {
    const row = el("div", "qualia-control");
    const head = el("div", "qualia-control-head");
    const value = el("span", "qualia-control-val", initial.toFixed(2) + unit);
    head.append(el("span", "qualia-control-label", label), value);
    const input = el("input", "qualia-slider");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(initial);
    input.addEventListener("input", () => {
      const v = Number(input.value);
      value.textContent = v.toFixed(2) + unit;
      onInput(v);
    });
    row.append(head, input);
    return row;
  }

  // --- interaction ---------------------------------------------------------

  private applyControl(patch: Partial<PlayerParams>): void {
    if (this.ended) return;
    setPlayer(this.state, patch, this.cfg);
  }

  // --- loop ----------------------------------------------------------------

  private readonly frame = (now: number): void => {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (!this.ended) {
      // Debug pause: a dt=0 tick refreshes alignment/status but holds the lock
      // and instability timers, so the wave stays live while nothing counts down.
      tick(this.state, this.debugPaused ? 0 : dt, this.cfg);
      if (this.state.status === "BYPASSED") this.finish("solved");
      else if (this.state.status === "PURGED") this.finish("purged");
    }

    this.render();
    this.refreshReadouts();
    this.raf = requestAnimationFrame(this.frame);
  };

  private finish(outcome: "solved" | "purged"): void {
    this.ended = true;
    if (outcome === "solved") {
      this.bannerEl.textContent = "✔ PHASE LOCK ACHIEVED — Q0 COMPLIANT · bypass complete";
      this.bannerEl.className = "qualia-banner is-solved";
      this.callbacks.onSolved?.();
    } else {
      this.bannerEl.textContent = "✖ INSTABILITY CRITICAL — environmental purge authorised";
      this.bannerEl.className = "qualia-banner is-purged";
      (this.callbacks.onPurged ?? this.callbacks.onClose)?.();
    }
  }

  // --- rendering -----------------------------------------------------------

  private syncCanvasSize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === this.cssW && h === this.cssH) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cssW = w;
    this.cssH = h;
  }

  private render(): void {
    this.syncCanvasSize();
    const { ctx } = this;
    const w = this.cssW;
    const h = this.cssH;
    if (w === 0 || h === 0) return;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#03070c";
    ctx.fillRect(0, 0, w, h);
    this.drawGrid(w, h);

    const drift = signalDrift(this.state.alignment);

    // Target baseline — crisp cyan.
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#39d3ff";
    ctx.shadowColor = "#39d3ff";
    ctx.shadowBlur = 6;
    this.plotWave(w, h, (x) => targetWaveAt(this.state.target, x));

    // Live signal — amber→red, jitter growing with drift.
    const rng = mulberry32(this.noiseSeed++);
    const jitter = this.cfg.noiseAmplitude * (0.5 + 1.5 * drift);
    const live = mix(AMBER, RED, Math.min(1, drift * 1.4));
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = live;
    ctx.shadowColor = live;
    ctx.shadowBlur = 8;
    this.plotWave(w, h, (x) => playerWaveAt(this.state.player, x, (rng() * 2 - 1) * jitter));
    ctx.shadowBlur = 0;

    if (this.ended) {
      ctx.fillStyle = this.state.status === "BYPASSED" ? "rgba(94, 255, 160, 0.10)" : "rgba(255, 59, 59, 0.12)";
      ctx.fillRect(0, 0, w, h);
    }
  }

  private drawGrid(w: number, h: number): void {
    const { ctx } = this;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(43, 110, 122, 0.25)";
    ctx.beginPath();
    for (let i = 1; i < 8; i++) {
      const x = (i / 8) * w;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let i = 1; i < 4; i++) {
      const y = (i / 4) * h;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    // Brighter zero axis.
    ctx.strokeStyle = "rgba(43, 110, 122, 0.6)";
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  }

  private plotWave(w: number, h: number, valueAt: (x: number) => number): void {
    const { ctx } = this;
    const midY = h / 2;
    const yScale = (h / 2 - 6) / this.yMax;
    const cols = Math.max(2, Math.floor(w));
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) {
      const px = (i / cols) * w;
      const x = (i / cols) * TWO_PI;
      const py = midY - valueAt(x) * yScale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  private refreshReadouts(): void {
    const s = this.state;
    const drift = signalDrift(s.alignment);
    this.driftEl.textContent = (drift * 100).toFixed(1) + "%";
    this.alignEl.textContent = (s.alignment * 100).toFixed(1) + "%";

    const locked = s.status === "LOCKED" || s.status === "BYPASSED";
    this.driftEl.classList.toggle("is-ok", locked);
    this.driftEl.classList.toggle("is-bad", !locked);
    this.alignEl.classList.toggle("is-ok", locked);
    this.alignEl.classList.toggle("is-bad", !locked);

    this.lockFillEl.style.width = (100 * s.lockProgress) / this.cfg.lockDuration + "%";
    this.lockTimeEl.textContent = `${s.lockProgress.toFixed(1)} / ${this.cfg.lockDuration.toFixed(1)}s`;
    this.instFillEl.style.width = 100 * s.instability + "%";
    this.instFillEl.style.background = mix(AMBER, RED, s.instability);

    let text: string;
    let cls: string;
    if (s.status === "BYPASSED") {
      text = "STATUS:  PHASE_LOCKED / Q0_COMPLIANT ▸ BYPASS COMPLETE";
      cls = "qualia-status is-ok";
    } else if (s.status === "PURGED") {
      text = "STATUS:  ENVIRONMENTAL_PURGE ▸ Q>0 UNMASKED";
      cls = "qualia-status is-bad";
    } else if (locked) {
      text = "STATUS:  PHASE_LOCKED / Q0_COMPLIANT";
      cls = "qualia-status is-ok";
    } else {
      text = "STATUS:  QUALIA_SPIKE_DETECTED";
      cls = "qualia-status is-bad";
    }
    if (this.statusEl.textContent !== text) this.statusEl.textContent = text;
    if (this.statusEl.className !== cls) this.statusEl.className = cls;
  }
}
