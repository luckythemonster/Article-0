import { describe, it, expect } from "vitest";
import { parseEnvelope, envelopeGainAt } from "./envelopes";

describe("parseEnvelope", () => {
  it("splits family and level", () => {
    expect(parseEnvelope("swell 2")).toEqual({ family: "swell", level: 2 });
    expect(parseEnvelope("twang 3")).toEqual({ family: "twang", level: 3 });
    expect(parseEnvelope("flare 1")).toEqual({ family: "flare", level: 1 });
    expect(parseEnvelope("decay 2")).toEqual({ family: "decay", level: 2 });
  });

  it("defaults level to 1 when missing", () => {
    expect(parseEnvelope("decay").level).toBe(1);
  });
});

describe("envelopeGainAt", () => {
  it("decay starts at full gain and decreases monotonically", () => {
    const shape = parseEnvelope("decay 2");
    const g0 = envelopeGainAt(shape, 0, 1);
    const g1 = envelopeGainAt(shape, 0.2, 1);
    const g2 = envelopeGainAt(shape, 0.6, 1);
    expect(g0).toBeCloseTo(1, 5);
    expect(g1).toBeLessThan(g0);
    expect(g2).toBeLessThan(g1);
  });

  it("a higher decay level decays faster at the same t", () => {
    const slow = envelopeGainAt(parseEnvelope("decay 1"), 0.3, 1);
    const fast = envelopeGainAt(parseEnvelope("decay 4"), 0.3, 1);
    expect(fast).toBeLessThan(slow);
  });

  it("twang attacks quickly then decays", () => {
    const shape = parseEnvelope("twang 2");
    const attackPeak = envelopeGainAt(shape, 0.01, 1);
    const beforeAttack = envelopeGainAt(shape, 0.001, 1);
    const afterDecay = envelopeGainAt(shape, 0.5, 1);
    expect(beforeAttack).toBeLessThan(attackPeak);
    expect(afterDecay).toBeLessThan(attackPeak);
  });

  it("flare swells in then decays (a bump)", () => {
    const shape = parseEnvelope("flare 1");
    const early = envelopeGainAt(shape, 0.01, 1);
    const peak = envelopeGainAt(shape, 0.14, 1);
    const late = envelopeGainAt(shape, 1, 1);
    expect(peak).toBeGreaterThan(early);
    expect(peak).toBeGreaterThan(late);
  });

  it("swell fades in and holds at full gain", () => {
    const shape = parseEnvelope("swell 2");
    const early = envelopeGainAt(shape, 0.01, 2);
    const held = envelopeGainAt(shape, 5, 2);
    expect(early).toBeLessThan(held);
    expect(held).toBeCloseTo(1, 5);
  });

  it("a higher swell level reaches full gain sooner", () => {
    const slow = envelopeGainAt(parseEnvelope("swell 1"), 0.3, 2);
    const fast = envelopeGainAt(parseEnvelope("swell 4"), 0.3, 2);
    expect(fast).toBeGreaterThan(slow);
  });
});
