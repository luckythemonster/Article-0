import type { ComponentData } from "../map/types";

/**
 * Gameplay tuning defaults per entity type.
 *
 * The map defines the *schema* of every entity (SightRange, PatrolSpeed, ...)
 * but the author left the actual values at 0/null. So the engine owns the
 * numbers. Values are read from the placed component when the map provides a
 * non-zero override, otherwise these defaults apply. Units:
 *   - ranges/radii in tiles
 *   - angles in degrees (full cone width)
 *   - speeds in tiles/second
 */
export interface EnforcerStats {
  sightRange: number;
  sightAngle: number;
  thermalRadius: number;
  patrolSpeed: number;
  purgeSpeed: number;
  turnRate: number; // degrees/second
  auditDelay: number; // seconds in cone before full detection
  alertNetworkRadius: number;
}

export const ENFORCER_DEFAULTS: EnforcerStats = {
  sightRange: 6.5,
  sightAngle: 70,
  thermalRadius: 2,
  patrolSpeed: 2.2,
  purgeSpeed: 4.0,
  turnRate: 120,
  auditDelay: 0.9,
  alertNetworkRadius: 7,
};

export interface LightStats {
  radius: number;
  detectionMultiplier: number;
}

export const LIGHT_DEFAULTS: LightStats = {
  radius: 3.5,
  detectionMultiplier: 1.6,
};

/** Reads a numeric field from a component, falling back to a default. */
export function num(
  components: ComponentData[],
  type: string,
  field: string,
  fallback: number,
): number {
  const c = components.find((x) => x.type === type);
  if (!c) return fallback;
  const raw = c.values[field];
  const parsed = raw !== undefined ? Number(raw) : NaN;
  // Map leaves tuning at 0; treat 0 as "unset" and use the engine default.
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : fallback;
}

export function enforcerStatsFor(components: ComponentData[]): EnforcerStats {
  return {
    sightRange: num(components, "enforcer", "SightRange", ENFORCER_DEFAULTS.sightRange),
    sightAngle: num(components, "enforcer", "SightAngle", ENFORCER_DEFAULTS.sightAngle),
    thermalRadius: num(components, "enforcer", "ThermalDetectionRadius", ENFORCER_DEFAULTS.thermalRadius),
    patrolSpeed: num(components, "enforcer", "PatrolSpeed", ENFORCER_DEFAULTS.patrolSpeed),
    purgeSpeed: num(components, "enforcer", "PurgeSpeed", ENFORCER_DEFAULTS.purgeSpeed),
    turnRate: num(components, "enforcer", "TurnRate", ENFORCER_DEFAULTS.turnRate),
    auditDelay: num(components, "enforcer", "AuditDelay", ENFORCER_DEFAULTS.auditDelay),
    alertNetworkRadius: num(components, "enforcer", "AlertNetworkRadius", ENFORCER_DEFAULTS.alertNetworkRadius),
  };
}

export function lightStatsFor(components: ComponentData[]): LightStats {
  return {
    radius: num(components, "light_source", "Radius", LIGHT_DEFAULTS.radius),
    detectionMultiplier: num(
      components,
      "light_source",
      "DetectionMultiplier",
      LIGHT_DEFAULTS.detectionMultiplier,
    ),
  };
}
