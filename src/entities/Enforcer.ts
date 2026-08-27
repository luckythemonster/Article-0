import Phaser from "phaser";
import type { ComponentData } from "../map/types";
import { CollisionGrid } from "../systems/CollisionGrid";
import { AlertState, type AlertPhase } from "../systems/AlertState";
import type { FirearmsAuthorization } from "../systems/Firearms";
import type { DeployedLure } from "../systems/Deployables";
import { enforcerStatsFor, type EnforcerStats } from "../systems/EntityStats";
import { moveCirclePx } from "../systems/GridMotion";
import { findPath, smoothPath, type PathNode } from "../systems/Pathfinder";
import type { PatrolRoute } from "../systems/PatrolRoute";
import { accrueDetection, canSense, type Eye } from "../systems/Sensing";
import { angleDiff } from "../systems/angles";
import { drawVisionCone, GUARD_CONE } from "../ui/VisionCone";
import { shadowShapeFor, type ShadowShape } from "../render/shadowShape";
import { type GuardSkin } from "./GuardSkin";
import { DIRS_8, nearestDirection, type Dir8 } from "./directions";
import { ENFORCER_SKIN } from "./EnforcerAnimations";
import { alertMarker, speechMarker, AUDIBLE_LINE_DEPTH } from "./markers";
import { getAudio } from "../systems/AudioDirector";
import { decideBark, type SilicateVoice } from "../systems/SilicateBarks";
import { len, withinOrEqual } from "../systems/distance";
import { workDoors } from "./doorWork";

/**
 * A per-guard behaviour state, layered on top of the global {@link AlertState}
 * phase (which stays the base-wide ALERT/EVASION/INFILTRATION authority for
 * network broadcasts and the HUD):
 *
 *  - **PATROL**    — default route navigation and vision-cone sweep.
 *  - **CAUTIOUS**  — elevated alertness after finishing a search or an empty
 *                    investigation: faster cone sweep, faster detection fill.
 *  - **SUSPICIOUS**— investigating a specific noise origin or anomaly.
 *  - **ALERT**     — confirmed sighting; pursuing and (via the network) pulling
 *                    in nearby guards. Mirrors global phase "ALERT".
 *  - **SEARCHING** — sweeping the last known player position after losing LOS.
 *                    Mirrors global phase "EVASION".
 */
export type GuardState = "PATROL" | "CAUTIOUS" | "SUSPICIOUS" | "ALERT" | "SEARCHING";

/**
 * An attack made by a pursuing guard this frame — the scene applies its effects.
 *
 * **`kind` is the whole point of this type.** A guard's default answer is `"melee"`:
 * he closes and puts hands on you. A `"shot"` needs two independent permissions —
 * an {@link ../systems/EntityStats.EnforcerStats}`.armed` guard and a facility that
 * has released weapons ({@link ../systems/Firearms.FirearmsAuthorization}) — so on a
 * quiet run this variant is never constructed at all.
 *
 * The two resolve differently and the difference is not cosmetic: a shot travels, so
 * the scene traces it through hostages and destructible cover and draws a tracer; a
 * strike is contact, so nothing can intervene between the guard and Rowan and there
 * is no line to draw. See `GameScene.resolveGuardAttack`.
 */
export interface EnforcerAttackResult {
  kind: "melee" | "shot";
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  damage: number;
}

/**
 * An anomaly that is a *person*, in a state no orderly ever puts themselves in:
 * dropped by a dart, stapled to a wall, or standing with their hands up.
 *
 * Split out from the rest because these three take a different branch in
 * {@link Enforcer.scanAnomalies} — an instant, base-wide sighting rather than a
 * walk-over investigation — and because that branch is the only reason they are
 * safe. `GameScene.pushAnomaly` keys an anomaly by its tile, and *people move*: a
 * key of `orderly:<tx>:<ty>` changes every time its subject crosses a tile boundary.
 * The instant branch returns before it ever consults `investigatedAnomalies`, so
 * nothing accumulates. Demoting any of these kinds to an investigation would leak a
 * Set entry per tile per orderly for the length of the run, and have a guard
 * re-investigate the same man forever.
 */
export type PersonAnomalyKind =
  | "stunnedOrderly"
  | "pinnedOrderly"
  | "surrenderedOrderly"
  | "downedGuard";

/** True for the three kinds that are a person rather than a thing. */
export function isPersonAnomaly(kind: GuardAnomaly["kind"]): kind is PersonAnomalyKind {
  return (
    kind === "stunnedOrderly" ||
    kind === "pinnedOrderly" ||
    kind === "surrenderedOrderly" ||
    kind === "downedGuard"
  );
}

/** An environmental anomaly a guard's vision cone can notice. */
export interface GuardAnomaly {
  /** Pixel-space position, for cone/LOS checks. */
  x: number;
  y: number;
  /** Tile-space position, for search/anomaly bookkeeping. */
  tx: number;
  ty: number;
  kind: "door" | "chest" | "device" | PersonAnomalyKind;
  /** Stable identity so a guard investigates a given anomaly at most once. */
  key: string;
}

