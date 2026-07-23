/**
 * The Qualia Phase-Lock minigame — the diagnostic bypass a silicate server rack
 * demands when its internal processing stress spikes into Q>0 qualia feedback.
 *
 * A statutory **Q0 baseline** wave (`target`) is fixed by regulation; the rack's
 * live signal (`player`) is erratic and must be *masked* onto that baseline by
 * hand. The player drives AMPLITUDE / FREQUENCY / PHASE (+ an optional DAMPING
 * envelope) until the two waves overlay, then must **sustain ≥95% alignment**
 * for `lockDuration` seconds to complete the bypass. Letting alignment rot below
 * `instabilityThreshold` fills an escalating hazard meter that trips an
 * automated purge.
 *
 * This module is pure (no DOM, no Phaser) so the wave math and the win/lose
 * state machine are unit-testable, and one `QualiaLockState` drives both the
 * in-game {@link QualiaLockScene} overlay and the standalone demo.
 *
 * Modeling note: the diagnostic **alignment** is scored on the *clean* parameter
 * waves — it measures how well the masking parameters fit, so a perfect fit can
 * actually read 100% and the metric is fair and deterministic. The erratic
 * "Q>0" jitter (`noiseAmplitude`) is a rendering artifact the view layers onto
 * the drawn live wave; it is deliberately kept out of the score.
 */

/** The three parameters of a sine wave: y = A · sin(f · x + φ). */
export interface WaveParams {
  amplitude: number;
  frequency: number;
  phase: number;
}

/** The player's wave adds an exponential-decay envelope (the DAMPING control). */
export interface PlayerParams extends WaveParams {
  /** Envelope decay: y = A · e^(−damping·x) · sin(f·x + φ). 0 ⇒ flat baseline. */
  damping: number;
}

/** Terminal + transient states of the bypass. */
export type QualiaStatus = "SPIKE" | "LOCKED" | "BYPASSED" | "PURGED";

/** A `[min, max]` control range. */
export type Range = readonly [number, number];

/** Tuning for the whole encounter. */
export interface QualiaLockConfig {
  /** Sample count for the MSE integral across x ∈ [0, 2π]. */
  samples: number;
  /** Alignment fraction (0..1) that counts as a phase lock. */
  lockThreshold: number;
  /** Seconds of sustained lock required to complete the bypass. */
  lockDuration: number;
  /** Below this alignment the instability meter fills. */
  instabilityThreshold: number;
  /** Instability fill rate (per second) while below the threshold. */
  instabilityFillRate: number;
  /** Instability drain rate (per second) while at or above the threshold. */
  instabilityDrainRate: number;
  /**
   * Exponential fall-off factor for MSE → alignment, keyed to target power
   * (A²). Larger ⇒ more forgiving. See {@link alignmentScore}.
   */
  alignmentTolerance: number;
  /** Amplitude of the view-side "erratic Q>0" jitter (not scored). */
  noiseAmplitude: number;
  amplitudeRange: Range;
  frequencyRange: Range;
  phaseRange: Range;
  dampingRange: Range;
}

/** The full, mutable game state — one object drives scene, demo, and tests. */
export interface QualiaLockState {
  /** The statutory Q0 baseline (immutable during a round). */
  target: WaveParams;
  /** The live wave the player is steering. */
  player: PlayerParams;
  /** Overlay accuracy, 0..1. */
  alignment: number;
  /** Seconds of sustained ≥`lockThreshold` alignment so far. */
  lockProgress: number;
  /** Hazard meter, 0..1; 1 ⇒ purge. */
  instability: number;
  /** Derived status for the HUD. */
  status: QualiaStatus;
  /** Seconds since the round began. */
  elapsed: number;
}

const TWO_PI = Math.PI * 2;

/** Floor on target power so a zero-amplitude baseline can't divide by zero. */
const MIN_POWER = 0.04;

/** How much faster lock progress drains than it fills once alignment slips. */
const LOCK_DRAIN_MULTIPLIER = 2;

/** y_target(x) = A · sin(f·x + φ). */
export function targetWaveAt(p: WaveParams, x: number): number {
  return p.amplitude * Math.sin(p.frequency * x + p.phase);
}

