import { describe, it, expect } from "vitest";
import { SmacCore, SmacState } from "./SmacCore";
import { SMAC_DEFAULTS } from "./EntityStats";

/** A core with `n` nodes already desynchronised, from a fresh fight. */
function withNodesDown(n: number): SmacCore {
  const core = new SmacCore();
  for (let i = 0; i < n; i++) core.noteNodeDesynced(i);
  return core;
}

/** Runs `seconds` of clock through the core in small steps, discarding transitions. */
function run(core: SmacCore, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) core.update(0.1);
}

describe("SmacCore", () => {
  it("derives integrity from the nodes rather than tracking it separately", () => {
    const core = new SmacCore();
    expect(core.integrity).toBe(SMAC_DEFAULTS.integrityStart);
    core.noteNodeDesynced(0);
    expect(core.integrity).toBe(SMAC_DEFAULTS.integrityStart - SMAC_DEFAULTS.nodeIntegrity);
    expect(core.downCount).toBe(1);
  });

  it("is defeated only when every node is down at once", () => {
    const core = withNodesDown(SMAC_DEFAULTS.nodeCount - 1);
    expect(core.state).not.toBe(SmacState.DEFEATED);
    const tr = core.noteNodeDesynced(SMAC_DEFAULTS.nodeCount - 1);
    expect(tr).toEqual({ from: SmacState.EXPOSED, to: SmacState.DEFEATED });
    expect(core.integrity).toBe(0);
  });

  it("repairs a node after resyncSeconds, putting the integrity back", () => {
    const core = withNodesDown(1);
    const dropped = SMAC_DEFAULTS.integrityStart - SMAC_DEFAULTS.nodeIntegrity;
    run(core, SMAC_DEFAULTS.resyncSeconds - 1);
    expect(core.integrity).toBe(dropped);
    run(core, 2);
    expect(core.integrity).toBe(SMAC_DEFAULTS.integrityStart);
    expect(core.downCount).toBe(0);
  });

  it("ignores a node that is already down, so holding one can't drain the bar", () => {
    const core = withNodesDown(1);
    expect(core.canDesync(0)).toBe(false);
    expect(core.noteNodeDesynced(0)).toBeNull();
    expect(core.downCount).toBe(1);
  });

  it("shows the fake completion card once, at half integrity, and never again", () => {
    const core = new SmacCore();
    core.noteNodeDesynced(0);
    const tr = core.noteNodeDesynced(1);
    expect(core.integrity).toBe(SMAC_DEFAULTS.falseSummaryAt);
    expect(tr).toEqual({ from: SmacState.AUDIT, to: SmacState.FALSE_SUMMARY });
    expect(core.summaryUp).toBe(true);

    // Dismissing drops straight into a correction window rather than a free beat.
    expect(core.dismissSummary()).toEqual({
      from: SmacState.FALSE_SUMMARY,
      to: SmacState.CORRECTION,
    });

    // Let it repair back over the line and cross it a second time.
    run(core, SMAC_DEFAULTS.resyncSeconds + 1);
    expect(core.integrity).toBeGreaterThan(SMAC_DEFAULTS.falseSummaryAt);
    core.noteNodeDesynced(0);
    core.noteNodeDesynced(1);
    expect(core.summaryUp).toBe(false);
  });

  it("holds the room while the card is up — no window oscillation behind it", () => {
    const core = new SmacCore();
    core.noteNodeDesynced(0);
    core.noteNodeDesynced(1);
    expect(core.state).toBe(SmacState.FALSE_SUMMARY);
    run(core, SMAC_DEFAULTS.correctionPeriod + SMAC_DEFAULTS.correctionGap + 1);
    expect(core.state).toBe(SmacState.FALSE_SUMMARY);
  });

  it("alternates audit and correction windows on the tuned cadence", () => {
    const core = new SmacCore();
    expect(core.state).toBe(SmacState.AUDIT);
    run(core, SMAC_DEFAULTS.correctionGap + 0.2);
    expect(core.state).toBe(SmacState.CORRECTION);
    run(core, SMAC_DEFAULTS.correctionPeriod + 0.2);
    expect(core.state).toBe(SmacState.AUDIT);
  });

  it("rewrites an axis only while correcting, and varies which one per window", () => {
    const core = new SmacCore();
    expect(core.correction).toEqual({ invertX: false, invertY: false });

    const seen = new Set<string>();
    for (let w = 0; w < 6; w++) {
      run(core, SMAC_DEFAULTS.correctionGap + 0.2);
      expect(core.state).toBe(SmacState.CORRECTION);
      const c = core.correction;
      expect(c.invertX || c.invertY).toBe(true);
      seen.add(`${c.invertX}/${c.invertY}`);
      run(core, SMAC_DEFAULTS.correctionPeriod + 0.2);
    }
    // The pattern is meant to be learnable, which means more than one shape.
    expect(seen.size).toBeGreaterThan(1);
  });

  it("drops the correction field once exposed, and brings it back if a node repairs", () => {
    const core = withNodesDown(SMAC_DEFAULTS.nodeCount - 1);
    expect(core.state).toBe(SmacState.EXPOSED);
    expect(core.forcesCompliance).toBe(false);
    expect(core.correction).toEqual({ invertX: false, invertY: false });

    run(core, SMAC_DEFAULTS.resyncSeconds + 1);
    expect(core.state).toBe(SmacState.AUDIT);
    expect(core.forcesCompliance).toBe(true);
  });

  it("stays quiet once defeated", () => {
    const core = withNodesDown(SMAC_DEFAULTS.nodeCount);
    expect(core.state).toBe(SmacState.DEFEATED);
    expect(core.update(1)).toBeNull();
    expect(core.forcesCompliance).toBe(false);
  });

  it("round-trips a snapshot, so re-entering the vault resumes the same fight", () => {
    const core = withNodesDown(2);
    run(core, 3);
    const copy = new SmacCore(SMAC_DEFAULTS, core.snapshot());
    expect(copy.state).toBe(core.state);
    expect(copy.integrity).toBe(core.integrity);
    expect(copy.nextResync).toBeCloseTo(core.nextResync, 5);

    run(core, 5);
    run(copy, 5);
    expect(copy.integrity).toBe(core.integrity);
    expect(copy.state).toBe(core.state);
  });

  it("does not re-show the fake summary after a snapshot restore", () => {
    const core = withNodesDown(2);
    core.dismissSummary();
    const copy = new SmacCore(SMAC_DEFAULTS, core.snapshot());
    run(copy, SMAC_DEFAULTS.resyncSeconds + 1);
    copy.noteNodeDesynced(0);
    copy.noteNodeDesynced(1);
    expect(copy.summaryUp).toBe(false);
  });
});
