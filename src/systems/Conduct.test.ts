import { describe, it, expect } from "vitest";
import {
  ConductState,
  FLAG_HOSTILE,
  FLAG_TAMPERING,
  FLAG_UNAUTHORIZED,
  SETTLE_SECONDS,
} from "./Conduct";

/** Clean conduct: walking normally, base unaware, no credential. */
const CLEAN = {
  alertPhase: "INFILTRATION" as const,
  running: false,
  sneaking: false,
  certified: false,
};

/** Runs `seconds` of clean behaviour in small steps. */
function settle(c: ConductState, seconds: number): void {
  const step = 0.1;
  for (let t = 0; t < seconds; t += step) c.update(step, CLEAN);
}

describe("ConductState", () => {
  it("starts compliant when behaviour is clean", () => {
    const c = new ConductState();
    c.update(0.1, CLEAN);
    expect(c.compliant).toBe(true);
    expect(c.breach).toBeNull();
  });

  it("breaks on running, and names it", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, running: true });
    expect(c.compliant).toBe(false);
    expect(c.breach).toBe("RUNNING");
  });

  it("breaks on sneaking — skulking is its own tell", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, sneaking: true });
    expect(c.compliant).toBe(false);
    expect(c.breach).toBe("SNEAKING");
  });

  it("blocks compliance during an active alert, whatever the gait", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, alertPhase: "ALERT" });
    expect(c.compliant).toBe(false);
    expect(c.breach).toBe("ALERT");
  });

  it("needs a settle period of clean behaviour after a continuous breach", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, running: true });
    // Stopping is not enough on its own.
    c.update(0.1, CLEAN);
    expect(c.compliant).toBe(false);
    settle(c, SETTLE_SECONDS);
    expect(c.compliant).toBe(true);
  });

  it("holds a discrete violation well past the settle period", () => {
    const c = new ConductState();
    c.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED);
    settle(c, SETTLE_SECONDS + 0.5);
    expect(c.compliant).toBe(false);
    expect(c.breach).toBe("UNAUTHORIZED");
    settle(c, FLAG_UNAUTHORIZED);
    expect(c.compliant).toBe(true);
    expect(c.breach).toBeNull();
  });

  it("takes the longer flag rather than letting a lesser one cut it short", () => {
    const c = new ConductState();
    c.violate("HOSTILE", FLAG_HOSTILE);
    c.violate("TAMPERING", FLAG_TAMPERING);
    expect(c.flaggedRemaining).toBeCloseTo(FLAG_HOSTILE);
    expect(c.breach).toBe("HOSTILE");
  });

  it("tops the flag back up when a held action re-reports it every frame", () => {
    const c = new ConductState();
    for (let i = 0; i < 30; i++) {
      c.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED);
      c.update(0.1, CLEAN);
    }
    // Three seconds of hacking later the full cooldown is still ahead, less only the
    // one frame of decay that followed the last report.
    expect(c.flaggedRemaining).toBeCloseTo(FLAG_UNAUTHORIZED - 0.1, 5);
    expect(c.compliant).toBe(false);
  });

  it("reports the live condition over a still-decaying discrete one", () => {
    const c = new ConductState();
    c.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED);
    c.update(0.1, { ...CLEAN, running: true });
    expect(c.breach).toBe("RUNNING");
    // The discrete flag is still underneath, and resurfaces once you stop running.
    c.update(0.1, CLEAN);
    expect(c.breach).toBe("UNAUTHORIZED");
  });

  it("blocks compliance during a search without the Q0 cert", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, alertPhase: "EVASION" });
    expect(c.compliant).toBe(false);
    expect(c.breach).toBe("EVASION");
  });

  it("lets the Q0 cert stand a search down", () => {
    const c = new ConductState();
    settle(c, 0.3);
    c.update(0.1, { ...CLEAN, alertPhase: "EVASION", certified: true });
    expect(c.compliant).toBe(true);
    expect(c.breach).toBeNull();
  });

  it("still blocks an active alert even with the cert — that's the bound", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, alertPhase: "ALERT", certified: true });
    expect(c.compliant).toBe(false);
    expect(c.breach).toBe("ALERT");
  });

  it("does not let the cert shorten a discrete flag", () => {
    // The cert only relaxes the alert rule. If a later tuning pass widens it into a
    // general cooldown reduction, that should be a deliberate change, not a silent one.
    const plain = new ConductState();
    const certified = new ConductState();
    plain.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED);
    certified.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED);
    for (let i = 0; i < 20; i++) {
      plain.update(0.1, CLEAN);
      certified.update(0.1, { ...CLEAN, certified: true });
    }
    expect(certified.flaggedRemaining).toBeCloseTo(plain.flaggedRemaining, 5);
  });

  it("ignores a zero-length violation", () => {
    const c = new ConductState();
    c.update(0.1, CLEAN);
    c.violate("TAMPERING", 0);
    expect(c.compliant).toBe(true);
  });
});
