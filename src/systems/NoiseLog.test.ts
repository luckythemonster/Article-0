import { describe, it, expect } from "vitest";
import { NoiseLog, NOISE_FADE_SEC } from "./NoiseLog";

/** Everything `forEach` yields at `now`, as plain objects a test can compare. */
function live(log: NoiseLog, now: number) {
  const out: { x: number; y: number; radiusPx: number }[] = [];
  log.forEach(now, (x, y, radiusPx) => out.push({ x, y, radiusPx }));
  return out;
}

describe("NoiseLog", () => {
  it("reads back an emission it was given", () => {
    const log = new NoiseLog();
    log.record(100, 200, 128, 5);
    expect(live(log, 5)).toEqual([{ x: 100, y: 200, radiusPx: 128 }]);
  });

  it("keeps an emission until it is older than the fade window", () => {
    const log = new NoiseLog();
    log.record(10, 20, 64, 0);
    expect(live(log, NOISE_FADE_SEC)).toHaveLength(1);
    expect(live(log, NOISE_FADE_SEC + 0.01)).toHaveLength(0);
  });

  it("expires entries independently, oldest first", () => {
    const log = new NoiseLog();
    log.record(1, 1, 32, 0);
    log.record(2, 2, 32, 1);
    // At t=1.4 the first is 1.4s old (live) and the second 0.4s (live).
    expect(live(log, 1.4)).toHaveLength(2);
    // At t=1.6 the first has aged out but the second has not.
    expect(live(log, 1.6)).toEqual([{ x: 2, y: 2, radiusPx: 32 }]);
  });

  it("drops the oldest once the ring wraps", () => {
    const log = new NoiseLog();
    // Capacity is 16; 20 emissions at the same instant must leave 16, and the
    // four earliest must be the ones gone.
    for (let i = 0; i < 20; i++) log.record(i, 0, 32, 0);
    const held = live(log, 0);
    expect(held).toHaveLength(16);
    expect(held.map((e) => e.x).sort((a, b) => a - b)).toEqual(
      [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    );
  });

  it("does not resurrect a wrapped-over slot when the ring is walked again", () => {
    // Regression guard for the ring's `count` cap: once full it must stay at
    // capacity rather than growing, or stale slots would be read as live.
    const log = new NoiseLog();
    for (let i = 0; i < 40; i++) log.record(i, 0, 32, 0);
    expect(live(log, 0)).toHaveLength(16);
  });

  it("yields nothing after clear()", () => {
    const log = new NoiseLog();
    log.record(1, 1, 32, 0);
    log.clear();
    expect(live(log, 0)).toHaveLength(0);
  });

  it("reuses the buffer after clear() rather than mixing old entries in", () => {
    const log = new NoiseLog();
    for (let i = 0; i < 10; i++) log.record(i, 0, 32, 0);
    log.clear();
    log.record(99, 99, 64, 0);
    expect(live(log, 0)).toEqual([{ x: 99, y: 99, radiusPx: 64 }]);
  });
});
