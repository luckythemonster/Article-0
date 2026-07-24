import { describe, it, expect } from "vitest";
import {
  ActiveItemState,
  CHAFF_PACK_DURATION,
  THERMAL_GEL_DURATION,
} from "./ActiveItems";
import { FLASHLIGHT_DRAIN_SECONDS } from "./EntityStats";

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

  it("starts with a full, owned, off flashlight", () => {
    const s = new ActiveItemState();
    expect(s.flashlightOwned).toBe(true);
    expect(s.flashlightOn).toBe(false);
    expect(s.flashlightCharge).toBe(1);
    expect(s.flashlightBeamActive).toBe(false);
  });

  it("drains the flashlight while on and cuts out at empty", () => {
    const s = new ActiveItemState();
    s.toggleFlashlight();
    expect(s.flashlightOn).toBe(true);
    expect(s.flashlightBeamActive).toBe(true);
    s.update(FLASHLIGHT_DRAIN_SECONDS / 2);
    expect(s.flashlightCharge).toBeCloseTo(0.5, 5);
    // Drain past empty: the battery clamps to 0 and the light turns itself off.
    s.update(FLASHLIGHT_DRAIN_SECONDS);
    expect(s.flashlightCharge).toBe(0);
    expect(s.flashlightOn).toBe(false);
  });

  it("won't turn on a dead flashlight until recharged", () => {
    const s = new ActiveItemState();
    s.toggleFlashlight();
    s.update(FLASHLIGHT_DRAIN_SECONDS + 1);
    expect(s.flashlightCharge).toBe(0);
    s.toggleFlashlight(); // dead battery — stays off
    expect(s.flashlightOn).toBe(false);
    s.rechargeFlashlight();
    expect(s.flashlightCharge).toBe(1);
    s.toggleFlashlight();
    expect(s.flashlightOn).toBe(true);
  });
});
