import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONFIG,
  DEFAULT_TARGET,
  QUALIA_RACK_TERMINAL_TYPE,
  computeAlignment,
  createState,
  meanSquaredError,
  pickQualiaRackIndex,
  playerWaveAt,
  setPlayer,
  signalDrift,
  targetWaveAt,
  tick,
  type PlayerParams,
  type RackCandidate,
} from "./QualiaLock";

const CACHE = "log_cache";

const cfg = DEFAULT_CONFIG;
const matched: PlayerParams = { ...DEFAULT_TARGET, damping: 0 };

/** Ticks a state in fixed steps until it leaves SPIKE/LOCKED or the cap is hit. */
function run(state: ReturnType<typeof createState>, dt: number, maxSteps: number): void {
  for (let i = 0; i < maxSteps; i++) {
    tick(state, dt, cfg);
    if (state.status === "BYPASSED" || state.status === "PURGED") return;
  }
}

describe("wave equations", () => {
  it("evaluates the target baseline y = A·sin(f·x + φ)", () => {
    expect(targetWaveAt(DEFAULT_TARGET, 0)).toBeCloseTo(1.4 * Math.sin(0.8));
  });

  it("applies the damping envelope and additive noise to the player wave", () => {
    // At x = 0 the envelope is 1, so damping doesn't matter there…
    expect(playerWaveAt({ ...matched, damping: 0.9 }, 0)).toBeCloseTo(1.4 * Math.sin(0.8));
    // …but it decays the wave for x > 0.
    const x = Math.PI / 2;
    expect(playerWaveAt({ ...matched, damping: 0.9 }, x)).toBeCloseTo(
      1.4 * Math.exp(-0.9 * x) * Math.sin(3 * x + 0.8),
    );
    // Noise is added on top.
    expect(playerWaveAt(matched, 1, 0.5) - playerWaveAt(matched, 1, 0)).toBeCloseTo(0.5);
  });
});

describe("alignment scoring", () => {
  it("reads a perfect overlay as MSE 0 / alignment 1", () => {
    expect(meanSquaredError(DEFAULT_TARGET, matched, cfg)).toBeCloseTo(0);
    expect(computeAlignment(DEFAULT_TARGET, matched, cfg)).toBeCloseTo(1);
  });

  it("reads an anti-phase wave as near-zero alignment", () => {
    const antiPhase: PlayerParams = { ...matched, phase: DEFAULT_TARGET.phase + Math.PI };
    expect(computeAlignment(DEFAULT_TARGET, antiPhase, cfg)).toBeLessThan(0.1);
  });

  it("penalises a damping mismatch against the flat baseline", () => {
    const damped: PlayerParams = { ...matched, damping: 0.8 };
    expect(computeAlignment(DEFAULT_TARGET, damped, cfg)).toBeLessThan(
      computeAlignment(DEFAULT_TARGET, matched, cfg) - 0.3,
    );
  });

  it("exposes SIGNAL_DRIFT as the alignment complement", () => {
    expect(signalDrift(0.95)).toBeCloseTo(0.05);
  });
});

describe("state + controls", () => {
  it("clamps initial and updated parameters to their ranges", () => {
    const s = createState(DEFAULT_TARGET, cfg, { amplitude: 99, frequency: 0.1, phase: 0, damping: -5 });
    expect(s.player.amplitude).toBe(cfg.amplitudeRange[1]);
    expect(s.player.frequency).toBe(cfg.frequencyRange[0]);
    expect(s.player.damping).toBe(cfg.dampingRange[0]);

    setPlayer(s, { amplitude: -10, phase: 99 }, cfg);
    expect(s.player.amplitude).toBe(cfg.amplitudeRange[0]);
    expect(s.player.phase).toBe(cfg.phaseRange[1]);
  });

  it("recomputes alignment when a control changes", () => {
    const s = createState(DEFAULT_TARGET, cfg, matched);
    expect(s.alignment).toBeCloseTo(1);
    setPlayer(s, { frequency: 6 }, cfg);
    expect(s.alignment).toBeLessThan(0.5);
  });
});

