import { describe, it, expect } from "vitest";
import { enforcerStatsFor, ENFORCER_DEFAULTS } from "./EntityStats";
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
