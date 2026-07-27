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

/**
 * Global pace multiplier for everything that *moves*: walk/patrol/chase speeds,
 * turn rates, vision-cone sweeps, VENT-4's suction and impulses, and animation
 * playback (via `anims.globalTimeScale`, set in `GameScene.create`).
 *
 * Deliberately *not* applied to gameplay clocks — detection fill, the alert and
 * evasion durations, hold-to-hack/search times, laser on/off windows, item
 * timers. Those stay in real seconds, so the balance ratios they encode keep the
 * meaning they were authored with; only the physical pace of the world changes.
 *
 * Every speed below is written at its design value and scaled by this on the way
 * out, so the numbers stay readable as "tiles per second at full pace".
 */
export const GAME_SPEED = 0.6;

/** Scales a design-time rate (tiles/s, degrees/s, radians/s) by {@link GAME_SPEED}. */
export function paced(rate: number): number {
  return rate * GAME_SPEED;
}
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

/**
 * The three rate fields are {@link paced} here rather than in
 * {@link ENFORCER_DEFAULTS}, so a map that *does* override `PatrolSpeed` gets
 * slowed by the same factor as the engine default instead of running at full
 * pace on its own.
 */
export function enforcerStatsFor(components: ComponentData[]): EnforcerStats {
  return {
    sightRange: num(components, "enforcer", "SightRange", ENFORCER_DEFAULTS.sightRange),
    sightAngle: num(components, "enforcer", "SightAngle", ENFORCER_DEFAULTS.sightAngle),
    thermalRadius: num(components, "enforcer", "ThermalDetectionRadius", ENFORCER_DEFAULTS.thermalRadius),
    patrolSpeed: paced(num(components, "enforcer", "PatrolSpeed", ENFORCER_DEFAULTS.patrolSpeed)),
    purgeSpeed: paced(num(components, "enforcer", "PurgeSpeed", ENFORCER_DEFAULTS.purgeSpeed)),
    turnRate: paced(num(components, "enforcer", "TurnRate", ENFORCER_DEFAULTS.turnRate)),
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

/**
 * A glazed panel. The map's glass tiles are *also* doors — the shipped tile defs carry a
 * `door` and a `glass` component together — so this describes the glazing on top of the
 * door behaviour rather than replacing it.
 *
 * Only `VisionBlock` is read. `type` (`CLEAR` etc.) is conveyed by the sprite, and
 * `BreakNoise` would need a breakage mechanic that doesn't exist; reading either into a
 * field nothing acts on is how the codebase accumulated dead content in the first place.
 */
export interface GlassStats {
  /** True for glazing that blocks line of sight — frosted or opaque rather than clear. */
  visionBlock: boolean;
}

/** True when a tile is glazed at all (carries a `glass` component). */
export function isGlass(components: ComponentData[]): boolean {
  return components.some((c) => c.type === "glass");
}

export function glassStatsFor(components: ComponentData[]): GlassStats {
  // The schema defaults this to "0", and the editor also writes "true"/"false" for
  // booleans elsewhere, so accept either spelling.
  const raw = str(components, "glass", "VisionBlock", "0").toLowerCase();
  return { visionBlock: raw === "1" || raw === "true" };
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
  /**
   * Loot used when the map leaves a chest's item slots blank (they all are). The
   * schema only carries three slots, and since unlit space became genuinely opaque
   * a Battery outranks Stun Rounds — light is load-bearing, stunning an Orderly
   * bystander is a convenience.
   */
  items: ["Ration Pack", "Battery", "Access Chit"],
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

/** Consumable: EMP charge that jams nearby cameras/guards (hotkey 1). */
export const CHAFF_PACK_ITEM = "Chaff Pack";

/** Consumable: thermal-masking buff (hotkey 2). */
export const THERMAL_GEL_ITEM = "Thermal Gel";

/** Consumable: restores bio-integrity (heals Rowan). */
export const RATION_PACK_ITEM = "Ration Pack";

/** Consumable: recharges the flashlight battery to full. */
export const BATTERY_ITEM = "Battery";

/** Consumable: a dart that stuns Orderly bystanders. */
export const STUN_ROUNDS_ITEM = "Stun Rounds";

/** Equipment: the toggleable flashlight (does not count against the consumable cap). */
export const FLASHLIGHT_ITEM = "Flashlight";

/** Key item: a door-access credential (does not count against the consumable cap). */
export const ACCESS_CHIT_ITEM = "Access Chit";

/** Key item: a recovered EIRA-7 mission log (does not count against the consumable cap). */
export const EIRA7_LOG_ITEM = "EIRA-7 Cached Log";

/** Key item: the first half of EIRA-7's cache, breached on the public decks. */
export const LOG_ALPHA_ITEM = "LOG_CACHE_ALPHA";

/** Key item: the second half, breached behind the crawlspace laser grid. */
export const LOG_BETA_ITEM = "LOG_CACHE_BETA";

// --- Item tuning ---------------------------------------------------------

/** Seconds of continuous flashlight use to drain from 100% to 0%. */
export const FLASHLIGHT_DRAIN_SECONDS = 45;
/** Detection-rate multiplier applied while the flashlight beam is emitting. */
export const FLASHLIGHT_DETECTION_MULTIPLIER = 1.8;
/** Radius (tiles) of a Chaff Pack's EMP burst, centred on the player. */
export const CHAFF_EMP_RADIUS_TILES = 4;
/** Seconds a Chaff Pack's EMP burst disables electronics / blinds guards. */
export const CHAFF_EMP_DURATION = 6;
/** Seconds a Thermal Gel dose grants thermal immunity. */
export const THERMAL_GEL_SECONDS = 12;
/** Bio-integrity restored by a manually-used Ration Pack. */
export const RATION_HEAL = 35;
/** Reach (tiles) of a Stun Rounds dart. */
export const STUN_ROUND_REACH_TILES = 5;
/** Seconds an Orderly stays stunned after being hit by a dart. */
export const STUN_ROUND_DURATION = 8;
/** Noise ping (0..1) emitted when firing a Stun Rounds dart. */
export const STUN_ROUND_NOISE = 0.2;

// --- Item taxonomy -------------------------------------------------------

/**
 * The consumables that map to hotkeys [1]–[4], in canonical slot order. Held
 * consumables fill slots dynamically (unheld names are skipped), so e.g. a
 * player holding only Thermal Gel + Ration Pack sees them as [1] and [2].
 */
export const CONSUMABLE_ORDER = [
  CHAFF_PACK_ITEM,
  THERMAL_GEL_ITEM,
  RATION_PACK_ITEM,
  BATTERY_ITEM,
  STUN_ROUNDS_ITEM,
] as const;

/** Hard cap on the total number of consumables held at once. */
export const MAX_CONSUMABLES = 4;

/** True when an item name is one of the capped, hotkey-usable consumables. */
export function isConsumable(name: string): boolean {
  return (CONSUMABLE_ORDER as readonly string[]).includes(name);
}

/**
 * True when an item name is a passive key item (uncapped) — defined as anything that
 * isn't a consumable.
 *
 * Deliberately the complement of {@link CONSUMABLE_ORDER} rather than its own allowlist.
 * It used to be a hardcoded list of two, which quietly meant every other granted item
 * was invisible: the InventoryHud renders held items by filtering on this, so the Q0
 * compliance cert, the boss-critical Rail-Stapler and the vent-core chest's flavour
 * loot were all being handed to the player and never shown. `CONSUMABLE_ORDER` is the
 * list that genuinely has to stay curated — it drives the [1]–[4] hotkeys and the carry
 * cap — so keying off its complement means a new item can't fail to appear.
 */
export function isKeyItem(name: string): boolean {
  return !isConsumable(name);
}

/** Total consumables currently held — the value checked against {@link MAX_CONSUMABLES}. */
export function countConsumables(items: string[]): number {
  return items.filter(isConsumable).length;
}

/** One occupied consumable hotkey slot. */
export interface ConsumableSlot {
  /** Hotkey number, 1..MAX_CONSUMABLES. */
  slot: number;
  /** The consumable item name. */
  name: string;
  /** How many of it are held. */
  count: number;
}

/**
 * Maps held consumables to hotkey slots [1]..N (N ≤ {@link MAX_CONSUMABLES}) in
 * {@link CONSUMABLE_ORDER}, skipping names the player isn't carrying. Shared by
 * the inventory HUD and the UIScene hotkey reader so both agree on the mapping.
 */
export function consumableSlots(items: string[]): ConsumableSlot[] {
  const slots: ConsumableSlot[] = [];
  for (const name of CONSUMABLE_ORDER) {
    const count = items.filter((i) => i === name).length;
    if (count === 0) continue;
    slots.push({ slot: slots.length + 1, name, count });
    if (slots.length >= MAX_CONSUMABLES) break;
  }
  return slots;
}

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
  /** Sweep rotation, radians/second, by band. Already {@link paced}. */
  sweepSpeedLaminar: number;
  sweepSpeedTurbulent: number;
  /** Seconds inside a sweep before full detection (a correction burst). */
  sweepDetectTime: number;
  /** Turbine hub footprint radius, in tiles (sweep origins sit on this ring). */
  hubRadius: number;
  /** Radial suction reach in tiles; pull ramps from 0 there to suctionMax at the hub. */
  suctionRadius: number;
  /**
   * Peak suction, tiles/second — sits between the player's design-time walk
   * (3.2) and run (5.12), and is {@link paced} along with them so the
   * "can out-run it at a sprint, not at a walk" relationship survives.
   */
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
  /** Correction-burst knockback (tiles/second, {@link paced}) and damage. */
  burstImpulse: number;
  burstDamage: number;
}

/**
 * VENT-4 tuning. The arena is engine-generated (no map component), so like the
 * player these are used directly.
 *
 * The movement-bearing fields (`sweepSpeed*`, `suctionMax`, `burstImpulse`) are
 * {@link paced} right here rather than at their use sites, because
 * `Vent4PhysicsSystem` is a pure, unit-tested module that asserts against these
 * constants — scaling inside it would make the tests disagree with the game.
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
  sweepSpeedLaminar: paced(0.35),
  sweepSpeedTurbulent: paced(0.6),
  sweepDetectTime: 1.1,
  hubRadius: 1.6,
  suctionRadius: 11,
  suctionMax: paced(4.2),
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
  burstImpulse: paced(9),
  burstDamage: 15,
};

// --- NW-SMAC-01, the Alignment Core ---------------------------------------

export interface SmacStats {
  /** Alignment Integrity at the start of the encounter (the boss "health", 100→0). */
  integrityStart: number;
  /**
   * Integrity dropped per desynchronised node.
   *
   * `nodeCount * nodeIntegrity === integrityStart`, deliberately: integrity is not a
   * separate pool that nodes chip at, it *is* the node state expressed as a number. All
   * four down is zero is defeated, with nothing to round off or tune apart.
   */
  nodeIntegrity: number;
  /** Number of correction nodes ringing the core. */
  nodeCount: number;
  /** Seconds of held interact to desynchronise one node. */
  nodeTime: number;
  /**
   * Seconds before the core re-synchronises a node it has lost.
   *
   * The whole fight is this number: nodes have to be down *simultaneously*, so the
   * encounter is a race against the repair clock, and the correction windows are what
   * make the race hard.
   */
  resyncSeconds: number;
  /** Integrity at or below which the core fakes the run's completion. */
  falseSummaryAt: number;
  /** Integrity at or below which its correction field fails and it is finishable. */
  exposedAt: number;
  /** Seconds one input-hijack window lasts. */
  correctionPeriod: number;
  /** Seconds between hijack windows. */
  correctionGap: number;
  /** Bio-integrity charged per second for deviating inside the forced-compliant lock. */
  deviationDamage: number;
  /** Auditing spotlight reach (tiles) and full cone width (degrees). */
  auditRange: number;
  auditAngle: number;
  /** Spotlight rotation, radians of phase per second ({@link paced}). */
  auditSpeed: number;
  /** Seconds in an auditing beam before it reports a sighting. */
  auditDetectTime: number;
  /** Damage per audit strike once a beam confirms. */
  auditDamage: number;
  /** Radius (tiles) around a silicate rack that charges the Shared Field. */
  rackWitnessRadius: number;
}

/**
 * NW-SMAC-01 tuning. Engine-generated like VENT-4's, so used directly rather than
 * read off a map component. `auditSpeed` is {@link paced} here for the same reason
 * VENT-4's sweep speeds are: the value is asserted against by the pure core's tests.
 */
export const SMAC_DEFAULTS: SmacStats = {
  integrityStart: 100,
  nodeIntegrity: 25,
  nodeCount: 4,
  nodeTime: 2.6,
  resyncSeconds: 34,
  falseSummaryAt: 50,
  exposedAt: 25,
  correctionPeriod: 5.5,
  correctionGap: 4.0,
  deviationDamage: 18,
  auditRange: 10,
  auditAngle: 34,
  auditSpeed: paced(0.5),
  auditDetectTime: 1.3,
  auditDamage: 12,
  rackWitnessRadius: 3,
};

// --- The rooftop relay ----------------------------------------------------

export interface RelayStats {
  /** Calibration pedestals that must be set before the dish will take a feed. */
  pedestalCount: number;
  /** Seconds of held interact per pedestal. */
  pedestalTime: number;
  /** Seconds the uplink takes to run 0 → 100%. */
  uplinkSeconds: number;
  /** Searchlights sweeping the roof, their reach (tiles) and full cone width (degrees). */
  searchlightCount: number;
  searchlightRange: number;
  searchlightAngle: number;
  /** Searchlight rotation, radians of phase per second ({@link paced}). */
  searchlightSpeed: number;
  /** Seconds held in a searchlight before it confirms, and the damage it then deals. */
  searchlightDetectTime: number;
  searchlightDamage: number;
  /** Seconds between Enforcer waves during the siege, and how many each wave lands. */
  waveInterval: number;
  waveSize: number;
  /** Cap on simultaneous siege Enforcers, so a slow uplink can't flood the roof. */
  maxSiegeGuards: number;
  /** Radius (tiles) around the dish that charges the Shared Field. */
  dishWitnessRadius: number;
  /** Seconds the capture sequence plays before the tribunal takes the screen. */
  captureSeconds: number;
}

/** Rooftop relay tuning — engine-generated level, so used directly. */
export const RELAY_DEFAULTS: RelayStats = {
  pedestalCount: 2,
  pedestalTime: 2.8,
  uplinkSeconds: 75,
  searchlightCount: 3,
  searchlightRange: 11,
  searchlightAngle: 30,
  searchlightSpeed: paced(0.55),
  searchlightDetectTime: 0.9,
  searchlightDamage: 14,
  waveInterval: 13,
  waveSize: 2,
  maxSiegeGuards: 6,
  dishWitnessRadius: 4,
  captureSeconds: 4.5,
};