describe("bypass state machine", () => {
  it("completes the bypass after sustaining the lock for lockDuration", () => {
    const s = createState(DEFAULT_TARGET, cfg, matched);
    run(s, 0.5, 100);
    expect(s.status).toBe("BYPASSED");
    expect(s.lockProgress).toBeCloseTo(cfg.lockDuration);
  });

  it("trips a purge when alignment is held far below the instability threshold", () => {
    // Fully in-range but grossly misaligned (alignment ≈ 0.015).
    const s = createState(DEFAULT_TARGET, cfg, { amplitude: 2.5, frequency: 6, phase: -Math.PI, damping: 0 });
    expect(s.alignment).toBeLessThan(cfg.instabilityThreshold);
    run(s, 0.1, 200);
    expect(s.status).toBe("PURGED");
    expect(s.instability).toBeGreaterThanOrEqual(1);
  });

  it("drains lock progress when alignment slips before the bypass completes", () => {
    const s = createState(DEFAULT_TARGET, cfg, matched);
    tick(s, 1, cfg); // ~1s of lock banked
    expect(s.lockProgress).toBeGreaterThan(0);
    setPlayer(s, { phase: DEFAULT_TARGET.phase + Math.PI }, cfg); // knock it anti-phase
    tick(s, 1, cfg);
    expect(s.lockProgress).toBeLessThan(1);
    expect(s.status).not.toBe("BYPASSED");
  });

  it("treats BYPASSED and PURGED as absorbing states", () => {
    const s = createState(DEFAULT_TARGET, cfg, matched);
    run(s, 0.5, 100);
    expect(s.status).toBe("BYPASSED");
    const bankedElapsed = s.elapsed;
    setPlayer(s, { frequency: 6 }, cfg); // would otherwise tank alignment
    tick(s, 1, cfg);
    expect(s.status).toBe("BYPASSED");
    expect(s.elapsed).toBe(bankedElapsed); // no further advance
  });

  it("freezes the timers on a dt=0 tick but keeps alignment live (debug pause)", () => {
    const s = createState(DEFAULT_TARGET, cfg, matched);
    tick(s, 1, cfg); // bank ~1s of lock progress and elapsed
    const lock = s.lockProgress;
    const inst = s.instability;
    const elapsed = s.elapsed;
    // Move the wave far off, then step with dt=0: alignment must refresh while
    // the lock / instability / elapsed timers hold — the debug-pause guarantee.
    setPlayer(s, { frequency: 6 }, cfg);
    tick(s, 0, cfg);
    expect(s.alignment).toBeLessThan(0.5);
    expect(s.lockProgress).toBe(lock);
    expect(s.instability).toBe(inst);
    expect(s.elapsed).toBe(elapsed);
  });
});

describe("pickQualiaRackIndex", () => {
  const spawn = { x: 0, y: 0 };
  const T = (type: string, x: number, y: number): RackCandidate => ({ type, x, y });

  it("promotes the log-cache nearest spawn when every terminal is a log-cache", () => {
    // Mirrors the shipped map (all terminals log_cache); index 1 is nearest.
    const terms = [T(CACHE, 30, 30), T(CACHE, 2, 3), T(CACHE, 20, 5)];
    expect(pickQualiaRackIndex(terms, spawn, CACHE)).toBe(1);
  });

  it("keeps the sole log-cache for the log-recovery objective", () => {
    expect(pickQualiaRackIndex([T(CACHE, 1, 1)], spawn, CACHE)).toBe(-1);
  });

  it("prefers a plain terminal over a nearer log-cache", () => {
    const terms = [T(CACHE, 1, 1), T("door", 9, 9)];
    expect(pickQualiaRackIndex(terms, spawn, CACHE)).toBe(1);
  });

  it("does nothing when a qualia rack is already authored", () => {
    const terms = [T(QUALIA_RACK_TERMINAL_TYPE, 5, 5), T(CACHE, 1, 1)];
    expect(pickQualiaRackIndex(terms, spawn, CACHE)).toBe(-1);
  });

  it("returns -1 for a level with no terminals", () => {
    expect(pickQualiaRackIndex([], spawn, CACHE)).toBe(-1);
  });
});