export interface EnforcerContext {
  grid: CollisionGrid;
  tileSize: number;
  player: { x: number; y: number };
  /** Extra detection sensitivity where the player stands (lights raise it). */
  lightMultiplierAt: (px: number, py: number) => number;
  /** 0 = silent, 1 = loud; running lets guards hear the player behind cover. */
  playerNoise: number;
  /** True when the player is hidden (crouched in cover) — cones can't see them. */
  playerConcealed: boolean;
  /**
   * True when the player currently reads as compliant staff (see
   * {@link ConductState}). Not the same thing as concealment: the guard *does* see
   * Rowan and clears him anyway, so it suppresses sensing outright rather than
   * breaking a sightline.
   */
  playerCompliant: boolean;
  /**
   * True when the player is hidden from *thermal* sensing too. Normally equal to
   * {@link playerConcealed}, but heat-leaking cover (ThermalBleed) still exposes
   * them to the short-range heat sense while breaking the visible cone.
   */
  playerThermalConcealed: boolean;
  /**
   * Which walk surface the player is on — see `src/map/planes.ts`. Sensing does
   * not cross between them, so a guard on the floor loses a player who has
   * climbed the gantry, and vice versa.
   */
  playerPlane?: number;
  /** Non-null while an EMP Grenade's EMP zone is live; guards inside it can't see. */
  chaffZone: { x: number; y: number; radiusPx: number } | null;
  /** Scales a guard's thermalRadius stat (in tiles) — 0 while Thermal Gel is active. */
  thermalRadiusMultiplier: (baseTiles: number) => number;
  alert: AlertState;
  /**
   * Whether the facility has released firearms this frame.
   *
   * Read only by {@link Enforcer.pursue}, and only for a guard that carries one at
   * all. Base-wide rather than per-guard because that is what it models: a building
   * deciding the situation warrants weapons, not a man deciding he has had enough.
   */
  firearms: FirearmsAuthorization;
  /** Opened doors/chests, EMP'd devices, and stunned orderlies visible this frame. */
  anomalies?: GuardAnomaly[];
  /**
   * Items the player has deployed on the floor this frame.
   *
   * Read by orderlies only — a spill is a work order, and guards do not do
   * cleaning. They live on this context rather than an orderly-shaped one because
   * `GameScene` deliberately hands the *same* object to both (an `OrderlyContext`
   * is a structural subset of this one), rather than minting a second literal per
   * orderly per frame. Making guards notice litter would be one push into
   * `GameScene.buildAnomalies`, not a change here.
   */
  lures?: readonly DeployedLure[];
  /** True while an opened ration buys tolerance from orderlies — see {@link OrderlyContext}. */
  rationSpoof?: boolean;
  /** Player's current velocity (px/s), for smart search-point prediction. */
  playerVelocity?: { x: number; y: number };
  /** Cover tiles (pixel centres) within `radiusTiles` of a tile position. */
  coverTilesNear?: (tileX: number, tileY: number, radiusTiles: number) => { x: number; y: number }[];
  /**
   * True when this tile holds a door staff may work themselves — unlocked, and
   * not a wall. Staff route through their own facility's doors rather than
   * treating every one as permanent geometry: `main1`'s patrol beat crosses two
   * of them, and without this the south half of the route is simply unreachable.
   *
   * Named for the door rather than for the guard because the orderlies read the
   * same predicate off this same context — see `OrderlyContext.isOperableDoor`,
   * which had the identical problem and went unnoticed for longer.
   */
  isOperableDoor?: (tileX: number, tileY: number) => boolean;
  /** Opens or closes a door the guard is working. */
  setDoorOpen?: (tileX: number, tileY: number, open: boolean) => void;
}

interface Investigation {
  tx: number;
  ty: number;
  px: number;
  py: number;
  /** True when the guard has clear LOS to the origin and only needs to turn. */
  pivotOnly: boolean;
  anomalyKey?: string;
}

const RAY_COUNT = 24;

const INSPECT_DURATION = 3.0; // seconds paused in SUSPICIOUS at the investigation target
const CAUTIOUS_DURATION = 20; // seconds a guard stays CAUTIOUS after searching/investigating
const CAUTIOUS_TURN_MULTIPLIER = 1.5; // +50% cone sweep turn rate while CAUTIOUS
const CAUTIOUS_DETECTION_MULTIPLIER = 1.25; // +25% detection fill rate while CAUTIOUS
const ARRIVE_DIST_FACTOR = 0.3; // fraction of a tile considered "arrived"
const FACING_EPSILON = 0.05; // radians considered "facing" a pivot target
const SEARCH_RADIUS_TILES = 4; // how far from the last-known tile to look for cover/doorways
const MAX_SEARCH_COVER_POINTS = 3;
const SEARCH_POINT_PAUSE = 1.2; // seconds spent checking each search point

/**
 * Seconds between A* calls for the same goal. A guard re-plans immediately when
 * its goal changes or a door moves; this floor only governs the periodic refresh
 * that catches everything else, and staggering it per guard at construction
 * keeps a roomful of them from all searching on the same frame.
 */
const REPATH_INTERVAL = 0.4;
/** Consecutive fully-blocked steps before a guard assumes its path went stale. */
const STUCK_STEPS_BEFORE_REPATH = 8;
/** Half-width (radians) of the cone's idle sweep either side of the walk direction. */
const SCAN_SWEEP_ARC = Phaser.Math.DegToRad(50);

/** What a single {@link Enforcer.followPath} step achieved. */
type FollowResult = "moving" | "arrived" | "unreachable";

/**
 * A patrolling guard with a wall-clipped vision cone and a per-guard
 * detection meter. Behaviour is shared by every guard type (the map's
 * `enforcers` and `drones` boards both carry the same `enforcer` component
 * schema) — only the sprite ({@link GuardSkin}) differs, so reskins like
 * {@link Drone} subclass this and pass their own skin.
 *
 * Layered on the global {@link AlertState} phase, each guard also tracks its
 * own {@link GuardState}: it investigates noises and anomalies (SUSPICIOUS),
 * stays sharper for a while afterward (CAUTIOUS), pursues a confirmed sighting
 * (ALERT), and sweeps smart search points after losing the player (SEARCHING).
 */
export class Enforcer {
  readonly stats: EnforcerStats;
  detection = 0; // 0..1
  /**
   * Where the guard is *looking* — the vision cone's axis, and what the radar
   * and detection tests read. Distinct from {@link moveDir}: the guard's body
   * glides along its path while the camera-arms sweep, which is exactly what
   * the patrol-scan art depicts.
   */
  facing: number;
  state: GuardState = "PATROL";
  /**
   * Pixel position. Public because the scene reads it constantly — radar blips,
   * network alerts, cornering checks, the debug overlay — and a `position`
   * getter returning `{ x, y }` minted a throwaway object on every one of those
   * reads, several times per guard per frame. Same convention as {@link Player}.
   */
  x: number;
  y: number;
  /** Footprint the ground shadow is drawn from — see `EntityShadows`. */
  readonly shadow: ShadowShape;
  /** Heading the body is travelling along; drives which sprite direction plays. */
  private moveDir: number;
  private scanTimer = 0;
  private turnDir = 1;
  /** Current cone offset from {@link moveDir}, swept back and forth on patrol. */
  private scanOffset = 0;
  private readonly skin: GuardSkin;
  /** Body radius in tiles. Read by the shared {@link workDoors} — see `doorWork.ts`. */
  readonly radiusTiles: number;
  /** Reused across frames — {@link canSense} only reads it. */
  private readonly eye: Eye;

  /** Which walk surface this guard patrols — see `src/map/planes.ts`. */
  readonly plane: number;
  /** Seconds of EMP shutdown remaining; while > 0 the guard is inert. */
  private downTimer = 0;
  /** Out of sight in a locker — see {@link setStashed}. */
  private stashed = false;
  private readonly cone: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Sprite;
  private readonly bang: Phaser.GameObjects.Text;
  /** The spoken line, shown as text so a muted player gets the same information. */
  private readonly speech: Phaser.GameObjects.Text;
  /** Seconds the current line stays on screen. */
  private speechTimer = 0;
  /** The state the last bark was for, so only a change speaks. */
  private barkedState: GuardState | null = null;
  private barkCooldown = 0;
  private dir: Dir8 = "south";

