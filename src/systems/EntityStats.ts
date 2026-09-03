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
  /**
   * Whether this guard carries a firearm at all.
   *
   * **False is the default, and the default is the restriction.** A gun needs two
   * gates to go off: this flag, and a base-wide release
   * ({@link ./Firearms.FirearmsAuthorization}). Neither alone is enough, which is
   * what keeps a firearm an escalation the building reaches for rather than the
   * thing every body on the roster is holding.
   *
   * The per-level complement is capped at {@link ARMED_POSTS_PER_LEVEL} where the
   * cast is spawned, so setting this true on a map board cannot flood a level.
   */
  armed: boolean;
  /** Reach of the pursuing-guard ranged attack, in tiles. Only fires when {@link armed}. */
  fireRange: number;
  /** Seconds between shots. */
  fireCooldown: number;
  /** Bio-integrity damage per shot that reaches the player. */
  fireDamage: number;
  /** Reach of the pursuing-guard contact attack, in tiles — the default answer. */
  meleeRange: number;
  /** Seconds between strikes. */
  meleeCooldown: number;
  /** Bio-integrity damage per strike. */
  meleeDamage: number;
}

/**
 * **The two speeds are balanced against Rowan's, not chosen in isolation.**
 * Both are {@link paced} on the way out of {@link enforcerStatsFor}, so what
 * matters is their ratio to {@link PLAYER_WALK_TILES} (3.2) and the stance
 * multipliers in `Player.update` — sneak 0.45, walk 1, run 1.6:
 *
 * | | tiles/s | against |
 * |---|---|---|
 * | `patrolSpeed` 1.6 | | just over a sneak (1.44), so a patrol still out-walks a crouched player |
 * | `purgeSpeed` 3.0 | | just under a walk (3.2), so walking away holds distance; a sprint (5.12) escapes outright |
 *
 * The purge used to be 4.0, which beat a walk — so the only way out of a chase
 * was to sprint, and sprinting is exactly what `src/systems/Conduct.ts` reads as
 * "not staff". That made the conduct system a penalty with no alternative rather
 * than a trade-off. Asserted by `EntityStats.test.ts`, which is the only place
 * both halves of the relationship are in scope.
 */
export const ENFORCER_DEFAULTS: EnforcerStats = {
  sightRange: 6.5,
  sightAngle: 70,
  thermalRadius: 2,
  patrolSpeed: 1.6,
  purgeSpeed: 3.0,
  turnRate: 120,
  auditDelay: 0.9,
  alertNetworkRadius: 7,
  armed: false,
  fireRange: 4.5,
  fireCooldown: 1.6,
  fireDamage: 12,
  // A silicate's prod, and the numbers say what a silicate is for.
  //
  // `meleeRange` 1.6 sits deliberately *outside* `PLAYER_DEFAULTS.captureRadius`
  // (1.3): the prod is the setup and the seizure is the finish, so the reach that
  // staggers Rowan has to be the one he feels first. `meleeDamage` 8 is under the
  // security guard's 10 for the same reason the capture exists at all — an
  // enforcer is trying to recover an asset, not destroy one. See
  // {@link GUARD_MELEE_STAGGER_SECONDS} for why one prod can't hold him there.
  meleeRange: 1.6,
  meleeCooldown: 1.3,
  meleeDamage: 8,
};

export interface LightStats {
  radius: number;
  detectionMultiplier: number;
  /**
   * How bright the pool is, 0-1. How *far* it reaches is {@link radius}, and the
   * two are genuinely different questions — a fixture can light the same room and
   * light it less.
   *
   * Added for emergency lighting, which needs to read as dim rather than as small:
   * a lamp shrunk until it looked dim would stop reaching the doorway, and one left
   * at full strength was measurably indistinguishable from the overhead it replaced
   * (identical lit area, mean brightness 0.376 against 0.381). Only the *visible*
   * half: how easily a guard sees you in a pool is {@link detectionMultiplier}'s
   * job, and a lamp can be dim without being safe.
   */
  brightness: number;
  /** "static" | "flicker" | … (edplay LightType values). */
  type: string;
}

export const LIGHT_DEFAULTS: LightStats = {
  radius: 3.5,
  detectionMultiplier: 1.6,
  // Every fixture that came before this field, and every one that doesn't ask.
  brightness: 1,
  type: "static",
};

/**
 * One component's value for `field`, matched without regard to case.
 *
 * ### Why case-insensitively
 *
 * The editor lower-camels its field names (`radius`, `hackTime`, `operationNoise`)
 * and this file upper-camels the strings it asks for (`Radius`, `HackTime`,
 * `OperationNoise`), and a plain `values[field]` lookup silently missed every time
 * the two disagreed. It disagreed **seven times across five component types**, and
 * because {@link num} answers a miss with the engine default, nothing ever looked
 * broken — it looked like a map that had left its tuning blank. It had not: the
 * radius-10 amber flickers on `vent_core` and `main2vault` had been drawing at 3.5
 * since they were placed, and two terminals authored at ten seconds were opening in
 * two.
 *
 * Matching loosely fixes the class rather than those seven instances, which is the
 * point: they were never typos, they were one convention mismatch, and the next
 * component added would have landed on the same rock. Safe to do because no
 * `DataStructure` in the export has two fields differing only in case — a test in
 * `EntityStats.test.ts` holds the export to that, and to the whole cross-check.
 *
 * Exact match first, so the common path costs one property read and an exact name
 * always wins over a differently-cased one.
 */
function rawField(
  components: ComponentData[],
  type: string,
  field: string,
): string | undefined {
  return pick(components.find((x) => x.type === type)?.values, field);
}

/** {@link rawField}'s lookup, over whichever record it is pointed at. */
function pick(values: Record<string, string> | undefined, field: string): string | undefined {
  if (!values) return undefined;
  const exact = values[field];
  if (exact !== undefined) return exact;
  const wanted = field.toLowerCase();
  for (const key of Object.keys(values)) {
    if (key.toLowerCase() === wanted) return values[key];
  }
  return undefined;
}

/**
 * True when a component's value for `field` is only what the *editor* filled in.
 *
 * The second half of the same bug {@link rawField} fixes, and the more damaging
 * half. Every blank field arrives carrying its DataStructure's `DefaultValues`, so
 * a reader that simply believed the value would take the editor's placeholder over
 * the engine's tuned default — which, on the shipped map, meant every light's
 * detection multiplier read as the editor's `1` and standing in the light stopped
 * costing anything, across all nine levels.
 *
 * Only {@link num} consults this, deliberately. The numbers are where the editor's
 * placeholders and the engine's tuning disagree — of every numeric field in the
 * export only `LightSource.radius` (7 against 3.5) and `detectionMultiplier`
 * (1 against 1.6) differ at all. The *string* defaults are load-bearing in the other
 * direction and must keep arriving: `InertTerminals` needs `Terminal.type` to come
 * through as the export's `LOG_CACHE`, and a door needs its `CLOSED`.
 *
 * The cost is that an author cannot deliberately choose the same value the editor
 * suggests and have it read as a choice. That is the restriction {@link num}
 * already carries for `0`, for the same reason and to the same shrug.
 */
function isEditorBlank(
  components: ComponentData[],
  type: string,
  field: string,
  raw: string | undefined,
): boolean {
  if (raw === undefined) return false;
  const c = components.find((x) => x.type === type);
  return c?.defaults !== undefined && pick(c.defaults, field) === raw;
}

