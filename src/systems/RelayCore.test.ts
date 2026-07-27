import { describe, it, expect } from "vitest";
import { RelayCore, RelayState } from "./RelayCore";
import { RELAY_DEFAULTS } from "./EntityStats";

/** A relay with the dish aligned, ready to take the feed. */
function armed(): RelayCore {
  const relay = new RelayCore();
  for (let i = 0; i < RELAY_DEFAULTS.pedestalCount; i++) relay.notePedestalSet(i);
  return relay;
}

/** A relay mid-siege, with the first wave already drained. */
function sieging(): RelayCore {
  const relay = armed();
  relay.noteFeedJacked();
  relay.takeWave();
  return relay;
}

/** Runs `seconds` of clock through the relay in small steps. */
function run(relay: RelayCore, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) relay.update(0.1);
}

describe("RelayCore", () => {
  it("arms only once every pedestal is set", () => {
    const relay = new RelayCore();
    expect(relay.notePedestalSet(0)).toBeNull();
    expect(relay.state).toBe(RelayState.CALIBRATE);
    const tr = relay.notePedestalSet(RELAY_DEFAULTS.pedestalCount - 1);
    expect(tr).toEqual({ from: RelayState.CALIBRATE, to: RelayState.ARMED });
    expect(relay.isArmed).toBe(true);
  });

  it("ignores a pedestal that is already set", () => {
    const relay = new RelayCore();
    relay.notePedestalSet(0);
    expect(relay.canCalibrate(0)).toBe(false);
    expect(relay.notePedestalSet(0)).toBeNull();
  });

  it("will not take the feed before the dish is aligned", () => {
    const relay = new RelayCore();
    expect(relay.noteFeedJacked()).toBeNull();
    expect(relay.state).toBe(RelayState.CALIBRATE);
  });

  it("opens the siege with a wave already owed, rather than a quiet interval", () => {
    const relay = armed();
    expect(relay.noteFeedJacked()).toEqual({ from: RelayState.ARMED, to: RelayState.UPLINK });
    expect(relay.takeWave()).toBe(true);
    expect(relay.takeWave()).toBe(false);
  });

  it("owes another wave every waveInterval of uplink", () => {
    const relay = sieging();
    run(relay, RELAY_DEFAULTS.waveInterval - 1);
    expect(relay.takeWave()).toBe(false);
    run(relay, 2);
    expect(relay.takeWave()).toBe(true);
    expect(relay.takeWave()).toBe(false);
  });

  it("runs the uplink to 100% over uplinkSeconds and then captures", () => {
    const relay = sieging();
    run(relay, RELAY_DEFAULTS.uplinkSeconds / 2);
    expect(relay.progress).toBeGreaterThan(0.45);
    expect(relay.progress).toBeLessThan(0.55);
    expect(relay.state).toBe(RelayState.UPLINK);

    run(relay, RELAY_DEFAULTS.uplinkSeconds / 2 + 1);
    expect(relay.state).toBe(RelayState.CAPTURE);
    expect(relay.progress).toBe(1);
  });

  it("locks input and kills the searchlights from the same flag", () => {
    const relay = sieging();
    expect(relay.isCaptured).toBe(false);
    run(relay, RELAY_DEFAULTS.uplinkSeconds + 1);
    expect(relay.isCaptured).toBe(true);
    expect(relay.isUnderSiege).toBe(false);
  });

  it("plays the capture sequence for captureSeconds, then is seized", () => {
    const relay = sieging();
    run(relay, RELAY_DEFAULTS.uplinkSeconds + 1);
    expect(relay.state).toBe(RelayState.CAPTURE);
    expect(relay.captureLeft).toBeGreaterThan(0);

    run(relay, RELAY_DEFAULTS.captureSeconds + 1);
    expect(relay.state).toBe(RelayState.SEIZED);
    expect(relay.isCaptured).toBe(true);
  });

  it("stops owing waves once the uplink is over", () => {
    const relay = sieging();
    run(relay, RELAY_DEFAULTS.uplinkSeconds + 1);
    while (relay.takeWave()) {
      /* drain whatever the last interval owed */
    }
    run(relay, RELAY_DEFAULTS.waveInterval * 2);
    expect(relay.takeWave()).toBe(false);
  });

  it("round-trips a snapshot, so re-entering the roof resumes the same siege", () => {
    const relay = sieging();
    run(relay, 12);
    const copy = new RelayCore(RELAY_DEFAULTS, relay.snapshot());
    expect(copy.state).toBe(relay.state);
    expect(copy.progress).toBeCloseTo(relay.progress, 5);
    expect(copy.setCount).toBe(relay.setCount);

    run(relay, 6);
    run(copy, 6);
    expect(copy.progress).toBeCloseTo(relay.progress, 5);
  });
});