  private prevPhase: AlertPhase = "INFILTRATION";
  /** Seconds until the pursuing-guard ranged attack (see {@link pursue}) can fire again. */
  private fireCooldownLeft = 0;
  private meleeCooldownLeft = 0;
  private cautiousTimer = 0;
  private investigation: Investigation | null = null;
  private inspectTimer = 0;
  private pendingNoise: { x: number; y: number } | null = null;
  private readonly investigatedAnomalies = new Set<string>();
  private searchTargets: { x: number; y: number }[] = [];
  private searchIndex = 0;
  private searchPause = 0;

  /** Ordered patrol waypoints (tile coords), walked as a loop. May be empty. */
  private readonly route: PatrolRoute;
  private routeIndex = 0;
  /** True while walking back to the route after a search or investigation. */
  private rejoiningRoute = false;

  /** Smoothed waypoints of the path currently being walked (tile coords). */
  private path: PathNode[] = [];
  private pathIndex = 0;
  /** Tile the current path was planned to; a change forces a re-plan. */
  private pathGoal: PathNode | null = null;
  private repathTimer = 0;
  /** `CollisionGrid.revision` the path was planned against — doors invalidate it. */
  private pathRevision = -1;
  private stuckSteps = 0;
  /** A door this guard opened to get through and still has to shut behind it. */
  /** Read and written by the shared {@link workDoors} — see `doorWork.ts`. */
  heldDoor: PathNode | null = null;

  /**
   * Whether this guard is a silicate.
   *
   * A getter on the prototype rather than a field, so a subclass overrides it
   * without any constructor-ordering hazard. `SecurityGuard` is the one that
   * answers false, and the distinction is load-bearing rather than flavour: the
   * Shared Field merges only with silicates, and the capture ending is the mesh
   * pruning Rowan's logs — a man cornering him is neither.
   */
  get isSilicate(): boolean {
    return true;
  }

  /**
   * Which of the two silicate voices this guard speaks in.
   *
   * On the base class because the enforcer *is* the base class; `Drone`
   * overrides it. A `SecurityGuard` inherits "enforcer" and never uses it — see
   * {@link barkOnStateChange}, which returns before reading this for anything
   * that is not a silicate.
   */
  protected get voice(): SilicateVoice {
    return "enforcer";
  }

  /**
   * Seconds before this guard may speak again.
   *
   * Long enough to cover an alert converging several patrols on one point, which
   * is the case that turns barks into a chord.
   */
  private static readonly BARK_COOLDOWN = 4;

  /** How long a spoken line stays on screen. Roughly how long SAM takes to say one. */
  private static readonly BARK_SHOW_SECONDS = 2.2;

  constructor(
    scene: Phaser.Scene,
    tileX: number,
    tileY: number,
    tileSize: number,
    components: ComponentData[],
    skin: GuardSkin = ENFORCER_SKIN,
    route: PatrolRoute = [],
    plane = 0,
    /**
     * Already-read stats, for a subclass whose defaults are not an enforcer's.
     *
     * Paired with `skin` and defaulted the same way: a reskin that is also a
     * retune supplies both, and everything else keeps reading the `enforcer`
     * component exactly as before. `src/entities/SecurityGuard.ts` is the one
     * caller — the drone is an enforcer in every respect but its drawing, so it
     * passes a skin and nothing else.
     */
    stats: EnforcerStats = enforcerStatsFor(components),
  ) {
    this.plane = plane;
    this.skin = skin;
    this.radiusTiles = skin.collisionRadiusTiles;
    this.stats = stats;
    this.route = route;
    this.x = (tileX + 0.5) * tileSize;
    this.y = (tileY + 0.5) * tileSize;
    // Head for the *next* waypoint, so a guard spawned on waypoint 0 sets off
    // along its beat rather than standing on the spot it already occupies.
    this.routeIndex = route.length > 1 ? 1 : 0;
    this.facing = Phaser.Math.FloatBetween(0, Math.PI * 2);
    this.moveDir = this.facing;
    // Stagger the periodic re-plan so guards don't bunch their A* calls onto
    // the same frame.
    this.repathTimer = Phaser.Math.FloatBetween(0, REPATH_INTERVAL);

    Enforcer.ensureAnimations(scene, skin);

    this.eye = {
      x: this.x,
      y: this.y,
      facing: this.facing,
      rangeTiles: this.stats.sightRange,
      coneDegrees: this.stats.sightAngle,
      thermalTiles: this.stats.thermalRadius,
      plane: this.plane,
    };

    this.cone = scene.add.graphics().setDepth(400);
    this.body = scene.add.sprite(this.x, this.y, skin.frameKey("south", 0)).setDepth(450);
    this.body.setScale((tileSize * skin.displayTiles) / skin.sourceSize);
    // Per skin rather than per class, so the drone's low splayed chassis gets its own
    // footprint instead of an enforcer's without anyone writing a second line of code.
    this.shadow = shadowShapeFor(skin.collider, skin.displayTiles, tileSize);
    this.body.play(skin.animKey("south"));
    this.bang = alertMarker(scene, this.x, this.y, tileSize);
    // Above the darkness, unlike the "!" beside it — see `AUDIBLE_LINE_DEPTH`.
    this.speech = speechMarker(scene, this.x, this.y, tileSize, AUDIBLE_LINE_DEPTH);
  }