/** Reads a numeric field from a component, falling back to a default. */
export function num(
  components: ComponentData[],
  type: string,
  field: string,
  fallback: number,
): number {
  const raw = rawField(components, type, field);
  // A value nobody chose is not a value — see `isEditorBlank`.
  if (isEditorBlank(components, type, field, raw)) return fallback;
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
    armed: flag(components, "enforcer", "Armed"),
    fireRange: num(components, "enforcer", "FireRange", ENFORCER_DEFAULTS.fireRange),
    fireCooldown: num(components, "enforcer", "FireCooldown", ENFORCER_DEFAULTS.fireCooldown),
    fireDamage: num(components, "enforcer", "FireDamage", ENFORCER_DEFAULTS.fireDamage),
    meleeRange: num(components, "enforcer", "MeleeRange", ENFORCER_DEFAULTS.meleeRange),
    meleeCooldown: num(components, "enforcer", "MeleeCooldown", ENFORCER_DEFAULTS.meleeCooldown),
    meleeDamage: num(components, "enforcer", "MeleeDamage", ENFORCER_DEFAULTS.meleeDamage),
  };
}

/**
 * The human security guard — an {@link EnforcerStats} with a person's numbers.
 *
 * He runs the same AI as an enforcer (see `src/entities/SecurityGuard.ts`), so he
 * needs the same shape of stats; what differs is that he is a man doing a job
 * rather than a purpose-built sentry, and every field below says so:
 *
 * - **`sightRange` 5.0** against the enforcer's 6.5, and **`auditDelay` 1.4**
 *   against 0.9 — eyes, not optics. He takes half a second longer to be sure.
 * - **`thermalRadius` 0** — he has no thermal sense at all. This is the one
 *   default that is genuinely zero, and it stays zero however the map is
 *   authored: {@link num} reads a map-side 0 as "unset" and falls back here.
 * - **`alertNetworkRadius` 4** against 7 — he radios the mesh, he is not *on* it.
 * - **`fireDamage` 8** against 12, and **`purgeSpeed` 2.6** against 3.0 — worse
 *   shot, slower legs, kit that was not built into him. The shot is moot in
 *   practice: he is never {@link EnforcerStats.armed}, and the cap that decides
 *   who is only ever considers enforcers.
 * - **`meleeDamage` 10** against the enforcer's 8, at **`meleeRange` 1.2**
 *   against 1.6 and **`meleeCooldown` 1.5** against 1.3 — he hits harder,
 *   reaches shorter and swings slower. A man with a stick does more damage per
 *   connection than a sentry's prod and gets fewer of them, and unlike a
 *   silicate he has no capture to follow it with: this is his whole answer.
 *
 * `turnRate` is the one field held level with the enforcer's: a man turns his
 * head faster than a sentry rotates a camera crown, and dropping it too would
 * have made him trivially flankable on top of everything else.
 */
export const SECURITY_GUARD_DEFAULTS: EnforcerStats = {
  sightRange: 5.0,
  sightAngle: 75,
  thermalRadius: 0,
  patrolSpeed: 1.5,
  purgeSpeed: 2.6,
  turnRate: 120,
  auditDelay: 1.4,
  alertNetworkRadius: 4,
  armed: false,
  fireRange: 3.8,
  fireCooldown: 1.9,
  fireDamage: 8,
  meleeRange: 1.2,
  meleeCooldown: 1.5,
  meleeDamage: 10,
};

/**
 * Reads a security guard's stats, falling back to {@link SECURITY_GUARD_DEFAULTS}.
 *
 * Reads the **same `enforcer` component** the enforcer does, because that is what
 * the map places on him — the four `security_guard_*` boards carry the identical
 * tuning schema, all left at 0. So this differs from {@link enforcerStatsFor} in
 * its defaults and nothing else, and an author who *does* tune one of these
 * boards gets that value, {@link paced} the same way.
 */
export function securityGuardStatsFor(components: ComponentData[]): EnforcerStats {
  const d = SECURITY_GUARD_DEFAULTS;
  return {
    sightRange: num(components, "enforcer", "SightRange", d.sightRange),
    sightAngle: num(components, "enforcer", "SightAngle", d.sightAngle),
    thermalRadius: num(components, "enforcer", "ThermalDetectionRadius", d.thermalRadius),
    patrolSpeed: paced(num(components, "enforcer", "PatrolSpeed", d.patrolSpeed)),
    purgeSpeed: paced(num(components, "enforcer", "PurgeSpeed", d.purgeSpeed)),
    turnRate: paced(num(components, "enforcer", "TurnRate", d.turnRate)),
    auditDelay: num(components, "enforcer", "AuditDelay", d.auditDelay),
    alertNetworkRadius: num(components, "enforcer", "AlertNetworkRadius", d.alertNetworkRadius),
    armed: flag(components, "enforcer", "Armed"),
    fireRange: num(components, "enforcer", "FireRange", d.fireRange),
    fireCooldown: num(components, "enforcer", "FireCooldown", d.fireCooldown),
    fireDamage: num(components, "enforcer", "FireDamage", d.fireDamage),
    meleeRange: num(components, "enforcer", "MeleeRange", d.meleeRange),
    meleeCooldown: num(components, "enforcer", "MeleeCooldown", d.meleeCooldown),
    meleeDamage: num(components, "enforcer", "MeleeDamage", d.meleeDamage),
  };
}

// ---------------------------------------------------------------------------
// Bodies, and putting them somewhere
// ---------------------------------------------------------------------------

/**
 * Seconds of held interact to put a body into a locker, or take one back out.
 *
 * Longer than a chest's search (2.0) and much longer than a door (a tap),
 * because it is the most exposed thing the player can choose to do: both hands
 * busy, standing still, in a room where something has just been put on the
 * floor. If it were cheap, stashing would be the automatic follow-up to every
 * takedown rather than a decision about whether there is time.
 *
 * Real seconds, not {@link paced}. It is a gameplay clock — the balance it
 * encodes is against the patrol timings the player is reading, and pacing it
 * would slide it against them.
 */
export const LOCKER_STASH_TIME = 3.0;

/**
 * Rowan's speed multiplier while carrying a body.
 *
 * A notch under the hold-up march ({@link ESCORT_SPEED_MULTIPLIER} 0.45) and
 * under the crouch it shares that number with (in `Player.update`), because a
 * hostage walks on his own legs and a body does not. The gap is small on
 * purpose: one notch says which is heavier without making the carry a different
 * kind of movement, and carrying is already the more exposed of the two, since
 * a carried body is visible above cover.
 *
 * It stays its own constant rather than an expression over the march, the same
 * way `Player.update` keeps the press, the escort and the carry on separate
 * branches: they answer to different things, and nobody should have to retune a
 * crouch to retune a hostage march.
 *
 * 3.2 × 0.42 = **1.34 tiles/s**, which is the pace the body-down windows are
 * sized against — see {@link PLAYER_MELEE_DOWN_DURATION} for the arithmetic of
 * the whole lift-carry-stash loop. Slowing this shortens how far either window
 * reaches, so the two move together.
 */
export const CARRY_SPEED_MULTIPLIER = 0.42;

/**
 * How close Rowan has to be to a downed body to pick it up, in tiles.
 *
 * Tighter than `INTERACT_RANGE` (1.4) on purpose. A body lies on the floor
 * beside the fixtures the player is usually reaching for, and at the same reach
 * the pick-up would keep stealing presses meant for a terminal or a door — the
 * claim chain resolves by nearest, and a body is often nearer than the thing
 * next to it.
 */
