import { describe, it, expect } from "vitest";
import {
  enforcerStatsFor,
  ENFORCER_DEFAULTS,
  STAPLER_FIELD_MAX_CHARGES,
  STAPLER_FIELD_RANGE_TILES,
  STAPLER_PIN_DURATION,
  STUN_ROUND_DURATION,
  STUN_ROUND_REACH_TILES,
} from "./EntityStats";
import type { ComponentData } from "../map/types";

describe("enforcerStatsFor — ranged attack fields", () => {
  it("falls back to the engine defaults when the map carries no fire tuning", () => {
    const stats = enforcerStatsFor([]);
    expect(stats.fireRange).toBe(ENFORCER_DEFAULTS.fireRange);
    expect(stats.fireCooldown).toBe(ENFORCER_DEFAULTS.fireCooldown);
    expect(stats.fireDamage).toBe(ENFORCER_DEFAULTS.fireDamage);
  });

  it("picks up a non-zero map override", () => {
    const components: ComponentData[] = [
      {
        type: "enforcer",
        values: { FireRange: "8", FireCooldown: "0.5", FireDamage: "40" },
      },
    ];
    const stats = enforcerStatsFor(components);
    expect(stats.fireRange).toBe(8);
    expect(stats.fireCooldown).toBe(0.5);
    expect(stats.fireDamage).toBe(40);
  });

  it("treats an authored 0 as unset, same as every other enforcer stat", () => {
    const components: ComponentData[] = [
      { type: "enforcer", values: { FireRange: "0" } },
    ];
    expect(enforcerStatsFor(components).fireRange).toBe(ENFORCER_DEFAULTS.fireRange);
  });
});

describe("Rail-Stapler field mode — balance vs. Stun Rounds", () => {
  it("never out-ranges or out-lasts the consumable it's the closest analog to", () => {
    // The field mode used to strictly dominate Stun Rounds (longer reach, longer
    // hold, *and* unlimited use). It's still a viable tool via STAPLER_FIELD_MAX_CHARGES,
    // but the per-shot numbers shouldn't make it a strictly better weapon.
    expect(STAPLER_FIELD_RANGE_TILES).toBeLessThanOrEqual(STUN_ROUND_REACH_TILES);
    expect(STAPLER_PIN_DURATION).toBeLessThanOrEqual(STUN_ROUND_DURATION);
  });

  it("has a finite per-run charge pool", () => {
    expect(STAPLER_FIELD_MAX_CHARGES).toBeGreaterThan(0);
    expect(Number.isFinite(STAPLER_FIELD_MAX_CHARGES)).toBe(true);
  });
});
