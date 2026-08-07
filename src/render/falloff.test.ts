import { describe, it, expect } from "vitest";
import { falloff, POOL_CORE, smoothstep } from "./falloff";

/**
 * The falloff curve, pinned.
 *
 * Worth its own test now that it is shared rather than private to `Lighting`: the light
 * pools are *drawn* with it and the ground shadows are *weighted* by it, so a change
 * here silently retunes how dark every shadow in the game is as well as how bright every
 * lamp is. The point of these is that such a change has to be deliberate.
 */
describe("smoothstep", () => {
  it("clamps outside 0..1", () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(2)).toBe(1);
  });

  it("is symmetric about the midpoint", () => {
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 10);
    for (const t of [0.1, 0.25, 0.4]) {
      expect(smoothstep(t) + smoothstep(1 - t)).toBeCloseTo(1, 10);
    }
  });

  it("has zero slope at both ends", () => {
    const e = 1e-4;
    expect((smoothstep(e) - smoothstep(0)) / e).toBeLessThan(1e-3);
    expect((smoothstep(1) - smoothstep(1 - e)) / e).toBeLessThan(1e-3);
  });
});

describe("falloff", () => {
  it("holds full strength out to the core", () => {
    for (const u of [0, 0.1, 0.25, POOL_CORE]) {
      expect(falloff(u, POOL_CORE)).toBe(1);
    }
  });

  it("reaches exactly zero at the rim and stays there", () => {
    expect(falloff(1, POOL_CORE)).toBe(0);
    expect(falloff(1.5, POOL_CORE)).toBe(0);
  });

  it("decreases monotonically past the core", () => {
    let prev = 1;
    for (let u = POOL_CORE; u <= 1; u += 0.02) {
      const v = falloff(u, POOL_CORE);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it("has no cliff — the steepest step stays gentle", () => {
    // The whole reason this curve replaced a stack of translucent circles: that
    // composite fell off a near-discontinuity at the rim, which is what read as
    // artificial. Sampled at 1/256 (one step of an 8-bit alpha channel), no step
    // may cross a twentieth of the range.
    const step = 1 / 256;
    for (let u = 0; u < 1; u += step) {
      expect(falloff(u, POOL_CORE) - falloff(u + step, POOL_CORE)).toBeLessThan(0.05);
    }
  });

  it("a smaller core starts fading sooner", () => {
    expect(falloff(0.3, 0.2)).toBeLessThan(falloff(0.3, 0.5));
  });
});
