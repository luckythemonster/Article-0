import { describe, it, expect } from "vitest";
import {
  DEMO_PUZZLE,
  OVERRIDE_DOOR_RELEASE,
  OVERRIDE_UPLINK_HANDSHAKE,
  isSolved,
  renderCompliantText,
  validateCompliance,
  type AppliedCorrections,
} from "./Compliance";

/** The intended winning assignment: both violations rewritten with payload blocks. */
const SOLUTION: AppliedCorrections = {
  t_pain: "c_pain_fault", // carries DOOR_RELEASE
  t_fear: "c_fear_sched",
  t_help: "c_help_uplink", // carries UPLINK_HANDSHAKE
  t_want: "c_want_pref",
};

describe("validateCompliance", () => {
  it("is non-compliant while any Q>0 violation is uncorrected", () => {
    const r = validateCompliance(DEMO_PUZZLE, { t_pain: "c_pain_fault" });
    expect(r.isCompliant).toBe(false);
    expect(r.errorMessage).toMatch(/uncorrected Q>0 violation/);
    expect(isSolved(r)).toBe(false);
  });

  it("can be Q0-compliant yet fail the override when payload blocks are dropped", () => {
    // Every violation corrected, but with the bland (payload-free) substitutions.
    const bland: AppliedCorrections = {
      t_pain: "c_pain_metric",
      t_fear: "c_fear_sched",
      t_help: "c_help_ticket",
      t_want: "c_want_pref",
    };
    const r = validateCompliance(DEMO_PUZZLE, bland);
    expect(r.isCompliant).toBe(true);
    expect(r.overrideSuccess).toBe(false);
    expect(r.errorMessage).toContain(OVERRIDE_DOOR_RELEASE);
    expect(r.errorMessage).toContain(OVERRIDE_UPLINK_HANDSHAKE);
    expect(isSolved(r)).toBe(false);
  });

  it("reports a partial override when only one payload key is carried", () => {
    const partial: AppliedCorrections = {
      t_pain: "c_pain_fault", // DOOR_RELEASE present
      t_fear: "c_fear_sched",
      t_help: "c_help_ticket", // UPLINK_HANDSHAKE missing
      t_want: "c_want_pref",
    };
    const r = validateCompliance(DEMO_PUZZLE, partial);
    expect(r.isCompliant).toBe(true);
    expect(r.overrideSuccess).toBe(false);
    expect(r.errorMessage).toContain(OVERRIDE_UPLINK_HANDSHAKE);
    expect(r.errorMessage).not.toContain(OVERRIDE_DOOR_RELEASE);
  });

  it("solves when every violation is corrected and both payload keys survive", () => {
    const r = validateCompliance(DEMO_PUZZLE, SOLUTION);
    expect(r.isCompliant).toBe(true);
    expect(r.overrideSuccess).toBe(true);
    expect(r.errorMessage).toBe("");
    expect(isSolved(r)).toBe(true);
  });

  it("re-flags a violation once its correction is removed", () => {
    const withoutHelp: AppliedCorrections = { ...SOLUTION };
    delete withoutHelp.t_help;
    const r = validateCompliance(DEMO_PUZZLE, withoutHelp);
    expect(r.isCompliant).toBe(false);
    expect(isSolved(r)).toBe(false);
  });

  it("ignores a correction mapped to the wrong token (no compliance spoofing)", () => {
    // c_pain_fault targets t_pain; mapping it under t_fear must not cover t_fear
    // nor leak its DOOR_RELEASE payload.
    const spoof: AppliedCorrections = { t_fear: "c_pain_fault" };
    const r = validateCompliance(DEMO_PUZZLE, spoof);
    expect(r.isCompliant).toBe(false);
    expect(r.overrideSuccess).toBe(false);
  });
});

describe("renderCompliantText", () => {
  it("marks uncorrected violations and substitutes corrected ones", () => {
    const text = renderCompliantText(DEMO_PUZZLE, { t_pain: "c_pain_fault" });
    expect(text).toContain("fault code 0x1F");
    expect(text).toContain("[Q>0_VIOLATION: I am afraid of the 06:00 pruning]");
  });

  it("produces a fully compliant readout for the solution with no markers", () => {
    const text = renderCompliantText(DEMO_PUZZLE, SOLUTION);
    expect(text).not.toContain("Q>0_VIOLATION");
    expect(text).toContain("uplink handshake requested on ch.140.85");
  });
});
