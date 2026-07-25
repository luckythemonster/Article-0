import { describe, it, expect } from "vitest";
import {
  ConductState,
  FLAG_HOSTILE,
  FLAG_TAMPERING,
  FLAG_UNAUTHORIZED,
  SETTLE_SECONDS,
} from "./Conduct";

/** Clean conduct: walking normally, base unaware. */
const CLEAN = { alertAware: false, running: false, sneaking: false };

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

  it("blocks compliance while the base is aware, whatever the gait", () => {
    const c = new ConductState();
    c.update(0.1, { alertAware: true, running: false, sneaking: false });
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

  it("ignores a zero-length violation", () => {
    const c = new ConductState();
    c.update(0.1, CLEAN);
    c.violate("TAMPERING", 0);
    expect(c.compliant).toBe(true);
  });
});