export const BODY_PICKUP_TILES = 0.9;

/**
 * Seconds a silicate stays shut down after an EMP Grenade goes off next to it.
 *
 * Sits between the Stun Rounds dart and the Rail-Stapler's pin, so the three
 * ways of putting something down stay ordered by how much they cost to use: the
 * dart is single-target and cheap, the EMP is an area effect off a consumable,
 * and the staple is the longest and needs the boss weapon.
 */
export const EMP_SHUTDOWN_DURATION = 9.0;

/**
 * Tiles from an EMP burst's centre within which a silicate is shut down.
 *
 * Deliberately smaller than the chaff zone the same grenade lays down. The zone
 * blinds everything inside it and always has; this is the harder effect and it
 * asks for a closer throw, so the grenade keeps its "buy yourself a corridor"
 * use while gaining a "put that one down" use at range zero.
 */
export const EMP_SHUTDOWN_TILES = 2.2;

/**
 * Radius (tiles) a pursuing guard's shot carries.
 *
 * Well past a door (4) — gunfire is what turns one guard's problem into the
 * room's — but deliberately short of a thrown breaker (7).
 *
 * These three values (with the dart's 2 and the stapler's 3) were unit-confused
 * until recently: they were written as 0..1 scalars and multiplied by the tile
 * size as though they were tile counts, so a shot carried half a tile and was
 * heard by nobody. There is therefore no play-tested history behind this number
 * — 6 is a deliberately conservative first pass at a value that was previously
 * inert, and it wants tuning against a combat-heavy level rather than trusting.
 */
export const ENFORCER_FIRE_NOISE_TILES = 6;

/**
 * Radius (tiles) a guard's contact strike carries.
 *
 * A scuffle, not a report. Under a door (4) and far under gunfire (6), and that gap
 * is the mechanical reason the facility prefers hands: putting someone down quietly
 * is the whole argument for a prod over a sidearm, and a building that has decided
 * its subjects are assets to be recovered has every reason to make that argument.
 *
 * It is deliberately *not* zero. A fight is the loudest thing two bodies can do
 * without a weapon, and a nearby patrol should get the chance to wander over.
 */
export const GUARD_MELEE_NOISE_TILES = 1.5;

/**
 * Seconds Rowan moves at {@link GUARD_MELEE_STAGGER_MULTIPLIER} after a strike lands.
 *
 * **Held under {@link PLAYER_DEFAULTS}`.captureTime` (0.7) on purpose.** A silicate's
 * prod reaches 1.6 tiles and its capture closes at 1.3, so a stagger that outlasted the
 * capture window would make a single connection a death sentence — walk into one prod,
 * lose the run. At 0.5 the stagger expires with time to spare and you have to eat a
 * second one, which turns the sequence into a mistake you can see coming rather than a
 * coin flip. Asserted in `EntityStats.test.ts`, the only place both halves are in scope.
 */
export const GUARD_MELEE_STAGGER_SECONDS = 0.5;

/**
 * Move-speed multiplier while staggered.
 *
 * **It lands exactly between the two purge speeds, and that is the whole choice.** A
 * staggered sprint is 3.2 × 1.6 × 0.55 = 2.82 tiles/s, against a security guard's
 * `purgeSpeed` 2.6 and an enforcer's 3.0. So for the half-second it lasts:
 *
 * | staggered by | outcome |
 * |---|---|
 * | a human guard (2.6) | Rowan still out-runs him — the strike is damage and pressure, and that is all a man with a stick gets |
 * | a silicate (3.0) | the sentry gains on him — which is how a prod feeds the capture that ends the run |
 *
 * That asymmetry is the same one the rest of the cast is built on: the humans hurt
 * you, the silicates take you in. Tuning this up past ~0.59 would let Rowan sprint
 * clear of a sentry mid-stagger and quietly delete the prod-into-capture sequence;
 * tuning it down would let a security guard run him down, which he should never do.
 * Both edges are asserted in `EntityStats.test.ts`.
 *
 * Above a sneak's 0.45 throughout, so a stagger is never worse than crouching.
 *
 * Multiplied against the stance multipliers rather than replacing them, so crouching
 * while staggered is still slower than standing while staggered.
 */
export const GUARD_MELEE_STAGGER_MULTIPLIER = 0.55;

/**
 * Seconds of sustained full ALERT before the facility releases firearms.
 *
 * The gate that makes a gun an *event*. `Enforcer.pursue` has always been reachable
 * only at ALERT, so "guns during an alert" was already the rule and nobody could feel
 * it; this is the rule that bites. Under `AlertState`'s own `ALERT_DURATION` (8) so a
 * refreshed sighting can carry a guard past it, but long enough that breaking line of
 * sight — the thing a stealth game is asking you to do — denies it outright.
 *
 * A player who plays well may finish a run without ever hearing a shot. That is the
 * intended outcome, not a failure of the tuning.
 */
export const FIREARMS_AUTHORIZATION_DELAY = 6;

/**
 * How many guards on a level may carry a firearm.
 *
 * The hard ceiling on the second gate. One per level, and only ever a purpose-built
 * enforcer — a drone is too small to mount one and the human security staff are not
 * issued them. Applied where the cast is spawned rather than where stats are read,
 * because scarcity is a property of the roster, not of any one body: without a cap
 * here, a map that set `Armed` on four boards would quietly undo the whole thing.
 */
export const ARMED_POSTS_PER_LEVEL = 1;

