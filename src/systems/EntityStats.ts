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
  /** "static" | "flicker" | … (edplay LightType values). */
  type: string;
}

export const LIGHT_DEFAULTS: LightStats = {
  radius: 3.5,
  detectionMultiplier: 1.6,
  type: "static",
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
    type: str(components, "light_source", "type", LIGHT_DEFAULTS.type).toLowerCase(),
  };
}

/** Reads a string/enum field from a component, falling back to a default. */
export function str(
  components: ComponentData[],
  type: string,
  field: string,
  fallback: string,
): string {
  const c = components.find((x) => x.type === type);
  const raw = c?.values[field];
  return raw !== undefined && raw !== "" ? raw : fallback;
}

export interface DoorStats {
  /** Keycard id; 0 means no card required (hand-openable). */
  key: number;
  /** "closed" | "open" | "locked" | "off" (edplay DoorState values). */
  state: string;
  /** Radius (tiles) of the noise ping emitted when the door operates. */
  operationNoise: number;
}

export const DOOR_DEFAULTS = {
  operationNoise: 4,
} as const;

export function doorStatsFor(components: ComponentData[]): DoorStats {
  return {
    key: num(components, "door", "key", 0),
    state: str(components, "door", "state", "closed").toLowerCase(),
    operationNoise: num(components, "door", "OperationNoise", DOOR_DEFAULTS.operationNoise),
  };
}

export interface TerminalStats {
  /** Seconds of held interaction to finish a hack. */
  hackTime: number;
  /** "door" | "air" | "cameras" | "cache" (edplay TerminalType values). */
  type: string;
  /** If true, a hack that's abandoned mid-way trips the alert. */
  alertOnFail: boolean;
}

export const TERMINAL_DEFAULTS = {
  hackTime: 2.2,
} as const;

export function terminalStatsFor(components: ComponentData[]): TerminalStats {
  return {
    hackTime: num(components, "terminal", "HackTime", TERMINAL_DEFAULTS.hackTime),
    type: str(components, "terminal", "type", "door").toLowerCase(),
    alertOnFail: str(components, "terminal", "AlertOnFail", "false") === "true",
  };
}

export interface SensorStats {
  /** Detection cone reach, in tiles. */
  detectionRange: number;
  /** Full cone width, in degrees. Not in the map schema — engine default. */
  sightAngle: number;
  /** Seconds inside the cone before full detection. */
  detectionDelay: number;
  /** Short 360° heat-sense radius, in tiles (shared with guards). */
  thermalRadius: number;
  /** Radius (tiles) this camera alerts networked guards on a sighting. */
  alertNetworkRadius: number;
  /** "optical" | "pressure" | "trip" | … (edplay SensorType values). */
  type: string;
  /** "active" | "disabled" | "looped" | … (edplay SensorState values). */
  state: string;
}

export const SENSOR_DEFAULTS: SensorStats = {
  detectionRange: 6,
  sightAngle: 60,
  detectionDelay: 0.8,
  thermalRadius: ENFORCER_DEFAULTS.thermalRadius,
  alertNetworkRadius: ENFORCER_DEFAULTS.alertNetworkRadius,
  type: "optical",
  state: "active",
};

export function sensorStatsFor(components: ComponentData[]): SensorStats {
  return {
    detectionRange: num(components, "sensor", "DetectionRange", SENSOR_DEFAULTS.detectionRange),
    sightAngle: SENSOR_DEFAULTS.sightAngle,
    detectionDelay: num(components, "sensor", "DetectionDelay", SENSOR_DEFAULTS.detectionDelay),
    thermalRadius: SENSOR_DEFAULTS.thermalRadius,
    alertNetworkRadius: SENSOR_DEFAULTS.alertNetworkRadius,
    type: str(components, "sensor", "type", SENSOR_DEFAULTS.type).toLowerCase(),
    state: str(components, "sensor", "state", SENSOR_DEFAULTS.state).toLowerCase(),
  };
}

export interface ChestStats {
  /** Seconds of held interaction to search/open. */
  interactionTime: number;
  /** Radius (tiles) of the noise ping emitted when opened. */
  noiseOnOpen: number;
  /** Item names the chest yields (blank map slots fall back to default loot). */
  items: string[];
}

export const CHEST_DEFAULTS = {
  interactionTime: 1.4,
  noiseOnOpen: 3,
  /** Loot used when the map leaves a chest's item slots blank (they all are). */
  items: ["Ration Pack", "Stun Rounds", "Access Chit"],
} as const;

export function chestStatsFor(components: ComponentData[]): ChestStats {
  const items = ["item1", "item2", "item3"]
    .map((field, i) => str(components, "chest", field, CHEST_DEFAULTS.items[i] ?? ""))
    .filter((name) => name !== "");
  return {
    interactionTime: num(components, "chest", "InteractionTime", CHEST_DEFAULTS.interactionTime),
    noiseOnOpen: num(components, "chest", "NoiseOnOpen", CHEST_DEFAULTS.noiseOnOpen),
    items,
  };
}

export interface PlayerStats {
  /** Full bio-integrity (health). */
  maxHp: number;
  /** Tiles: a silicate this close, with line of sight, during a full alert seizes you. */
  captureRadius: number;
  /** Seconds cornered before the capture (Alignment) completes. */
  captureTime: number;
  /** Bio-integrity lost per hazard hit (e.g. a laser). */
  hazardDamage: number;
  /** Seconds of invulnerability after taking a hit. */
  hitCooldown: number;
}

