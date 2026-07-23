import { describe, it, expect } from "vitest";
import {
  ActiveItemState,
  CHAFF_PACK_DURATION,
  THERMAL_GEL_DURATION,
} from "./ActiveItems";

describe("ActiveItemState", () => {
  it("starts with both items inactive", () => {
    const s = new ActiveItemState();
    expect(s.chaffActive).toBe(false);
    expect(s.chaffOrigin).toBeNull();
    expect(s.thermalMasked).toBe(false);
  });

  it("activates the Chaff Pack at the given origin and decays it to inactive", () => {
    const s = new ActiveItemState();
    s.activateChaff(10, 20);
    expect(s.chaffActive).toBe(true);
    expect(s.chaffOrigin).toEqual({ x: 10, y: 20 });
    s.update(CHAFF_PACK_DURATION - 0.1);
    expect(s.chaffActive).toBe(true);
    expect(s.chaffOrigin).toEqual({ x: 10, y: 20 });
    s.update(0.2);
    expect(s.chaffActive).toBe(false);
    expect(s.chaffOrigin).toBeNull();
  });

  it("activates Thermal Gel and decays it to inactive", () => {
    const s = new ActiveItemState();
    s.activateThermalGel();
    expect(s.thermalMasked).toBe(true);
    s.update(THERMAL_GEL_DURATION - 0.1);
    expect(s.thermalMasked).toBe(true);
    s.update(0.2);
    expect(s.thermalMasked).toBe(false);
  });

  it("ticks the two timers independently", () => {
    const s = new ActiveItemState();
    s.activateChaff(0, 0);
    s.activateThermalGel();
    s.update(CHAFF_PACK_DURATION + 1);
    expect(s.chaffActive).toBe(false);
    expect(s.thermalMasked).toBe(true);
  });
});
