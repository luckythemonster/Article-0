import { describe, it, expect } from "vitest";
import {
  buildAlertNetworkSnapshot,
  emptyAlertNetworkSnapshot,
  NoiseSpamTracker,
  type NetworkUnit,
} from "./AlertNetwork";
import { AlertState } from "./AlertState";

describe("AlertNetwork", () => {
  it("emptyAlertNetworkSnapshot returns nominal default state", () => {
    const snap = emptyAlertNetworkSnapshot();
    expect(snap).toEqual({
      status: "INFILTRATION",
      total: 0,
      alerted: 0,
      suspicious: 0,
      converging: 0,
      target: null,
      countdown: 0,
    });
  });

  it("buildAlertNetworkSnapshot populates detectors and alert state accurately", () => {
    const alert = new AlertState();
    alert.reportSighting(5, 10);

    const mobile: NetworkUnit[] = [{ detection: 0.8 }, { detection: 0.2 }, { detection: 0 }];
    const fixed: NetworkUnit[] = [{ detection: 0.9 }, { detection: 0 }];

    const buffer = emptyAlertNetworkSnapshot();
    const result = buildAlertNetworkSnapshot(mobile, fixed, alert, buffer);

    expect(result).toBe(buffer);
    expect(result.status).toBe("ALERT");
    expect(result.total).toBe(5);
    expect(result.alerted).toBe(2); // 0.8 and 0.9
    expect(result.suspicious).toBe(1); // 0.2
    expect(result.converging).toBe(3); // mobile count when combat aware
    expect(result.target).toEqual({ x: 5, y: 10 });
  });

  it("benchmarks buildAlertNetworkSnapshot buffer reuse performance", () => {
    const alert = new AlertState();
    const mobile: NetworkUnit[] = [{ detection: 0.8 }, { detection: 0.2 }, { detection: 0 }];
    const fixed: NetworkUnit[] = [{ detection: 0.9 }, { detection: 0 }];

    const N = 100_000;

    // Uncached / default allocation path
    const startUncached = performance.now();
    for (let i = 0; i < N; i++) {
      buildAlertNetworkSnapshot(mobile, fixed, alert);
    }
    const endUncached = performance.now();
    const durationUncached = endUncached - startUncached;

    // Cached / scratch buffer reuse path
    const buffer = emptyAlertNetworkSnapshot();
    const startCached = performance.now();
    for (let i = 0; i < N; i++) {
      buildAlertNetworkSnapshot(mobile, fixed, alert, buffer);
    }
    const endCached = performance.now();
    const durationCached = endCached - startCached;

    console.log(
      `[BENCHMARK] buildAlertNetworkSnapshot (${N} calls) — Uncached: ${durationUncached.toFixed(2)}ms, Cached: ${durationCached.toFixed(2)}ms`,
    );

    expect(durationCached).toBeGreaterThanOrEqual(0);
  });
});

describe("NoiseSpamTracker", () => {
  it("tracks nearby noise pings and flags spam", () => {
    const tracker = new NoiseSpamTracker(4, 10, 2);
    expect(tracker.record(10, 10, 1)).toBe(false);
    expect(tracker.record(11, 10, 2)).toBe(false);
    // Third ping within radius 4 and within 10s flags as spam
    expect(tracker.record(10, 11, 3)).toBe(true);
  });
});
