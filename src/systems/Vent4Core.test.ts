import { describe, it, expect } from "vitest";
import { VENT4_DEFAULTS } from "./EntityStats";
import { Vent4Core, Vent4State } from "./Vent4Core";

/** Drive a fresh core to the vacuum phase (two sub-stations patched). */
function vacuumCore(): Vent4Core {
  const core = new Vent4Core();
  core.notePatched(0);
  core.notePatched(1);
  return core;
}

/** Drive a core through jams/capacitors until compliance drops below the purge line. */
function purgeCore(): Vent4Core {
  const core = vacuumCore();
  for (let winch = 0; winch < VENT4_DEFAULTS.winchCount; winch++) {
    if (core.state !== Vent4State.PHASE_2_VACUUM) break;
    core.noteWinched(winch);
    for (let cap = 0; cap < VENT4_DEFAULTS.capacitorCount; cap++) core.noteCapacitorDestroyed(cap);
    core.update(VENT4_DEFAULTS.jamDuration + 0.01);
  }
  return core;
}

describe("Vent4Core", () => {
  it("starts in the sweep phase at full compliance, Laminar band", () => {
    const core = new Vent4Core();
    expect(core.state).toBe(Vent4State.PHASE_1_SWEEP);
    expect(core.compliance).toBe(VENT4_DEFAULTS.complianceStart);
    expect(core.band).toBe("LAMINAR");
  });

  it("moves to the vacuum on the second patch, dropping compliance each time", () => {
    const core = new Vent4Core();
    expect(core.notePatched(0)).toBeNull();
    expect(core.state).toBe(Vent4State.PHASE_1_SWEEP);
    const tr = core.notePatched(1);
    expect(tr).toEqual({ from: Vent4State.PHASE_1_SWEEP, to: Vent4State.PHASE_2_VACUUM });
    expect(core.compliance).toBe(
      VENT4_DEFAULTS.complianceStart - 2 * VENT4_DEFAULTS.patchCompliance,
    );
    expect(core.band).toBe("LAMINAR"); // 70 is still Laminar (band floor is inclusive)
  });

  it("locks the last sub-station until the purge (it is the finisher)", () => {
    const core = vacuumCore();
    expect(core.canPatch(2)).toBe(false);
    expect(core.notePatched(2)).toBeNull();
    expect(core.patchedCount).toBe(2);
  });

  it("ignores double patches and out-of-phase winches", () => {
    const core = new Vent4Core();
    core.notePatched(0);
    expect(core.notePatched(0)).toBeNull();
    expect(core.patchedCount).toBe(1);
    expect(core.canWinch(0)).toBe(false);
    expect(core.noteWinched(0)).toBeNull();
  });

  it("jams on a winch drop, exposing the core for the jam duration", () => {
    const core = vacuumCore();
    const before = core.compliance;
    const tr = core.noteWinched(0);
    expect(tr).toEqual({ from: Vent4State.PHASE_2_VACUUM, to: Vent4State.JAMMED });
    expect(core.compliance).toBe(before - VENT4_DEFAULTS.jamCompliance);
    expect(core.jamLeft).toBe(VENT4_DEFAULTS.jamDuration);
    expect(core.canWinch(0)).toBe(false); // consumed
    expect(core.canWinch(1)).toBe(false); // and no winching while already jammed
  });

  it("counts capacitor kills only while jammed, once each", () => {
    const core = vacuumCore();
    expect(core.noteCapacitorDestroyed(0)).toBeNull();
    expect(core.compliance).toBe(70);
    core.noteWinched(0);
    core.noteCapacitorDestroyed(0);
    core.noteCapacitorDestroyed(0);
    expect(core.compliance).toBe(70 - VENT4_DEFAULTS.jamCompliance - VENT4_DEFAULTS.capacitorCompliance);
    expect(core.isCapacitorDown(0)).toBe(true);
    expect(core.isCapacitorDown(1)).toBe(false);
  });

  it("resumes the vacuum after the jam window if compliance is still above the purge line", () => {
    const core = vacuumCore();
    core.noteWinched(0);
    expect(core.update(VENT4_DEFAULTS.jamDuration / 2)).toBeNull();
    const tr = core.update(VENT4_DEFAULTS.jamDuration);
    expect(tr).toEqual({ from: Vent4State.JAMMED, to: Vent4State.PHASE_2_VACUUM });
  });

  it("defers the purge until the jam window expires, even when compliance crosses the line mid-jam", () => {
    const core = vacuumCore(); // 70
    core.noteWinched(0); // 62, JAMMED
    for (let i = 0; i < VENT4_DEFAULTS.capacitorCount; i++) core.noteCapacitorDestroyed(i); // 62-48 = 14
    expect(core.compliance).toBeLessThan(VENT4_DEFAULTS.purgeBelow);
    expect(core.state).toBe(Vent4State.JAMMED);
    const tr = core.update(VENT4_DEFAULTS.jamDuration + 0.01);
    expect(tr).toEqual({ from: Vent4State.JAMMED, to: Vent4State.PHASE_3_PURGE });
    expect(core.band).toBe("CRITICAL");
  });

  it("finishes via the third sub-station during the purge", () => {
    const core = purgeCore();
    expect(core.state).toBe(Vent4State.PHASE_3_PURGE);
    expect(core.canPatch(2)).toBe(true);
    const tr = core.notePatched(2);
    expect(tr).toEqual({ from: Vent4State.PHASE_3_PURGE, to: Vent4State.DEFEATED });
    expect(core.compliance).toBe(0);
  });

  it("finishes via the codec transmit only during the purge", () => {
    const early = vacuumCore();
    expect(early.noteTransmit()).toBeNull();
    const core = purgeCore();
    const tr = core.noteTransmit();
    expect(tr).toEqual({ from: Vent4State.PHASE_3_PURGE, to: Vent4State.DEFEATED });
    expect(core.compliance).toBe(0);
    // Terminal state: nothing moves it again.
    expect(core.notePatched(2)).toBeNull();
    expect(core.noteTransmit()).toBeNull();
  });

  it("regenerates compliance on a correction burst only during the sweep phase, clamped", () => {
    const core = new Vent4Core();
    core.noteCorrectionBurst();
    expect(core.compliance).toBe(VENT4_DEFAULTS.complianceStart); // clamped at start
    core.notePatched(0); // 85
    core.noteCorrectionBurst(); // 90
    expect(core.compliance).toBe(90);
    core.notePatched(1); // 75, PHASE_2
    core.noteCorrectionBurst();
    expect(core.compliance).toBe(75); // no regen outside Phase 1
  });

  it("maps compliance to bands at the 70/30 boundaries", () => {
    const stats = { ...VENT4_DEFAULTS, patchCompliance: 30 };
    const core = new Vent4Core(stats);
    core.notePatched(0); // 70
    expect(core.band).toBe("LAMINAR");
    const tr = core.notePatched(1); // 40 → vacuum
    expect(core.band).toBe("TURBULENT");
    expect(tr?.to).toBe(Vent4State.PHASE_2_VACUUM);
  });

  it("enters the purge immediately when a patch itself crosses the line", () => {
    const stats = { ...VENT4_DEFAULTS, patchCompliance: 40 };
    const core = new Vent4Core(stats);
    core.notePatched(0); // 60
    const tr = core.notePatched(1); // 20 → purge outranks vacuum
    expect(tr).toEqual({ from: Vent4State.PHASE_1_SWEEP, to: Vent4State.PHASE_3_PURGE });
  });

  it("round-trips through a snapshot", () => {
    const core = vacuumCore();
    core.noteWinched(1);
    core.noteCapacitorDestroyed(2);
    core.update(3);
    const copy = new Vent4Core(VENT4_DEFAULTS, core.snapshot());
    expect(copy.snapshot()).toEqual(core.snapshot());
    expect(copy.state).toBe(Vent4State.JAMMED);
    expect(copy.jamLeft).toBeCloseTo(VENT4_DEFAULTS.jamDuration - 3);
    // The restored core keeps ticking identically.
    const a = core.update(VENT4_DEFAULTS.jamDuration);
    const b = copy.update(VENT4_DEFAULTS.jamDuration);
    expect(a).toEqual(b);
  });
});