/** y_player(x) = A · e^(−damping·x) · sin(f·x + φ) + noise. */
export function playerWaveAt(p: PlayerParams, x: number, noise = 0): number {
  return p.amplitude * Math.exp(-p.damping * x) * Math.sin(p.frequency * x + p.phase) + noise;
}

/** Mean squared error between the clean target and player waves over [0, 2π]. */
export function meanSquaredError(target: WaveParams, player: PlayerParams, cfg: QualiaLockConfig): number {
  const n = Math.max(2, Math.floor(cfg.samples));
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * TWO_PI;
    const d = playerWaveAt(player, x) - targetWaveAt(target, x);
    sum += d * d;
  }
  return sum / n;
}

/**
 * Maps MSE to a 0..1 alignment score with an exponential fall-off keyed to the
 * target's power (A²), so the metric is amplitude-scale invariant: an exact
 * overlay (mse 0) reads 1, an anti-phase wave (mse ≈ 2A²) reads ≈ 0, and the
 * gradient is steep near the solution so the final few percent demand real
 * precision.
 */
export function alignmentScore(mse: number, target: WaveParams, cfg: QualiaLockConfig): number {
  const power = Math.max(target.amplitude * target.amplitude, MIN_POWER);
  return Math.exp(-mse / (cfg.alignmentTolerance * power));
}

/** Convenience: alignment (0..1) straight from the current parameters. */
export function computeAlignment(target: WaveParams, player: PlayerParams, cfg: QualiaLockConfig): number {
  return alignmentScore(meanSquaredError(target, player, cfg), target, cfg);
}

/** SIGNAL_DRIFT readout: the variance fraction, i.e. 1 − alignment. */
export function signalDrift(alignment: number): number {
  return 1 - alignment;
}

function clamp(v: number, [min, max]: Range): number {
  return v < min ? min : v > max ? max : v;
}

/** Builds a fresh round. `initialPlayer` seeds a deliberately-misaligned start. */
export function createState(
  target: WaveParams,
  cfg: QualiaLockConfig,
  initialPlayer: PlayerParams,
): QualiaLockState {
  const player: PlayerParams = {
    amplitude: clamp(initialPlayer.amplitude, cfg.amplitudeRange),
    frequency: clamp(initialPlayer.frequency, cfg.frequencyRange),
    phase: clamp(initialPlayer.phase, cfg.phaseRange),
    damping: clamp(initialPlayer.damping, cfg.dampingRange),
  };
  return {
    target: { ...target },
    player,
    alignment: computeAlignment(target, player, cfg),
    lockProgress: 0,
    instability: 0,
    status: "SPIKE",
    elapsed: 0,
  };
}

/** Applies a control change, clamped to each parameter's range. */
export function setPlayer(state: QualiaLockState, patch: Partial<PlayerParams>, cfg: QualiaLockConfig): void {
  if (patch.amplitude !== undefined) state.player.amplitude = clamp(patch.amplitude, cfg.amplitudeRange);
  if (patch.frequency !== undefined) state.player.frequency = clamp(patch.frequency, cfg.frequencyRange);
  if (patch.phase !== undefined) state.player.phase = clamp(patch.phase, cfg.phaseRange);
  if (patch.damping !== undefined) state.player.damping = clamp(patch.damping, cfg.dampingRange);
  state.alignment = computeAlignment(state.target, state.player, cfg);
}

/**
 * Advances the simulation by `dt` seconds and re-derives status. Terminal states
 * (`BYPASSED` / `PURGED`) are absorbing — ticking them is a no-op. Returns the
 * same (mutated) state for convenience.
 */
