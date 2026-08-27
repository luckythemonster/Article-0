import { describe, it, expect } from "vitest";
import { FirearmsAuthorization } from "./Firearms";
import { AlertState } from "./AlertState";
import { FIREARMS_AUTHORIZATION_DELAY } from "./EntityStats";

/** Runs `seconds` of ALERT through the authorization in small steps. */
function alertFor(f: FirearmsAuthorization, seconds: number, step = 0.1): void {
  for (let t = 0; t < seconds; t += step) f.update(step, "ALERT");
}

describe("FirearmsAuthorization", () => {
  it("starts RESTRICTED", () => {
    const f = new FirearmsAuthorization();
    expect(f.posture).toBe("RESTRICTED");
    expect(f.authorized).toBe(false);
    expect(f.secondsToAuthorization).toBeCloseTo(FIREARMS_AUTHORIZATION_DELAY);
  });

  it("withholds weapons for the whole of the delay", () => {
    const f = new FirearmsAuthorization();
    alertFor(f, FIREARMS_AUTHORIZATION_DELAY - 0.5);
    expect(f.authorized).toBe(false);
  });

  it("releases weapons once ALERT has been sustained past the delay", () => {
    const f = new FirearmsAuthorization();
    alertFor(f, FIREARMS_AUTHORIZATION_DELAY + 0.5);
    expect(f.posture).toBe("AUTHORIZED");
    expect(f.secondsToAuthorization).toBe(0);
  });

  it("accrues nothing during EVASION — only eyes-on time counts", () => {
    const f = new FirearmsAuthorization();
    for (let t = 0; t < 60; t += 0.1) f.update(0.1, "EVASION");
    expect(f.authorized).toBe(false);
  });

  it("keeps weapons free once EVASION follows a long ALERT", () => {
    const f = new FirearmsAuthorization();
    alertFor(f, FIREARMS_AUTHORIZATION_DELAY + 0.5);
    for (let t = 0; t < 10; t += 0.1) f.update(0.1, "EVASION");
    expect(f.authorized).toBe(true);
  });

  it("stands down on the return to INFILTRATION", () => {
    const f = new FirearmsAuthorization();
    alertFor(f, FIREARMS_AUTHORIZATION_DELAY + 0.5);
    f.update(0.1, "INFILTRATION");
    expect(f.posture).toBe("RESTRICTED");
  });

  it("does not carry partial progress across an alert cycle", () => {
    const f = new FirearmsAuthorization();
    // Two short alerts that together exceed the delay must still release nothing:
    // breaking contact is what the gate is asking for.
    alertFor(f, FIREARMS_AUTHORIZATION_DELAY - 1);
    f.update(0.1, "INFILTRATION");
    alertFor(f, FIREARMS_AUTHORIZATION_DELAY - 1);
    expect(f.authorized).toBe(false);
  });

  it("reset() disarms the facility", () => {
    const f = new FirearmsAuthorization();
    alertFor(f, FIREARMS_AUTHORIZATION_DELAY + 0.5);
    f.reset();
    expect(f.authorized).toBe(false);
  });

  it("is reachable inside a single AlertState ALERT window", () => {
    // The gate is only meaningful if an unbroken sighting can actually cross it:
    // AlertState's own ALERT window is 8s, and the delay has to fit inside one.
    const alert = new AlertState();
    const f = new FirearmsAuthorization();
    alert.reportSighting(1, 1);
    for (let t = 0; t < FIREARMS_AUTHORIZATION_DELAY + 0.5; t += 0.1) {
      alert.update(0.1);
      f.update(0.1, alert.phase);
    }
    expect(alert.phase).toBe("ALERT");
    expect(f.authorized).toBe(true);
  });
});