/**
 * Player tuning. The map carries no player component, so these are used directly
 * (unlike the guard/sensor stats, which the map could override).
 */
export const PLAYER_DEFAULTS: PlayerStats = {
  maxHp: 100,
  captureRadius: 1.3,
  captureTime: 0.7,
  hazardDamage: 25,
  hitCooldown: 1.0,
};

/** Loot granted by the vent-core supply chest; enables capacitor fire while JAMMED. */
export const STAPLER_ITEM = "Pneumatic Rail-Stapler";

/** Proof-of-compliance item granted when VENT-4 is silenced. */
export const CERT_ITEM = "Q0_COMPLIANCE_CERT";

export interface Vent4Stats {
  /** Compliance Index at the start of the encounter (the boss "health", 100→0). */
  complianceStart: number;
  /** CI removed per patched pressure sub-station. */
  patchCompliance: number;
  /** CI removed per scrap load winched into the intake. */
  jamCompliance: number;
  /** CI removed per core capacitor destroyed during the JAMMED window. */
  capacitorCompliance: number;
  /** CI restored when a sweep fully spots the player (Phase 1 only). */
  correctionRegen: number;
  /** CI below this is the Turbulence band. */
  turbulenceBelow: number;
  /** CI below this is Critical Blockage → Phase 3 thermal purge. */
  purgeBelow: number;
  substationCount: number;
  winchCount: number;
  capacitorCount: number;
  /** Rail-stapler hits to destroy one capacitor. */
  capacitorHits: number;
  sweepCount: number;
  /** Spotlight reach from the hub, in tiles. */
  sweepRange: number;
  /** Full spotlight cone width, in degrees. */
  sweepAngle: number;
  /** Sweep rotation, radians/second, by band. */
  sweepSpeedLaminar: number;
  sweepSpeedTurbulent: number;
  /** Seconds inside a sweep before full detection (a correction burst). */
  sweepDetectTime: number;
  /** Turbine hub footprint radius, in tiles (sweep origins sit on this ring). */
  hubRadius: number;
  /** Radial suction reach in tiles; pull ramps from 0 there to suctionMax at the hub. */
  suctionRadius: number;
  /** Peak suction, tiles/second — between walk (3.2) and run (5.12) speed. */
  suctionMax: number;
  /** Within this many tiles of the hub the intake itself deals damage. */
  intakeRadius: number;
  intakeDamage: number;
  /** Tiles from a steel-column centre that counts as holding on (an adjacent
   *  hug is ~1.05 tiles centre-to-centre once the wall body pushes back). */
  gripRadius: number;
  /** Seconds of un-anchored suction to exhaust grip / anchored to refill it. */
  gripDrainTime: number;
  gripRegenTime: number;
  /** Pull multiplier once grip is exhausted. */
  exhaustedPullMultiplier: number;
  /** Seconds the turbine stays JAMMED (core exposed) after a scrap drop. */
  jamDuration: number;
  /** Hold-E seconds: winch a scrap load / patch a sub-station. */
  winchTime: number;
  patchTime: number;
  /** Rail-stapler reach in tiles and seconds between shots. */
  staplerRange: number;
  staplerCooldown: number;
  /** Seconds of purge exposure to overheat (heat 0→1). */
  heatTime: number;
  overheatDamage: number;
  /** Seconds of zeroed thermal signature after standing under a condensate drip. */
  dripCoolDuration: number;
  steamDamage: number;
  /** Player noise above this on a floor grate pings the boss (walk 0.5 > sneak 0.15). */
  grateNoiseThreshold: number;
  /** Correction-burst knockback (tiles/second) and damage. */
  burstImpulse: number;
  burstDamage: number;
}

/**
 * VENT-4 tuning. The arena is engine-generated (no map component), so like the
 * player these are used directly.
 */
export const VENT4_DEFAULTS: Vent4Stats = {
  complianceStart: 100,
  patchCompliance: 15,
  jamCompliance: 8,
  capacitorCompliance: 12,
  correctionRegen: 5,
  turbulenceBelow: 70,
  purgeBelow: 30,
  substationCount: 3,
  winchCount: 3,
  capacitorCount: 4,
  capacitorHits: 3,
  sweepCount: 4,
  sweepRange: 9,
  sweepAngle: 26,
  sweepSpeedLaminar: 0.35,
  sweepSpeedTurbulent: 0.6,
  sweepDetectTime: 1.1,
  hubRadius: 1.6,
  suctionRadius: 11,
  suctionMax: 4.2,
  intakeRadius: 2.3,
  intakeDamage: 25,
  gripRadius: 1.35,
  gripDrainTime: 6,
  gripRegenTime: 2.5,
  exhaustedPullMultiplier: 1.35,
  jamDuration: 10,
  winchTime: 2.0,
  patchTime: 2.6,
  staplerRange: 6,
  staplerCooldown: 0.35,
  heatTime: 18,
  overheatDamage: 10,
  dripCoolDuration: 6,
  steamDamage: 15,
  grateNoiseThreshold: 0.2,
  burstImpulse: 9,
  burstDamage: 15,
};