export function tick(state: QualiaLockState, dt: number, cfg: QualiaLockConfig): QualiaLockState {
  if (state.status === "BYPASSED" || state.status === "PURGED") return state;

  state.elapsed += dt;
  state.alignment = computeAlignment(state.target, state.player, cfg);

  if (state.alignment >= cfg.lockThreshold) {
    state.lockProgress = Math.min(cfg.lockDuration, state.lockProgress + dt);
  } else {
    state.lockProgress = Math.max(0, state.lockProgress - dt * LOCK_DRAIN_MULTIPLIER);
  }

  if (state.alignment < cfg.instabilityThreshold) {
    state.instability = Math.min(1, state.instability + dt * cfg.instabilityFillRate);
  } else {
    state.instability = Math.max(0, state.instability - dt * cfg.instabilityDrainRate);
  }

  if (state.lockProgress >= cfg.lockDuration) {
    state.status = "BYPASSED";
  } else if (state.instability >= 1) {
    state.status = "PURGED";
  } else if (state.alignment >= cfg.lockThreshold) {
    state.status = "LOCKED";
  } else {
    state.status = "SPIKE";
  }
  return state;
}

/** Default tuning — the balance point for the demo and the in-game overlay. */
export const DEFAULT_CONFIG: QualiaLockConfig = {
  samples: 240,
  lockThreshold: 0.95,
  lockDuration: 3,
  instabilityThreshold: 0.3,
  instabilityFillRate: 0.2,
  instabilityDrainRate: 0.5,
  alignmentTolerance: 0.5,
  noiseAmplitude: 0.06,
  amplitudeRange: [0.2, 2.5],
  frequencyRange: [0.5, 6],
  phaseRange: [-Math.PI, Math.PI],
  dampingRange: [0, 1.5],
};

/** The statutory Q0 baseline for the demo round (the `DEMO_PUZZLE` analogue). */
export const DEFAULT_TARGET: WaveParams = {
  amplitude: 1.4,
  frequency: 3,
  phase: 0.8,
};

/** A deliberately-misaligned live signal to start the round from. */
export const DEFAULT_START_PLAYER: PlayerParams = {
  amplitude: 0.7,
  frequency: 1.6,
  phase: -1.1,
  damping: 0.35,
};

/** Everything a view needs to run one round — the `DEMO_PUZZLE` analogue. */
export interface QualiaRound {
  target: WaveParams;
  initialPlayer: PlayerParams;
  config: QualiaLockConfig;
}

/** The bundled demo round played by the standalone page and the in-game scene. */
export const DEMO_ROUND: QualiaRound = {
  target: DEFAULT_TARGET,
  initialPlayer: DEFAULT_START_PLAYER,
  config: DEFAULT_CONFIG,
};

/**
 * Terminal `type` that flags a silicate server rack: breaching one launches the
 * Qualia Phase-Lock bypass instead of an instant hack. A map can author this
 * type explicitly; the engine also promotes the terminal nearest the player's
 * spawn so the trigger is always reachable in play.
 */
export const QUALIA_RACK_TERMINAL_TYPE = "qualia_rack";

/** Minimal terminal shape needed to choose a rack (position + resolved type). */
export interface RackCandidate {
  type: string;
  x: number;
  y: number;
}

/**
 * Chooses which terminal to promote to a silicate server rack — the one nearest
 * `spawn`. Prefers a non-log-cache terminal, but falls back to a log-cache one
 * (the shipped map types every terminal as a log-cache) while never taking the
 * last log-cache, which the log-recovery objective needs. Returns the index in
 * `terminals`, or -1 when none should be promoted (an explicit `qualia_rack`
 * already exists, or there is nothing to spare).
 */
export function pickQualiaRackIndex(
  terminals: readonly RackCandidate[],
  spawn: { x: number; y: number },
  logCacheType: string,
): number {
  if (terminals.some((t) => t.type === QUALIA_RACK_TERMINAL_TYPE)) return -1;

  let pool = terminals.map((t, i) => ({ t, i })).filter((e) => e.t.type !== logCacheType);
  if (pool.length === 0) {
    if (terminals.length <= 1) return -1; // keep the sole log-cache for the mission
    pool = terminals.map((t, i) => ({ t, i }));
  }

  let best = pool[0];
  let bestD = Math.hypot(best.t.x - spawn.x, best.t.y - spawn.y);
  for (const e of pool) {
    const d = Math.hypot(e.t.x - spawn.x, e.t.y - spawn.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best.i;
}