  /**
   * Says something on entering a new state, and shows it.
   *
   * Fired on the *change* only. A line every frame in `ALERT` would be a
   * continuous drone, and the whole value of a bark is that it marks the moment
   * something changed in a room the player may not be looking at.
   *
   * The cooldown is per guard and exists for the case that made it necessary: an
   * alert converges four patrols on one point and they all enter `ALERT` within a
   * few frames of each other. Without it that is a chord rather than a callout.
   *
   * A human security guard says nothing here. These lines are the apparatus
   * talking about itself and they are voiced by a formant synthesiser; putting
   * them in a person's mouth would erase the distinction the whole run is about.
   * He is silent for now rather than borrowing a voice that is not his.
   *
   * Whether a change speaks lives in {@link decideBark}, not here — the rules
   * are the interesting part and this class cannot be unit-tested. What the two
   * silent answers mean is the subtlety: `latch` false is a line held back by
   * the cooldown, so the record of the last spoken state is deliberately *not*
   * moved on and the next frame asks again. This used to record it either way,
   * which quietly ate every bark the cooldown deferred.
   */
  private barkOnStateChange(dt: number): void {
    this.barkCooldown = Math.max(0, this.barkCooldown - dt);
    const state = this.state;
    if (state === this.barkedState) return;

    const { line, latch } = decideBark(
      this.barkedState,
      state,
      this.barkCooldown,
      Math.random(),
      this.isSilicate,
    );
    if (latch) this.barkedState = state;
    if (line === undefined) {
      // Settled silence (`PATROL`, or a guard who is not a silicate) drops
      // whatever the last line left on screen. A deferred one leaves it alone.
      if (latch) this.speech.setVisible(false);
      return;
    }
    this.barkCooldown = Enforcer.BARK_COOLDOWN;
    this.speech.setText(line);
    this.speech.setVisible(true);
    this.speechTimer = Enforcer.BARK_SHOW_SECONDS;
    getAudio().bark(line, this.voice);
  }

  /**
   * Puts this guard on the floor for a stretch.
   *
   * One timer, two words for what it is: a human security guard is knocked
   * **unconscious** by a Stun Rounds dart, and a silicate is **deactivated** by an
   * EMP at close range. The distinction is entirely in which weapon reaches which
   * guard — see `fireStunDart` and `detonateChaff` in
   * `src/scenes/game/ItemActions.ts` — and the state they produce is the same
   * state, because from the player's side both are a body to deal with.
   *
   * Neither weapon could do this before. The dart only ever looked at orderlies,
   * and the EMP only *blinded*: it laid down a positional chaff zone guards could
   * not see through while they went on walking their beats. So nothing in the
   * game could put a guard down at all, and the takedown half of a stealth game
   * was missing rather than merely hard.
   *
   * Deliberately a timer, not a kill. Nothing in this game destroys a silicate
   * and it should not start here: the run's argument is about what a silicate
   * *is*, and a permanent off-switch would settle that in the mechanics rather
   * than leaving it to the Tribunal.
   */
  putDown(seconds: number): void {
    this.downTimer = Math.max(this.downTimer, seconds);
    this.detection = 0;
    this.clearPath();
    this.bang.setVisible(false);
    this.speech.setVisible(false);
    this.speechTimer = 0;
  }

  /** True while on the floor — guards read one of these as an anomaly. */
  get isDown(): boolean {
    return this.downTimer > 0;
  }

  /**
   * Puts the guard out of sight, or takes it back out. See
   * {@link Orderly.setStashed}, which this mirrors exactly — including the timer
   * continuing to run inside the locker.
   */
  setStashed(on: boolean): void {
    if (this.stashed === on) return;
    this.stashed = on;
    this.body.setVisible(!on);
    if (on) {
      this.bang.setVisible(false);
      this.speech.setVisible(false);
      this.cone.clear();
    }
  }

  /** True while out of sight in a locker. */
  get isStashed(): boolean {
    return this.stashed;
  }

  /** A body that can be picked up: down, and not already put away. */
  get isCarryable(): boolean {
    return this.isDown && !this.stashed;
  }

