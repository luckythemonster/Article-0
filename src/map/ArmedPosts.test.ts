import { describe, it, expect } from "vitest";
import { issueFirearms, type ArmableGuard } from "./ArmedPosts";
import { ARMED_POSTS_PER_LEVEL } from "../systems/EntityStats";

const guard = (kind: string, armed = false): ArmableGuard => ({
  kind,
  components: armed ? [{ type: "enforcer", values: { Armed: "1" } }] : [],
});

describe("issueFirearms — the level's whole firearm allowance", () => {
  it("arms nobody on a level with no enforcers", () => {
    // main1 fields human security guards and orderlies only. It should field no guns.
    expect(issueFirearms([guard("security"), guard("security"), guard("drone")]).size).toBe(0);
  });

  it("arms one enforcer on a level that has them", () => {
    const armed = issueFirearms([guard("security"), guard("enforcer"), guard("enforcer")]);
    expect(armed.size).toBe(1);
    expect(armed.has(1)).toBe(true);
  });

  it("never exceeds the allowance however many boards ask", () => {
    const roster = [guard("enforcer", true), guard("enforcer", true), guard("enforcer", true)];
    expect(issueFirearms(roster).size).toBe(ARMED_POSTS_PER_LEVEL);
  });

  it("never arms a drone or a human security guard, even when the board asks", () => {
    // The kind filter is the load-bearing half: a drone is too small to mount a weapon
    // and the security staff are not issued them, so no authoring can hand them one.
    const armed = issueFirearms([guard("drone", true), guard("security", true)]);
    expect(armed.size).toBe(0);
  });

  it("gives an authored post the allowance over the first enforcer indexed", () => {
    const armed = issueFirearms([guard("enforcer"), guard("enforcer"), guard("enforcer", true)]);
    expect(armed.has(2)).toBe(true);
    expect(armed.has(0)).toBe(false);
  });

  it("is stable — the same roster issues the same gun twice", () => {
    // A level is rebuilt on every transition and every reload. A firearm that moved
    // between bodies across a checkpoint would be unlearnable.
    const roster = [guard("security"), guard("enforcer"), guard("enforcer")];
    expect([...issueFirearms(roster)]).toEqual([...issueFirearms(roster)]);
  });

  it("counts a drone board without letting it consume the allowance", () => {
    // The drone sits before the enforcer; the enforcer must still get the gun.
    const armed = issueFirearms([guard("drone"), guard("enforcer")]);
    expect([...armed]).toEqual([1]);
  });
});