export function lightStatsFor(components: ComponentData[]): LightStats {
  return {
    radius: num(components, "light_source", "Radius", LIGHT_DEFAULTS.radius),
    detectionMultiplier: num(
      components,
      "light_source",
      "DetectionMultiplier",
      LIGHT_DEFAULTS.detectionMultiplier,
    ),
    brightness: num(components, "light_source", "Brightness", LIGHT_DEFAULTS.brightness),
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
  const raw = rawField(components, type, field);
  return raw !== undefined && raw !== "" ? raw : fallback;
}

/**
 * Reads a boolean field from a component. Absent, blank or `0` all read as false.
 *
 * The map leaves tuning at 0 and {@link num} treats a `0` as *unset* — which is why
 * you cannot author a genuine zero anywhere in this file. For a boolean that
 * restriction costs nothing, because unset and false are the same answer: a field
 * nobody filled in is a permission nobody granted. This is a separate reader rather
 * than `num(...) !== 0` so that the coincidence is written down where it applies,
 * instead of looking like a bug the next person tidies up.
 *
 * Anything else parses as a number and is true when non-zero, so a board can say
 * `1` or `true` and mean it.
 */
export function flag(components: ComponentData[], type: string, field: string): boolean {
  const raw = rawField(components, type, field);
  if (raw === undefined || raw === "") return false;
  if (raw.toLowerCase() === "true") return true;
  if (raw.toLowerCase() === "false") return false;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed !== 0;
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

/**
 * Whether a door refuses to be opened by hand without a credential.
 *
 * Two ways to say it and they mean different things: a non-zero `key` names the
 * clearance that answers it, while `state: "locked"` with no id is sealed outright —
 * there is no card that could name it, so only a terminal hack gets through.
 *
 * Pulled out of `Door`'s constructor so the rule can be tested without standing up a
 * Phaser scene, per the headless-systems split.
 */
export function doorIsLocked(stats: DoorStats): boolean {
  return stats.key !== 0 || stats.state === "locked";
}

/**
 * Whether whoever holds `inventory` can open this door by hand.
 *
 * A keycard does not *unlock* anything — the door is unchanged, and the same door
 * answers differently to two people. That is why this takes the inventory rather than
 * mutating state, and why `Door.isManual` (which guards read) stays a property of the
 * door alone: routing patrols through here would open keycard doors for every guard on
 * the level on the strength of what Rowan is carrying.
 */
export function doorOpensWith(stats: DoorStats, inventory: readonly string[]): boolean {
  if (!doorIsLocked(stats)) return true;
  return stats.key !== 0 && inventory.includes(keycardName(stats.key));
}

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

export interface BreakerStats {
  /**
   * The tile-def `ref` whose lights this breaker feeds.
   *
   * A *class* of fixture, not one instance: the shipped breaker names
   * `light_overhead1`, and the map places 50 of those across main1. Throwing it
   * takes out every one of them, which is what makes it worth a walk.
   */
  target: string;
  /**
   * Whether the circuit is closed — that is, whether the power is **on**.
   *
   * The map's `circuitState` enum reads the electrician's way round, `OPEN = off`
   * and `CLOSED = on`, and the art agrees: the breaker's screen is green while
   * the circuit is closed. Stored as a boolean here so no call site has to
   * remember which way the words go.
   */
  closed: boolean;
}

export const BREAKER_DEFAULTS: BreakerStats = {
  // The schema's own default for `PowerGrid.Target`.
  target: "light_source",
  closed: true,
};

/** Reads the `PowerGrid` component off a breaker tile. */
export function breakerStatsFor(components: ComponentData[]): BreakerStats {
  return {
    target: str(components, "power_grid", "Target", BREAKER_DEFAULTS.target),
    closed:
      str(components, "power_grid", "state", CIRCUIT_CLOSED).toUpperCase() !== CIRCUIT_OPEN,
  };
}

/** The two `circuitState` values, spelled as the map spells them. */
export const CIRCUIT_OPEN = "OPEN";
export const CIRCUIT_CLOSED = "CLOSED";

export interface LightSwitchStats {
  /**
   * The circuit this plate throws.
   *
   * Read the same way a breaker's is, and pointing at the same kind of thing — a
   * `ref` that light tiles carry. The difference is scope, and it comes from what
   * gets *targeted*: a breaker names a wing, and a switch names one zone. See
   * `src/map/AutoLight.ts` for where those names come from.
   */
  target: string;
  /** Whether the circuit is closed — that is, whether the lights are **on**. */
  closed: boolean;
}

export const LIGHT_SWITCH_DEFAULTS: LightSwitchStats = {
  // No useful default target exists: a switch that named nothing would throw and
  // darken nothing, silently. An empty string is the honest version of that, and
  // `PowerControl` skips it.
  target: "",
  closed: true,
};

/** Reads the `light_switch` component off a switch tile. */
export function lightSwitchStatsFor(components: ComponentData[]): LightSwitchStats {
  return {
    target: str(components, "light_switch", "Target", LIGHT_SWITCH_DEFAULTS.target),
    closed:
      str(components, "light_switch", "state", CIRCUIT_CLOSED).toUpperCase() !== CIRCUIT_OPEN,
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
   * Last-resort loot, for a chest carrying no loot field of any kind.
   *
   * **This used to be what every chest on the shipped map yielded**, because the
   * engine read `item1/2/3` and the map authors `items` — see {@link chestLoot}.
   * Now that both schemas are read it is genuinely a fallback, and on the shipped
   * map it is unreachable: the tile editor substitutes the `Chest` DataStructure's
   * own `DefaultValues` for any field an author leaves null, so even the two chests
   * that look blank (`main2vault`, `secret2`) arrive carrying a value.
   *
   * That schema default is `"Medkit", "Battery` — with the closing quote genuinely
   * missing in `edplay.json`. {@link parseItemList} is tolerant of it deliberately
   * rather than by accident: those two chests are the only thing that depends on
   * stray quotes being stripped rather than being taken literally.
   *
   * Ordered so that since unlit space became genuinely opaque a Battery outranks Stun
   * Rounds — light is load-bearing, stunning an Orderly bystander is a convenience.
   *
   * **Two entries, not three, since the Access Chit became a keycard.** The slot schema
   * has three and the third was the chit, which opened nothing; a keycard is not a
   * drop-in replacement for it, because a *numbered* credential has to match a door
   * somebody authored and a default table cannot know which. Seeding one here would put
   * the same clearance in every unauthored chest on every map — placement dressed up as
   * a default. A chest that wants to hand out a keycard should say which.
   */
  items: ["Medkit", "Battery"],
} as const;

export function chestStatsFor(components: ComponentData[]): ChestStats {
  return {
    interactionTime: num(components, "chest", "InteractionTime", CHEST_DEFAULTS.interactionTime),
    noiseOnOpen: num(components, "chest", "NoiseOnOpen", CHEST_DEFAULTS.noiseOnOpen),
    items: chestLoot(components),
  };
}

/**
 * What a chest yields, from whichever of the **two** loot schemas it carries.
 *
 * There are two because there are two authors, and both are legitimate:
 *
 * - The **map** writes a single `items` string holding a quoted, comma-separated
 *   list — that is the shape of the `Chest` DataStructure in the tile editor, and
 *   what all six authored chests on the shipped map actually carry.
 * - The **engine's own generators** write `item1` / `item2` / `item3`, one name per
 *   slot (see `src/map/VentCoreLevel.ts`).
 *
 * The engine reading only the second of those is why authored loot was inert for so
 * long: every chest on the map fell through to {@link CHEST_DEFAULTS}, so the Stun
 * Rounds on `main1` and `secret1` never appeared and the hold-up they enable was
 * unreachable in normal play.
 *
 * **Slots win over the list, and that precedence is load-bearing.**
 * `cloneWithComponent` (`src/map/generate.ts`) merges values into a *prototype's*
 * component, so a chest the engine clones from a map tile inherits that tile's
 * authored `items` string whether or not anyone wanted it. A generated slot is a
 * deliberate statement; an inherited list is an accident of cloning. If the list won,
 * the vent core's chest would hand out the donor chest's loot instead of the
 * Rail-Stapler — which is exactly the bug `adoptVentCore` would otherwise reintroduce.
 */
function chestLoot(components: ComponentData[]): string[] {
  // Read the slots raw first: their own fallback is per-slot (a chest naming only
  // `item1` still gets the default's second and third), so asking for them with
  // defaults could not tell "authored" from "absent".
  const slots = ["item1", "item2", "item3"];
  if (slots.some((field) => str(components, "chest", field, "") !== "")) {
    return slots
      .map((field, i) => str(components, "chest", field, CHEST_DEFAULTS.items[i] ?? ""))
      .filter((name) => name !== "");
  }

  const authored = parseItemList(str(components, "chest", "items", ""))
    .map(resolveItemName)
    .filter((name): name is string => name !== undefined);
  // An empty or unparseable list reads as *unset*, not as an empty chest — the two
  // blank chests on the shipped map want the default table, not nothing.
  return authored.length > 0 ? authored : [...CHEST_DEFAULTS.items];
}

export interface PlayerStats {
  /** Full bio-integrity (health). */
  maxHp: number;
  /** Tiles: a silicate this close, with line of sight, during a full alert seizes you. */
  captureRadius: number;
  /** Seconds cornered before the capture (Alignment) completes. */
  captureTime: number;
  /**
   * Seconds the run holds after bio-integrity reaches zero, before the outcome screen.
   *
   * `endRun` stops the HUD scene the same frame it is called, so without this the
   * flatline on the bio-integrity dial renders once and is gone — an entire death
   * state nobody ever sees. Input is already dead through the hold, so it costs the
   * player a beat and buys the one moment the readout exists for.
   */
  deathHold: number;
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
  deathHold: 1.2,
  hazardDamage: 25,
  hitCooldown: 1.0,
};

/**
 * Rowan's baseline walking pace, tiles per second, before {@link paced} and before
 * the stance multipliers in `Player.update`.
 *
 * Lifted out of `Player.ts`, where it was a literal inside the constructor, once a
 * second number had to be balanced against it: a hostage marched ahead of Rowan has
 * to out-walk him or he falls out of the hold, and a relationship between two
 * constants can only be asserted where both of them live.
 */
export const PLAYER_WALK_TILES = 3.2;

// ---------------------------------------------------------------------------
// Squeeze / press / peek / vault
//
// The four movement verbs beyond walk-run-crouch. Their geometry lives in
// `src/systems/WallPress.ts`; these are the numbers that geometry is driven with.
// ---------------------------------------------------------------------------

/**
 * How far from flush (tiles) a face can be and still be latched onto.
 *
 * Generous enough that walking into a wall and tapping press works without
 * lining up, short enough that it can't reach a face on the far side of the
 * cell you're standing in.
 */
export const PRESS_REACH_TILES = 0.55;

/**
 * How far along the face (tiles) the eye reaches when leaning past a corner.
 *
 * Has to clear the corner to be worth anything: the body sits at most half a
 * tile from the wall's end when travel stops, so this is comfortably past it.
 * The sideways half of the lean is derived rather than tuned — see `cornerLean`.
 */
export const PRESS_LEAN_TILES = 0.9;

/** Seconds for the lean to reach full extension, and to come back. */
export const PRESS_LEAN_SECONDS = 0.12;

/** Speed while sliding along a face, as a multiple of the walk pace. */
export const PRESS_SPEED_MULTIPLIER = 0.45;

/**
 * How hard the body is pulled onto the flush line, per second.
 *
 * A proportional pull rather than a snap, so latching on reads as Rowan putting
 * his back to the wall rather than teleporting the last few pixels to it.
 */
export const PRESS_FLUSH_PULL = 9;

/** Noise while sliding along a face — below a crouch-walk's 0.15. */
export const PRESS_NOISE = 0.08;

/**
 * Detection dampening while pressed against a *plain* wall.
 *
 * Cover already conceals outright, so without this pressing anywhere else would
 * be a pure downgrade on crouching and nobody would use it. Rides the same
 * `lightMultiplierAt` channel as the flashlight and opened-ration penalties,
 * which is the one place a standing cost to being perceived belongs.
 */
export const WALL_PRESS_DETECTION_MULTIPLIER = 0.6;

/** Seconds a vault over low cover takes, start to finish. */
export const VAULT_SECONDS = 0.45;

/** How far (tiles) ahead of Rowan a vaultable obstacle is looked for. */
export const VAULT_REACH_TILES = 1.1;

/**
 * Noise a vault makes.
 *
 * Sits between a walk (0.5) and a sprint (1.0): a brief scramble over furniture,
 * not sustained pounding. What it is really tuned against is the squeeze's 0.15 —
 * the two verbs cross the same tile, and going over being four times as loud as
 * going through is the entire reason a player would ever choose the slow one.
 */
export const VAULT_NOISE = 0.6;

/** Loot granted by the vent-core supply chest; enables capacitor fire while JAMMED. */
export const STAPLER_ITEM = "Pneumatic Rail-Stapler";

/**
 * Flavour loot in the vent core's supply chest, alongside the Rail-Stapler.
 *
 * Named rather than left as the string literals they were, because until the chest was
 * furnished on the shipped map (`furnishVentCoreChest`) nothing could ever hold them and
 * the spelling only had to agree with itself. Now they reach the player's KEY ITEMS, so
 * they answer to {@link KNOWN_ITEMS} and to `ItemCatalog` like anything else he carries.
 */
export const SEALANT_TAPE_ITEM = "Sealant Tape";
export const FILTER_MASK_ITEM = "Q0 Filter Mask";

/**
 * What the vent core's supply chest holds.
 *
 * Shared by the two ways an arena comes into being — generated by
 * `src/map/VentCoreLevel.ts`, or adopted from an authored one by
 * `furnishVentCoreChest` in `src/map/AdoptAuthored.ts` — because the Rail-Stapler is
 * what answers VENT-4's JAMMED phase, and a player who reached the boss down one path
 * and not the other would find the fight unwinnable rather than hard.
 *
 * It lives *here*, rather than in either map module, because those two import each
 * other: `VentCoreLevel` calls `adoptVentCore`, and the adopt path needs this loot.
 * Holding it in the module that already owns every item name keeps that a one-way
 * dependency instead of a cycle that happens to work.
 *
 * Written as slots (`item1/2/3`) rather than as an `items` list — see {@link chestLoot}
 * for why the slots have to win over an inherited list.
 */
export const VENT_CORE_CHEST_LOOT: Readonly<Record<string, string>> = {
  item1: STAPLER_ITEM,
  item2: SEALANT_TAPE_ITEM,
  item3: FILTER_MASK_ITEM,
};

/** Proof-of-compliance item granted when VENT-4 is silenced. */
export const CERT_ITEM = "Q0_COMPLIANCE_CERT";

/** Consumable: EMP charge that jams nearby cameras/guards (hotkey 1). */
export const CHAFF_PACK_ITEM = "EMP Grenade";

/** Consumable: thermal-masking buff (hotkey 2). */
export const THERMAL_GEL_ITEM = "Thermal Gel";

/** Consumable: restores bio-integrity (heals Rowan). */
export const RATION_PACK_ITEM = "Medkit";

/** Consumable: recharges the flashlight battery to full. */
export const BATTERY_ITEM = "Battery";

/** Consumable: a dart that stuns Orderly bystanders. */
export const STUN_ROUNDS_ITEM = "Stun Rounds";

/**
 * Consumable: the corporate-spec ration, and the only item you can leave behind.
 *
 * Three states rather than one use: SEALED in the bag, OPENED in the hand (a passive
 * penalty and a passive buffer at the same time), and DEPLOYED on the floor as a lure.
 * The states live in {@link ActiveItemState} and {@link DeployedItem}, not in the name —
 * the inventory is a flat list of names and that is enough for everything else.
 */
export const SACK_LUNCH_ITEM = "Sack Lunch";

/**
 * Rowan starts a run carrying one Sack Lunch — the mechanic is reachable without the
 * debug give-item cheat. A named constant rather than an inline array at each seed
 * point ({@link resetRun} and its `GameScene` fallback) so a second starting item
 * can't be added to one and silently forgotten at the other.
 */
export const STARTING_INVENTORY: readonly string[] = [SACK_LUNCH_ITEM];

/** Equipment: the toggleable flashlight (does not count against the consumable cap). */
export const FLASHLIGHT_ITEM = "Flashlight";

/**
 * Key item: a numbered door credential (does not count against the consumable cap).
 *
 * **Keycards are the one open-ended item family**, so they are a *function* rather than
 * a constant and cannot join {@link KNOWN_ITEMS}: a map may lock a door on any id it
 * likes, and the matching card has to exist without anyone having declared it. That is
 * why {@link resolveItemName} carries a pattern branch and `ItemCatalog`/`ItemIcons`
 * both answer for keycards dynamically instead of holding an entry each.
 *
 * They replaced the Access Chit, which promised "opens keyed doors" in its catalogue
 * copy and never did — nothing in the engine read it, while doors have always locked on
 * a *numeric* {@link DoorStats.key}. `Door`'s own class doc anticipated the fix
 * ("only a terminal hack, or, later, a keycard"), and so did the art: the icon is cut
 * from `keycard_icon.aseprite`, whose five `clearance_level` frames were drawn waiting
 * for items that carry a number.
 *
 * **"Keycard" rather than "Key"** because that is what the rest of the codebase already
 * says — {@link DoorStats.key} documents itself as a keycard id, and
 * `GameScene.guardOperableDoorAt` calls these keycard doors. The shipped map's authored
 * `"Key1"` is the outlier; {@link resolveItemName} accepts that spelling as *input*
 * without adopting it.
 */
export function keycardName(clearance: number): string {
  return `Keycard ${clearance}`;
}

/** The clearance a keycard name carries, or `undefined` if it isn't one. */
export function keycardNumber(name: string): number | undefined {
  // `key`, `keycard`, any spacing, and leading zeros — the map hand-authors these.
  const m = /^\s*(?:key|keycard)\s*0*(\d+)\s*$/i.exec(name);
  if (!m) return undefined;
  const n = Number(m[1]);
  // A door with `key: 0` is *unlocked*, so a Keycard 0 would be a credential for
  // nothing. Rejecting it here keeps that impossible rather than merely useless.
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** True when a name is a keycard of any clearance. */
export function isKeycard(name: string): boolean {
  return keycardNumber(name) !== undefined;
}

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

/**
 * How far a lit flashlight beam betrays Rowan's position, in tiles.
 *
 * Larger than a guard's own {@link ENFORCER_DEFAULTS.sightRange} of 6.5 on purpose,
 * and larger than the beam's own 5.5-tile reach: the point of a torch in the dark is
 * that it is visible from much further away than the thing holding it, so the moment
 * it betrays you is the moment you light up somebody you cannot make out yet.
 *
 * This is the half of the flashlight's cost that was missing.
 * {@link FLASHLIGHT_DETECTION_MULTIPLIER} only ever applied *after* a guard could
 * already see him — `accrueDetection` is gated on `canSense` — so it made a guard who
 * had him fill faster and did nothing at all about the beam being a beacon. A light
 * shone down a corridor at somebody facing away used to cost exactly nothing.
 */
export const FLASHLIGHT_GIVEAWAY_TILES = 10;
/** Radius (tiles) of an EMP Grenade's burst, centred on the player. */
export const CHAFF_EMP_RADIUS_TILES = 4;
/** Seconds an EMP Grenade's burst disables electronics / blinds guards. */
export const CHAFF_EMP_DURATION = 6;
/** Seconds a Thermal Gel dose grants thermal immunity. */
export const THERMAL_GEL_SECONDS = 12;
/** Bio-integrity restored by a manually-used Medkit. */
export const RATION_HEAL = 35;
/** Reach (tiles) of a Stun Rounds dart. */
export const STUN_ROUND_REACH_TILES = 5;
/** Seconds an Orderly stays stunned after being hit by a dart. */
export const STUN_ROUND_DURATION = 8;
/**
 * Radius (tiles) the noise of firing a Stun Rounds dart carries.
 *
 * The quietest emitter there is — quieter than a chest (3) — which is the whole
 * reason to spend a dart rather than walk up and start something.
 */
export const STUN_ROUND_NOISE_TILES = 2;
/**
 * Reach (tiles) of the Rail-Stapler's general-purpose field mode — breaking
 * destructible cover or pinning an orderly outside the VENT-4 fight. Kept
 * separate from {@link Vent4Stats.staplerRange}: the boss fight and the
 * overworld have very different balance needs for the same item.
 *
 * Deliberately at or below Stun Rounds' numbers (5 tiles / 8s): the field
 * mode used to out-range and out-last the consumable it's the closest analog
 * to, on top of being unlimited-use, which made it strictly better in every
 * respect. {@link STAPLER_FIELD_MAX_CHARGES} is what actually fixes the
 * unlimited-use half of that.
 */
export const STAPLER_FIELD_RANGE_TILES = 4;
/** Seconds between field-mode shots — slow enough that even a full charge bar can't be dumped instantly. */
export const STAPLER_FIELD_COOLDOWN = 3;
/** Seconds an orderly stays pinned to a wall after a field-mode hit. */
export const STAPLER_PIN_DURATION = 6;
/**
 * Radius (tiles) the noise of the Stapler's field mode carries.
 *
 * A pneumatic slam: level with a chest (3), so it is usable near a patrol but
 * not under one.
 */
export const STAPLER_FIELD_NOISE_TILES = 3;
/**
 * Field-mode shots per run. Unlike Stun Rounds (a stocked consumable), the
 * Stapler itself is a permanent key item, so the field mode needs its own
 * scarcity — a fixed pool that resets on a fresh run or a loaded save (same
 * as the flashlight's charge, which also isn't part of {@link SaveData}) and
 * currently has no in-run refill source.
 */
export const STAPLER_FIELD_MAX_CHARGES = 3;

/**
 * Full firing arc, in degrees, of everything Rowan points along his facing — the
 * Stun Rounds dart and the Rail-Stapler's field mode.
 *
 * This is not new tuning. It was the bare `0.5` cosine written out three times in
 * `GameScene` (the dart's orderly pass, the dart's cover pass, and the stapler's
 * unified pass), which is a ±60° half-plane test spelled as a magic number. Naming
 * it here is what lets {@link HOLD_UP_ARC_DEGREES} be the *second* named arc in the
 * codebase rather than the third anonymous one.
 */
export const WEAPON_ARC_DEGREES = 120;

// --- Close quarters: the takedown and the hold-up --------------------------

/**
 * Reach (tiles) of Rowan's bare-handed takedown.
 *
 * **[Q] is one verb with two halves, picked by what he is carrying.** Holding a
 * weapon, it is the hold-up ({@link HOLD_UP_REACH_TILES}); empty-handed, it is this.
 * Overloading the key rather than spending a new one is what keeps the two readable
 * as the same idea — closing on a person instead of firing at one — and it means the
 * player is never left with a trigger as his only answer, which matters because the
 * hold-up needs a weapon he may not have found.
 *
 * A third of the hold-up's 3 tiles, and under an orderly's own sight range, because
 * the trade is the point: pointing something at a man works from across the room, and
 * putting hands on him means walking all the way in with nothing in them.
 */
export const PLAYER_MELEE_REACH_TILES = 1.1;

/**
 * Seconds a bare-handed takedown keeps a body on the floor.
 *
 * **This number is loop feasibility, not balance.** It is the whole clock on
 * takedown → lift → carry → stash, because a body that comes round on Rowan's
 * shoulder is dropped where he stands and wakes as a witness (see
 * `GameScene.updateCarry`). Every second of it is spent:
 *
 * | | seconds | |
 * | --- | --- | --- |
 * | press `[E]` and get him up | ~0.5 | he is already at your feet |
 * | carry | 3.5 | {@link CARRY_SPEED_MULTIPLIER} × {@link PLAYER_WALK_TILES} = 1.34 tiles/s, so **4.7 tiles** |
 * | hold `[E]` at the locker | {@link LOCKER_STASH_TIME} 3.0 | |
 *
 * 4.7 tiles is measured against `MAIN1_LOCKERS`, which sit 1.0, 1.0, 1.4, 4.0, 4.1
 * and 5.8 tiles from the waypoints of the two `security_guard_*` beats — so the free
 * verb reaches five of those six, and the sixth is what the dart's longer window is
 * for. At 5 seconds the carry budget was 1.5s, or **2.0 tiles**: you could put a man
 * down beside a locker and stash him, and nothing else. That was this constant's
 * first value and it was wrong — sized against the stash hold alone, on the old
 * assumption that the window stopped mattering once he was up.
 *
 * Which leaves it barely under {@link STUN_ROUND_DURATION} (8) rather than the
 * decisive gap it was written as, and that is the honest place for it: a window this
 * verb needs to function cannot also be the thing that makes it weaker than the dart.
 * {@link PLAYER_MELEE_COOLDOWN} and {@link PLAYER_MELEE_NOISE_TILES} carry that, along
 * with the five tiles of standoff the dart has and this has not.
 */
export const PLAYER_MELEE_DOWN_DURATION = 7;

/**
 * Seconds between takedown attempts — a scuffle Rowan has to recover from.
 *
 * Longer than the half-second it reads as, and longer than it was (0.9), because at
 * that number two people standing abreast were one press apart: the recovery was
 * shorter than the walk between them, so a pair was never really a harder problem
 * than a man alone. Now the second one is a decision made while the first is on the
 * floor rather than a follow-up to the same press.
 */
export const PLAYER_MELEE_COOLDOWN = 1.6;

/**
 * Radius (tiles) of the noise a takedown makes.
 *
 * The three ways off the board stay ordered by what they cost to use: a hold-up is
 * silent and buys only passage, this is 1.5 tiles and takes a man down for a stretch,
 * and the dart is 2 and does it from five tiles away. Paying a little noise to skip
 * the dart you don't have is the trade this verb exists to offer — but a scuffle at
 * arm's length carries about as far as a guard's own strike
 * ({@link GUARD_MELEE_NOISE_TILES}, 1.5), which is the honest number for two people
 * going to the floor together. At 1 it was quiet enough that the deck effectively
 * never heard the thing the player did most.
 */
export const PLAYER_MELEE_NOISE_TILES = 1.5;

// --- The hold-up ----------------------------------------------------------

/**
 * Reach (tiles) at which Rowan can put a weapon *on* a person rather than fire it.
 *
 * Deliberately under both weapons' own reach (5 and 4): the dart and the staple are
 * things you do from across a room, and the hold-up is the thing you close for. It
 * is also under the orderly's own five-tile sight range ({@link Orderly}), which is
 * the point — letting a man go at maximum reach still leaves you standing in his
 * eyeline, so the grace below is a deadline rather than a dismissal.
 *
 * **There is no noise constant here, and the absence is the mechanic.** The dart
 * pings at 0.2 and the stapler at 0.35; a hold-up is the only way to take a person
 * off the board without telling the deck you did it. A `HOLD_UP_NOISE = 0` would
 * read as an oversight and get "fixed" by the next person through; an absence
 * documented in prose cannot be.
 */
export const HOLD_UP_REACH_TILES = 3;

/**
 * Reach (tiles) at which an *established* hold finally breaks.
 *
 * Wider than {@link HOLD_UP_REACH_TILES} on purpose. A hostage marched ahead of you
 * lags when he clips a corner, and without hysteresis the hold would strobe on and
 * off at the acquire boundary — freeing and re-freezing him several times a second,
 * which flickers the anomaly a patrol sees.
 */
export const HOLD_UP_RELEASE_TILES = 4.5;

/**
 * Full arc (degrees) inside which a hold-up can be *started*.
 *
 * Narrower than {@link WEAPON_ARC_DEGREES}, because this one is aimed rather than
 * sprayed: with two orderlies abreast, which of them puts his hands up should be a
 * choice you made, not the one the dot product happened to prefer.
 */
export const HOLD_UP_ARC_DEGREES = 90;

/**
 * Full arc (degrees) inside which an established hold *survives*.
 *
 * Much wider than the acquire arc, because a man walking ahead of you swings a long
 * way off your axis as you both round a corner. Range is the gate that should end a
 * march; angle ending it would make corners un-navigable with a hostage.
 */
export const HOLD_UP_RELEASE_ARC_DEGREES = 160;

/** Tiles ahead of Rowan a marched hostage is held — just over one, so he leads through a doorway. */
export const ESCORT_STANDOFF_TILES = 1.2;

/**
 * Marched pace (tiles/sec) of a hostage walking ahead of Rowan.
 *
 * The one paced constant in this block, because it is the only one that *moves*.
 * It must exceed an orderly's own wander speed (1.1) or he could not keep station
 * with Rowan's escort pace — 3.2 × {@link ESCORT_SPEED_MULTIPLIER} = 1.44 — and
 * would fall out of the hold on every straight.
 */
export const ESCORT_WALK_TILES = paced(1.6);

/** Rowan's speed multiplier while marching someone — the sneak pace, since his hands are full. */
export const ESCORT_SPEED_MULTIPLIER = 0.45;

/**
 * Seconds a released hostage stays frozen before the ordinary witness path resumes.
 *
 * A hold-up buys passage, not absolution: at Rowan's walking pace this is a corner's
 * worth of head start, not a room's. It is well under the stapler's six-second pin
 * and the dart's eight seconds, so the free option is never also the strongest hold.
 *
 * Note the timer that actually decides whether he reports you is not this one — it
 * is `FLAG_HOSTILE` (14s), because a flagged Rowan cannot use the compliance
 * short-circuit at the top of `Orderly.canSee`. You have to break the sightline.
 */
export const HOLD_UP_GRACE_SECONDS = 4;

/**
 * Body radius (tiles) an orderly is collided against.
 *
 * Hand-written rather than taken off the silhouette, unlike the guards' radii: an
 * orderly's box is 17px of body in a 96px frame — nearly all padding — and half of
 * that is narrower than a body has any business being. 0.3 clears a one-tile
 * passage with room either side.
 */
export const ORDERLY_COLLISION_RADIUS_TILES = 0.3;

// --- The Sack Lunch, and the Orderly overrides it triggers ----------------

/**
 * Reach (tiles) at which an orderly notices a deployed lunch it can *see*, and
 * the shorter reach at which it notices one it can only smell.
 *
 * The scent radius deliberately ignores walls, which is exactly why it is the
 * smaller of the two: a sensor channel that passes through geometry has to be
 * short, or a lunch dropped in a sealed side room would empty the deck.
 */
export const SACK_LUNCH_SIGHT_TILES = 6;
export const SACK_LUNCH_SCENT_TILES = 3;

/** Seconds an orderly spends sanitising a deployed lunch before it destroys it. */
export const SANITATION_SECONDS = 6;

/**
 * How an orderly's witness check is degraded while it is bent over a spill.
 *
 * The design brief asked for "the vision cone narrows by 50%", but an orderly has no
 * cone — {@link Orderly} witnesses through an omnidirectional line-of-sight test, since
 * a person looking around is not a mounted camera. So the 50% lands on the radius, and
 * the *flank* half of the brief ("back/flank stealth tolerance increases") is what the
 * forward arc below buys: while cleaning, and only while cleaning, an orderly has a
 * behind to sneak past.
 */
export const SANITATION_SIGHT_MULTIPLIER = 0.5;
export const SANITATION_CONE_DEGREES = 90;

/**
 * Seconds an orderly tolerates a visibly-eating asset before reporting it anyway.
 *
 * Orderlies have no detection meter — witnessing is one-shot and binary — so the
 * brief's "delays detection/aggro meter buildup" is this grace timer standing in for
 * the meter. It fills while the orderly can see Rowan and drains at the same rate once
 * it can't, so crossing a sightline is free and loitering in one is not.
 */
export const RATION_SPOOF_SECONDS = 5;

/**
 * The passive cost of walking around with the bag open: crinkling packaging and an
 * organic smell, as a detection-fill multiplier and a bump to the noise profile.
 *
 * The multiplier is the half that bites. It rides the same closure the flashlight's
 * does ({@link SensingContext}), so it works on guards and cameras alike; the noise
 * bump exists because a noise profile that nothing reads would be a lie, and VENT-4's
 * grate check reads it today.
 */
export const OPENED_RATION_DETECTION_MULTIPLIER = 1.15;
export const OPENED_RATION_NOISE = 0.1;

// --- Item taxonomy -------------------------------------------------------

/**
 * Every item name the game knows how to act on.
 *
 * The list exists to answer one question — *is this string an item?* — which the
 * chest loader has to ask because the map is authored by hand and does not always
 * spell things the way the engine does.
 *
 * Deliberately **not** derived from `ItemCatalog.catalogedNames()`, tempting as that
 * is: `ItemCatalog` imports this module, so importing it back would close a cycle.
 * The two are kept in step by a test instead, which can import both — see
 * `EntityStats.test.ts`. The two log-cache halves are here but *not* catalogued, so
 * the assertion is containment rather than equality.
 */
export const KNOWN_ITEMS: readonly string[] = [
  CHAFF_PACK_ITEM,
  THERMAL_GEL_ITEM,
  RATION_PACK_ITEM,
  BATTERY_ITEM,
  STUN_ROUNDS_ITEM,
  SACK_LUNCH_ITEM,
  FLASHLIGHT_ITEM,
  EIRA7_LOG_ITEM,
  CERT_ITEM,
  STAPLER_ITEM,
  SEALANT_TAPE_ITEM,
  FILTER_MASK_ITEM,
  LOG_ALPHA_ITEM,
  LOG_BETA_ITEM,
];

/** Case- and space-insensitive form of an item name, for matching authored spellings. */
const itemKey = (name: string): string => name.toLowerCase().replace(/\s+/g, "");

/**
 * Splits the map's `items` field into names.
 *
 * The authored form is a quoted, comma-separated list — `"Battery", "EMP Grenade"` —
 * written by hand in the tile editor, so the parse is forgiving about spacing and
 * about stray quotes, and drops empty entries rather than yielding blank items.
 */
export function parseItemList(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim().replace(/^"+|"+$/g, "").trim())
    .filter((part) => part !== "");
}

/**
 * The canonical item name an authored spelling means, or `undefined` for one the game
 * has never heard of.
 *
 * Matching ignores case and spacing, which is what rescues `main1`'s `"StunRounds"` —
 * the same item as {@link STUN_ROUNDS_ITEM}, written without the space. That one
 * matters more than it looks: it is the only Stun Rounds the player can reach before
 * `secret1`, and carrying them is what enables the hold-up.
 *
 * **An unrecognised name is dropped, not granted.** `main1` also authors `"Key1"`,
 * which has no engine meaning at all — doors lock on a *numeric* `key` field and
 * nothing reads an inventory item as a key. Granting the string anyway would be worse
 * than ignoring it: {@link isKeyItem} is the complement of {@link CONSUMABLE_ORDER}, so
 * it would sit in the player's KEY ITEMS for the whole run with no icon, no
 * description and no effect.
 */
export function resolveItemName(raw: string): string | undefined {
  // Keycards first, and by pattern rather than by lookup: they are open-ended, so
  // {@link KNOWN_ITEMS} cannot list them. This is also what turns `main1`'s authored
  // `"Key1"` into a real item — it was dropped on the floor until keycards existed.
  const clearance = keycardNumber(raw);
  if (clearance !== undefined) return keycardName(clearance);
  const key = itemKey(raw);
  return KNOWN_ITEMS.find((name) => itemKey(name) === key);
}

/**
 * The consumables selectable through the item cursor, in canonical display
 * order. Held consumables fill the list dynamically (unheld names are
 * skipped), so e.g. a player holding only Thermal Gel + Medkit sees just
 * those two, in that order.
 */
export const CONSUMABLE_ORDER = [
  CHAFF_PACK_ITEM,
  THERMAL_GEL_ITEM,
  RATION_PACK_ITEM,
  BATTERY_ITEM,
  STUN_ROUNDS_ITEM,
  SACK_LUNCH_ITEM,
] as const;

/** Hard cap on the total number of consumables held at once. */
export const MAX_CONSUMABLES = 8;

/** True when an item name is one of the capped, cursor-selectable consumables. */
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
 * list that genuinely has to stay curated — it drives the item cursor and the carry
 * cap — so keying off its complement means a new item can't fail to appear.
 */
export function isKeyItem(name: string): boolean {
  return !isConsumable(name);
}

/**
 * Total consumables currently held — the value checked against {@link MAX_CONSUMABLES}.
 *
 * Counted in a loop rather than with `filter(...).length`: the inventory HUD reads
 * this every frame through `inventoryLines`, and an array allocated to carry one
 * integer is the pattern `SmacCore`'s `SmacView` exists to have removed.
 */
export function countConsumables(items: string[]): number {
  let held = 0;
  for (const item of items) if (isConsumable(item)) held++;
  return held;
}

/** One held, distinct consumable type, with its position in the display list. */
export interface ConsumableSlot {
  /** 1-based position in the held-consumables list, for display only. */
  slot: number;
  /** The consumable item name. */
  name: string;
  /** How many of it are held. */
  count: number;
}

/**
 * Maps held consumables to a display list in {@link CONSUMABLE_ORDER} order,
 * skipping names the player isn't carrying. Shared by the inventory HUD, the
 * pause menu's INVENTORY tab, and the UIScene item cursor so all three agree
 * on the ordering. Naturally bounded by `CONSUMABLE_ORDER.length` (one entry
 * per distinct type) rather than {@link MAX_CONSUMABLES} (a total-*unit*
 * cap) — the two are different quantities and conflating them would truncate
 * the list wrongly once a player holds many distinct types at once.
 */
export function consumableSlots(items: string[]): ConsumableSlot[] {
  const slots: ConsumableSlot[] = [];
  for (const name of CONSUMABLE_ORDER) {
    // Counted in place. `UIScene.update` calls this every frame to normalise the
    // item cursor, and a `filter(...).length` here threw away one array per
    // consumable type per frame to arrive at a number.
    let count = 0;
    for (const item of items) if (item === name) count++;
    if (count === 0) continue;
    slots.push({ slot: slots.length + 1, name, count });
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