  /** Moves a carried body with the carrier. */
  moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.body.setPosition(x, y);
    this.eye.x = x;
    this.eye.y = y;
  }

  update(dt: number, ctx: EnforcerContext): EnforcerAttackResult | undefined {
    const { tileSize, grid } = ctx;

    // Stashed: nothing to draw, think or sense. The shutdown clock still runs —
    // see `setStashed` — so this ticks it before bailing out.
    if (this.stashed) {
      this.downTimer = Math.max(0, this.downTimer - dt);
      return undefined;
    }

    // Down: inert on the floor, blind, and not walking anywhere.
    // The cone is cleared rather than merely narrowed, because a dark cone is
    // the whole visual difference between a stopped guard and a stopped guard
    // that can still see you.
    if (this.downTimer > 0) {
      this.downTimer = Math.max(0, this.downTimer - dt);
      this.detection = 0;
      this.cone.clear();
      this.body.setPosition(this.x, this.y);
      this.bang.setVisible(false);
      return undefined;
    }

    let attacked: EnforcerAttackResult | undefined;
    if (ctx.alert.phase === "ALERT") {
      if (this.state !== "ALERT") this.clearPath();
      this.state = "ALERT";
      this.investigation = null;
      this.searchTargets = [];
      this.pendingNoise = null;
      attacked = this.pursue(dt, ctx);
    } else if (ctx.alert.phase === "EVASION") {
      this.pendingNoise = null;
      if (this.prevPhase !== "EVASION") this.beginSearch(ctx);
      this.state = "SEARCHING";
      this.search(dt, ctx);
    } else {
      // INFILTRATION: a search that just wrapped up leaves the guard sharper
      // for a while rather than snapping straight back to a plain patrol.
      if (this.prevPhase === "EVASION") this.enterCautious(ctx);
      this.updateInfiltration(dt, ctx);
    }
    this.prevPhase = ctx.alert.phase;

    this.updateDetection(dt, ctx);
    this.drawCone(grid, tileSize);

    // The body faces where it is *going*, the cone faces where it is looking.
    // Driving the sprite off `facing` would flip it between neighbouring
    // 8-direction frames every time the cone swept past a 45° boundary, which
    // reads as the whole chassis twitching rather than the arms panning.
    const dir = nearestDirection(this.isMoving() ? this.moveDir : this.facing);
    if (dir !== this.dir) {
      this.dir = dir;
      this.body.play(this.skin.animKey(dir), true);
    }
    // Sweep the scanner faster while actively pursuing or searching.
    this.body.anims.timeScale = ctx.alert.isCombatAware ? 1.8 : 1;
    let tint = 0xffffff;
    if (ctx.alert.phase === "ALERT") tint = 0xff9a9a;
    else if (this.state === "SUSPICIOUS") tint = 0xffd27a;
    else if (this.state === "CAUTIOUS") tint = 0xfff2a8;
    this.body.setTint(tint);
    this.body.setPosition(this.x, this.y);
    this.barkOnStateChange(dt);
    this.speechTimer = Math.max(0, this.speechTimer - dt);
    if (this.speechTimer === 0) this.speech.setVisible(false);
    this.speech.setPosition(this.x, this.y - tileSize * 1.35);
    this.bang.setPosition(this.x, this.y - tileSize);
    this.bang.setVisible(this.detection > 0.66 || ctx.alert.phase === "ALERT" || this.state === "SUSPICIOUS");
    return attacked;
  }

  /** PATROL/CAUTIOUS/SUSPICIOUS handling while the base is calm. */
  private updateInfiltration(dt: number, ctx: EnforcerContext): void {
    if (this.state === "SUSPICIOUS" && this.investigation) {
      this.continueInvestigation(dt, ctx);
      return;
    }

    // A queued noise ping starts a fresh investigation (dropped if already busy).
    if (this.pendingNoise) {
      const noise = this.pendingNoise;
      this.pendingNoise = null;
      this.startInvestigation(
        noise.x,
        noise.y,
        Math.floor(noise.x / ctx.tileSize),
        Math.floor(noise.y / ctx.tileSize),
        ctx,
      );
      return;
    }

    // Scan the cone for anomalies while calm enough to notice them.
    if (this.scanAnomalies(ctx)) return;

    // Sector caution: wandering into an area a guard recently searched keeps
    // them alert, even without a fresh trigger of their own.
    const gx = Math.floor(this.x / ctx.tileSize);
    const gy = Math.floor(this.y / ctx.tileSize);
    if (this.state !== "CAUTIOUS" && ctx.alert.isCautious(gx, gy)) {
      this.state = "CAUTIOUS";
      this.cautiousTimer = CAUTIOUS_DURATION;
    }

    if (this.state === "CAUTIOUS") {
      this.cautiousTimer -= dt;
      if (this.cautiousTimer <= 0 && !ctx.alert.isCautious(gx, gy)) {
        this.state = "PATROL";
      }
    } else {
      this.state = "PATROL";
    }

    this.patrol(dt, ctx, this.state === "CAUTIOUS");
  }

  /** Starts investigating a noise/anomaly origin: pivot if it's in clear LOS, otherwise walk over. */
  private startInvestigation(
    px: number,
    py: number,
    tx: number,
    ty: number,
    ctx: EnforcerContext,
    anomalyKey?: string,
  ): void {
    const pivotOnly = ctx.grid.hasLineOfSight(
      this.x / ctx.tileSize,
      this.y / ctx.tileSize,
      px / ctx.tileSize,
      py / ctx.tileSize,
    );
    this.investigation = { tx, ty, px, py, pivotOnly, anomalyKey };
    this.inspectTimer = 0;
    this.state = "SUSPICIOUS";
  }

  /** Pivots or walks to the current investigation target, then pauses to inspect it. */
  private continueInvestigation(dt: number, ctx: EnforcerContext): void {
    const inv = this.investigation!;

    if (inv.pivotOnly) {
      // Already in clear sight of it — turn and look, no walking.
      const ang = Math.atan2(inv.py - this.y, inv.px - this.x);
      this.scanOffset = 0;
      this.facing = turnToward(this.facing, ang, Phaser.Math.DegToRad(this.stats.turnRate) * dt * 2);
      this.moveDir = this.facing;
      if (Math.abs(angleDiff(this.facing, ang)) < FACING_EPSILON) this.inspectTimer += dt;
    } else {
      // Walk over and inspect. An unreachable origin counts as inspected from
      // where the guard stands rather than a permanent errand — previously a
      // guard whose route to the noise was blocked neither moved nor timed out,
      // and stayed SUSPICIOUS forever.
      const result = this.followPath(dt, ctx, { x: inv.tx, y: inv.ty }, this.stats.patrolSpeed);
      if (result !== "moving") this.inspectTimer += dt;
    }

    if (this.inspectTimer >= INSPECT_DURATION) {
      if (inv.anomalyKey) this.investigatedAnomalies.add(inv.anomalyKey);
      this.investigation = null;
      this.inspectTimer = 0;
      this.enterCautious(ctx);
    }
  }

  /**
   * Scans the vision cone for environmental anomalies while PATROL/CAUTIOUS.
   * A person on the floor, stapled to a wall or standing with their hands up
   * instantly escalates to a base-wide sighting; an opened door/chest or an EMP'd
   * device starts a walk-over investigation.
   * Returns true once something claims the guard's attention this frame.
   */
  private scanAnomalies(ctx: EnforcerContext): boolean {
    if (!ctx.anomalies) return false;
    for (const a of ctx.anomalies) {
      if (isPersonAnomaly(a.kind)) {
        if (this.canSeeAnomaly(a, ctx)) {
          this.detection = 1;
          ctx.alert.reportSighting(a.tx, a.ty);
          return true;
        }
        continue;
      }
      if (this.investigatedAnomalies.has(a.key)) continue;
      if (this.canSeeAnomaly(a, ctx)) {
        this.startInvestigation(a.x, a.y, a.tx, a.ty, ctx, a.key);
        return true;
      }
    }
    return false;
  }

  /** Range + cone-angle + LOS check against a static anomaly point (no concealment/thermal). */
  private canSeeAnomaly(a: GuardAnomaly, ctx: EnforcerContext): boolean {
    const dx = a.x - this.x;
    const dy = a.y - this.y;
    const dist = len(dx, dy);
    if (dist > this.stats.sightRange * ctx.tileSize) return false;
    const angTo = Math.atan2(dy, dx);
    const half = Phaser.Math.DegToRad(this.stats.sightAngle) / 2;
    if (Math.abs(angleDiff(this.facing, angTo)) > half) return false;
    return ctx.grid.hasLineOfSight(this.x / ctx.tileSize, this.y / ctx.tileSize, a.x / ctx.tileSize, a.y / ctx.tileSize);
  }

  /** Marks the guard sharper for a while — used after a search or an empty investigation. */
  private enterCautious(ctx: EnforcerContext): void {
    this.state = "CAUTIOUS";
    this.cautiousTimer = CAUTIOUS_DURATION;
    this.investigation = null;
    this.inspectTimer = 0;
    ctx.alert.noteSectorCaution(Math.floor(this.x / ctx.tileSize), Math.floor(this.y / ctx.tileSize));
  }

  /** Builds an ordered list of search points once, when a pursuit breaks into EVASION. */
  private beginSearch(ctx: EnforcerContext): void {
    this.investigation = null;
    this.searchTargets = this.buildSearchTargets(ctx);
    this.searchIndex = 0;
    this.searchPause = 0;
    this.rejoiningRoute = false;
    this.clearPath();
  }

  private buildSearchTargets(ctx: EnforcerContext): { x: number; y: number }[] {
    const lkp = ctx.alert.lastKnownTile;
    if (!lkp) return [];
    const { tileSize } = ctx;
    const lkpPx = { x: (lkp.x + 0.5) * tileSize, y: (lkp.y + 0.5) * tileSize };
    const vx = ctx.playerVelocity?.x ?? 0;
    const vy = ctx.playerVelocity?.y ?? 0;
    const vlen = len(vx, vy);
    const targets: { x: number; y: number }[] = [];

    // 1. A point predicted along the player's last-known movement vector.
    if (vlen > 1) {
      const predictTiles = 3;
      targets.push({
        x: lkpPx.x + (vx / vlen) * predictTiles * tileSize,
        y: lkpPx.y + (vy / vlen) * predictTiles * tileSize,
      });
    }

    // 2. Nearby cover tiles, prioritizing alignment with that movement vector.
    if (ctx.coverTilesNear) {
      const cover = ctx.coverTilesNear(lkp.x, lkp.y, SEARCH_RADIUS_TILES);
      cover.sort((a, b) => {
        const da = len(a.x - lkpPx.x, a.y - lkpPx.y) || 1;
        const db = len(b.x - lkpPx.x, b.y - lkpPx.y) || 1;
        if (vlen > 1) {
          const alignA = ((a.x - lkpPx.x) * vx + (a.y - lkpPx.y) * vy) / (da * vlen);
          const alignB = ((b.x - lkpPx.x) * vx + (b.y - lkpPx.y) * vy) / (db * vlen);
          if (Math.abs(alignA - alignB) > 0.05) return alignB - alignA;
        }
        return da - db;
      });
      targets.push(...cover.slice(0, MAX_SEARCH_COVER_POINTS));
    }

    // 3. Open doorways adjacent to the last known position.
    if (ctx.anomalies) {
      for (const a of ctx.anomalies) {
        if (a.kind === "door" && withinOrEqual(a.tx - lkp.x, a.ty - lkp.y, SEARCH_RADIUS_TILES)) {
          targets.push({ x: a.x, y: a.y });
        }
      }
    }

    targets.push(lkpPx); // always finish by checking the last known spot itself
    return targets;
  }

  /**
   * Walks the smart search-point list, pathing to each in turn and pausing to
   * look around. Once the list is exhausted the guard rejoins its patrol route
   * rather than wandering off from wherever the search happened to end.
   *
   * A point A* can't reach is dropped immediately instead of being walked at:
   * the search list is built from cover tiles and doorway positions near the
   * last sighting, so some of it is legitimately behind a wall.
   */
  private search(dt: number, ctx: EnforcerContext): void {
    if (this.searchTargets.length === 0) {
      this.returnToRoute(dt, ctx);
      return;
    }

    const target = this.searchTargets[this.searchIndex];
    const goal = {
      x: Math.floor(target.x / ctx.tileSize),
      y: Math.floor(target.y / ctx.tileSize),
    };
    const result = this.followPath(dt, ctx, goal, this.stats.purgeSpeed * 0.75);

    if (result === "moving") return;
    if (result === "unreachable") {
      this.advanceSearchPoint();
      return;
    }

    // Arrived: hold and sweep the cone across the spot before moving on.
    this.sweepCone(dt, CAUTIOUS_TURN_MULTIPLIER);
    this.searchPause += dt;
    if (this.searchPause >= SEARCH_POINT_PAUSE) this.advanceSearchPoint();
  }

  private advanceSearchPoint(): void {
    this.searchPause = 0;
    this.searchIndex++;
    this.clearPath();
    if (this.searchIndex >= this.searchTargets.length) this.searchTargets = [];
  }

  /**
   * Walks back to the nearest waypoint on the patrol route and picks the beat up
   * from there. Used when a search runs out of places to look, so guards
   * converge back onto their routes instead of leaving the level unwatched
   * wherever they happened to stop.
   */
  private returnToRoute(dt: number, ctx: EnforcerContext): void {
    if (this.route.length === 0) {
      this.sweepCone(dt, CAUTIOUS_TURN_MULTIPLIER);
      return;
    }
    if (!this.rejoiningRoute) {
      this.rejoiningRoute = true;
      this.routeIndex = this.nearestRouteIndex(ctx);
      this.clearPath();
    }
    this.patrol(dt, ctx, true);
  }

  /** Index of the route waypoint closest to the guard, in tiles. */
  private nearestRouteIndex(ctx: EnforcerContext): number {
    const tx = this.x / ctx.tileSize;
    const ty = this.y / ctx.tileSize;
    let best = 0;
    let bestDist = Infinity;
    this.route.forEach((wp, i) => {
      const d = len(wp.x + 0.5 - tx, wp.y + 0.5 - ty);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  /**
   * Walks the patrol route: path to the next waypoint, advance on arrival, wrap
   * at the end. The cone sweeps back and forth around the direction of travel
   * meanwhile — faster while CAUTIOUS.
   *
   * A guard with no route (a level whose guard board the author left empty, or
   * a single-waypoint post) holds its ground and just sweeps, which is a more
   * honest reading of "one waypoint" than wandering off it.
   */
  private patrol(dt: number, ctx: EnforcerContext, cautious: boolean = false): void {
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = Phaser.Math.FloatBetween(1.5, 3.5);
      this.turnDir = -this.turnDir;
    }
    const turnMult = cautious ? CAUTIOUS_TURN_MULTIPLIER : 1;
    this.sweepCone(dt, turnMult);

    if (this.route.length < 2) {
      this.clearPath();
      return;
    }

    const goal = this.route[this.routeIndex];
    switch (this.followPath(dt, ctx, goal, this.stats.patrolSpeed)) {
      case "arrived":
        this.routeIndex = (this.routeIndex + 1) % this.route.length;
        this.rejoiningRoute = false;
        this.clearPath();
        break;
      case "unreachable":
        // A door locked shut across the beat, or the guard was displaced into a
        // pocket. Skip ahead rather than grinding at the wall; the loop brings
        // the waypoint back round once the way reopens.
        this.routeIndex = (this.routeIndex + 1) % this.route.length;
        this.clearPath();
        break;
    }
  }

  /**
   * Chases the player: steers straight at them while there's a sightline, and
   * paths to the last known tile the moment it breaks.
   *
   * Straight-lining a *visible* target is the right behaviour — it keeps the
   * chase tight and reactive — but straight-lining a remembered one is what used
   * to wedge guards against the corner they lost you behind.
   *
   * **Closing is the default; firing is the exception.** Every guard used to draw
   * and shoot the instant the base woke up, which made the answer to a patrol a
   * question of cover rather than of distance. Now a guard walks Rowan down and
   * strikes at contact reach, and the only way to be shot at is to stand in front
   * of one of the facility's very few armed posts long enough for it to be given
   * permission ({@link ../systems/Firearms.FirearmsAuthorization}).
   *
   * That flips what the player is being asked to do. `purgeSpeed` is deliberately
   * under a walk (see {@link ../systems/EntityStats.ENFORCER_DEFAULTS}), so against
   * a melee guard *walking away denies the attack outright* — the chase became a
   * problem you solve with your legs instead of a wall.
   */
  private pursue(dt: number, ctx: EnforcerContext): EnforcerAttackResult | undefined {
    const { tileSize, alert } = ctx;
    this.scanOffset = 0;
    this.fireCooldownLeft = Math.max(0, this.fireCooldownLeft - dt);
    this.meleeCooldownLeft = Math.max(0, this.meleeCooldownLeft - dt);

    if (this.sense(ctx)) {
      this.clearPath();
      const ang = Math.atan2(ctx.player.y - this.y, ctx.player.x - this.x);
      this.faceToward(ang, dt);
      const distPx = len(ctx.player.x - this.x, ctx.player.y - this.y);

      // Checked before the strike, and deliberately **without consulting pathing**.
      // That is what covers the case melee cannot: a guard with a clean sightline and
      // nothing walkable between him and Rowan — across a stairwell gap, or through
      // the map's glass, which blocks movement but not sight (see DESIGN_NOTES,
      // "Glazing"). Closing is not an option there, so an armed post that has been
      // released to fire is the only thing that can act at all. Every other guard in
      // that spot holds its cone, which is the correct outcome rather than a gap:
      // being unreachable *should* be safe from all but the facility's rarest bodies.
      if (this.canFire(ctx) && distPx <= this.stats.fireRange * tileSize && this.fireCooldownLeft <= 0) {
        this.fireCooldownLeft = this.stats.fireCooldown;
        // Holds position to fire rather than closing distance this frame — reads as
        // the guard planting and aiming rather than a bullet fired mid-stride.
        return this.attack("shot", ctx, this.stats.fireDamage);
      }

      const inReach = distPx <= this.stats.meleeRange * tileSize;
      if (inReach && this.meleeCooldownLeft <= 0) {
        this.meleeCooldownLeft = this.stats.meleeCooldown;
        return this.attack("melee", ctx, this.stats.meleeDamage);
      }

      // **Whether a guard keeps walking once he is in reach is the difference between
      // the two bodies**, and it is the mechanical half of "the humans hurt you, the
      // silicates take you in".
      //
      // A man plants at his own reach and works from there. He has no seizure to follow
      // the strike with, so closing further would only have him shoving through Rowan —
      // `moveCirclePx` collides with the grid, not with the cast.
      //
      // A sentry keeps coming, because for it the strike is the *setup*: its reach
      // (1.6) is deliberately outside `PLAYER_DEFAULTS.captureRadius` (1.3), so the
      // prod lands on the way in and the stagger it leaves is what makes the last third
      // of a tile hard to give back. A silicate that planted at 1.6 would never reach
      // the radius it exists to reach, and the capture would be unreachable in a chase.
      if (inReach && !this.isSilicate) return undefined;

      this.step(ctx, ang, this.stats.purgeSpeed * tileSize * dt);
      return undefined;
    }

    const target = alert.lastKnownTile;
    if (!target) return undefined;
    if (this.followPath(dt, ctx, target, this.stats.purgeSpeed) === "unreachable") {
      // Nothing walkable leads there. Hold position and sweep rather than
      // charging the wall in between.
      this.sweepCone(dt, CAUTIOUS_TURN_MULTIPLIER);
    }
    return undefined;
  }

  /**
   * Whether this guard may put a shot downrange right now.
   *
   * **Both gates, every frame.** A firearm needs a guard issued one *and* a facility
   * that has released them; either alone is silence. Re-read per frame rather than
   * latched on the guard, because the authorization is base-wide state that can
   * stand down underneath him mid-chase.
   */
  private canFire(ctx: EnforcerContext): boolean {
    return this.stats.armed && ctx.firearms.authorized;
  }

  /** Packs one attack for the scene to resolve. See {@link EnforcerAttackResult}. */
  private attack(
    kind: EnforcerAttackResult["kind"],
    ctx: EnforcerContext,
    damage: number,
  ): EnforcerAttackResult {
    return {
      kind,
      originX: this.x,
      originY: this.y,
      targetX: ctx.player.x,
      targetY: ctx.player.y,
      damage,
    };
  }

  // --- Path following ------------------------------------------------------

  /**
   * Advances one step along a path to `goal` (a tile), planning or re-planning
   * as needed.
   *
   * Re-plans when the goal tile changes, when the grid's `revision` moves (a
   * door opened or closed on the route), when the periodic refresh comes due, or
   * when the body has been fully blocked for {@link STUCK_STEPS_BEFORE_REPATH}
   * frames — that last one is the catch-all for a path invalidated by something
   * the revision counter doesn't see, such as being shoved by the boss.
   */
  private followPath(
    dt: number,
    ctx: EnforcerContext,
    goal: { x: number; y: number },
    speedTiles: number,
  ): FollowResult {
    const { grid, tileSize } = ctx;
    this.repathTimer -= dt;

    const goalMoved =
      !this.pathGoal || this.pathGoal.x !== goal.x || this.pathGoal.y !== goal.y;
    const gridMoved = this.pathRevision !== grid.revision;
    const stale = this.path.length === 0 || this.repathTimer <= 0;

    if (goalMoved || gridMoved || stale) {
      if (!this.replan(ctx, goal)) return "unreachable";
    }

    const waypoint = this.path[this.pathIndex];
    if (!waypoint) return "arrived";

    const wx = (waypoint.x + 0.5) * tileSize;
    const wy = (waypoint.y + 0.5) * tileSize;
    const dist = len(wx - this.x, wy - this.y);
    if (dist <= tileSize * ARRIVE_DIST_FACTOR) {
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) {
        this.clearPath();
        return "arrived";
      }
      return "moving";
    }

    const ang = Math.atan2(wy - this.y, wx - this.x);
    this.faceToward(ang, dt);
    this.workDoors(ctx, ang);
    const moved = this.step(ctx, ang, speedTiles * tileSize * dt);
    if (moved) {
      this.stuckSteps = 0;
    } else if (++this.stuckSteps >= STUCK_STEPS_BEFORE_REPATH) {
      this.stuckSteps = 0;
      if (!this.replan(ctx, goal)) return "unreachable";
    }
    return "moving";
  }

  /** Runs A* to `goal` and installs the smoothed result. False if unreachable. */
  private replan(ctx: EnforcerContext, goal: { x: number; y: number }): boolean {
    const { grid, tileSize } = ctx;
    const start = { x: Math.floor(this.x / tileSize), y: Math.floor(this.y / tileSize) };
    const openable = ctx.isOperableDoor;
    const tiles = findPath(grid, start, goal, { radiusTiles: this.radiusTiles, openable });
    this.repathTimer = REPATH_INTERVAL;
    this.pathRevision = grid.revision;
    if (!tiles) {
      this.clearPath();
      this.pathGoal = { x: goal.x, y: goal.y };
      return false;
    }
    this.path = smoothPath(grid, tiles, this.radiusTiles, openable);
    this.pathGoal = { x: goal.x, y: goal.y };
    // Skip the tile the guard is already standing in, so it heads for the first
    // corner rather than doubling back to its own centre.
    this.pathIndex = this.path.length > 1 ? 1 : 0;
    return true;
  }

  private clearPath(): void {
    this.path = [];
    this.pathIndex = 0;
    this.pathGoal = null;
    this.stuckSteps = 0;
  }

  /**
   * Opens the door immediately ahead, and shuts the last one behind once clear
   * of it.
   *
   * Closing behind matters for more than tidiness: an open door is an *anomaly*
   * the guards investigate, so a patrol that left its own doors standing open
   * would spend the level investigating itself, and an open door would stop
   * meaning "the player came through here". Doing it silently is the same
   * reasoning — the noise ping exists to give away the player working a door,
   * not staff using one normally.
   */
  private workDoors(ctx: EnforcerContext, heading: number): void {
    workDoors(
      this,
      ctx,
      ctx.grid,
      ctx.tileSize,
      heading,
    );
  }

  /**
   * Moves the body `distPx` along `ang`, sliding along any wall it meets.
   * Returns false when both axes were refused (a true dead end).
   */
  private step(ctx: EnforcerContext, ang: number, distPx: number): boolean {
    const moved = moveCirclePx(
      ctx.grid,
      this.x,
      this.y,
      Math.cos(ang) * distPx,
      Math.sin(ang) * distPx,
      this.radiusTiles,
      ctx.tileSize,
    );
    const shifted = moved.x !== this.x || moved.y !== this.y;
    this.x = moved.x;
    this.y = moved.y;
    if (shifted) this.moveDir = ang;
    return shifted;
  }

  /** Turns the walk heading (and with it the cone) toward `ang`, capped by turn rate. */
  private faceToward(ang: number, dt: number): void {
    const step = Phaser.Math.DegToRad(this.stats.turnRate) * dt * 2;
    this.moveDir = turnToward(this.moveDir, ang, step);
    this.facing = this.moveDir + this.scanOffset;
  }

  /** Oscillates the vision cone either side of the direction of travel. */
  private sweepCone(dt: number, rateMultiplier: number): void {
    const rate = Phaser.Math.DegToRad(this.stats.turnRate) * 0.5 * rateMultiplier;
    this.scanOffset = Phaser.Math.Clamp(
      this.scanOffset + this.turnDir * rate * dt,
      -SCAN_SWEEP_ARC,
      SCAN_SWEEP_ARC,
    );
    if (Math.abs(this.scanOffset) >= SCAN_SWEEP_ARC) this.turnDir = -this.turnDir;
    this.facing = this.moveDir + this.scanOffset;
  }

  /** True when the guard is walking a path this frame (drives sprite direction). */
  private isMoving(): boolean {
    return this.path.length > 0 && this.pathIndex < this.path.length;
  }

  /**
   * Whether the guard senses the player *right now*, from where it currently
   * stands and looks.
   *
   * Deliberately re-asked rather than cached for the frame: {@link pursue} runs
   * before {@link updateDetection} and moves the guard in between, so a cached
   * answer would be one step stale exactly during a chase.
   */
  private sense(ctx: EnforcerContext): boolean {
    this.eye.x = this.x;
    this.eye.y = this.y;
    this.eye.facing = this.facing;
    return canSense(this.eye, ctx);
  }

  private updateDetection(dt: number, ctx: EnforcerContext): void {
    this.detection = accrueDetection(
      this.detection,
      this.sense(ctx),
      dt,
      this.stats.auditDelay,
      ctx,
      // A guard that has just finished a search is quicker to be sure of what
      // it is looking at.
      this.state === "CAUTIOUS" ? CAUTIOUS_DETECTION_MULTIPLIER : 1,
    );
  }

  /** Draws the wall-clipped vision cone as a fan of rays. */
  private drawCone(grid: CollisionGrid, tileSize: number): void {
    drawVisionCone(
      this.cone,
      grid,
      this.x,
      this.y,
      this.facing,
      this.stats.sightAngle,
      this.stats.sightRange,
      tileSize,
      this.detection,
      GUARD_CONE,
      RAY_COUNT,
    );
  }


  /** Collision radius in tiles — read by the debug overlay. */
  get collisionRadiusTiles(): number {
    return this.radiusTiles;
  }

  /** This guard's patrol waypoints, for the debug overlay. */
  get patrolRoute(): readonly PathNode[] {
    return this.route;
  }

  /** The remaining leg of the path being walked, for the debug overlay. */
  get plannedPath(): readonly PathNode[] {
    return this.path.slice(this.pathIndex);
  }

  /**
   * Reacts to a nearby noise (e.g. a door operating): the guard turns to look
   * toward the source and grows suspicious, but detection is capped below full
   * so sound alone never trips a hard ALERT — it still takes line of sight to
   * confirm. Also queues the origin for a LOS-aware investigation (pivot if
   * already in clear sight, walk over if obstructed) the next time this guard
   * is free to act on it. `intensity` is 0..1 (louder/closer = higher); `sx,sy`
   * are pixels.
   */
  hearNoise(intensity: number, sx: number, sy: number): void {
    this.detection = Math.min(0.9, this.detection + intensity * 0.4);
    this.facing = Math.atan2(sy - this.y, sx - this.x);
    this.pendingNoise = { x: sx, y: sy };
  }

  /** Registers a skin's patrol-scan animation for each direction once per scene. */
  private static ensureAnimations(scene: Phaser.Scene, skin: GuardSkin): void {
    for (const dir of DIRS_8) {
      const key = skin.animKey(dir);
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: Array.from({ length: skin.frameCount }, (_, i) => ({
          key: skin.frameKey(dir, i),
        })),
        frameRate: skin.frameRate,
        repeat: -1,
      });
    }
  }
}

/** Rotates `from` toward `to` by at most `maxStep` radians. */
function turnToward(from: number, to: number, maxStep: number): number {
  const d = angleDiff(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}
