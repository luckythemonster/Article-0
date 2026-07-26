import Phaser from "phaser";
import type { ComponentData } from "../map/types";
import { CollisionGrid } from "../systems/CollisionGrid";
import { AlertState, type AlertPhase } from "../systems/AlertState";
import { enforcerStatsFor, type EnforcerStats } from "../systems/EntityStats";
import { moveCirclePx } from "../systems/GridMotion";
import { findPath, smoothPath, type PathNode } from "../systems/Pathfinder";
import type { PatrolRoute } from "../systems/PatrolRoute";
import { GUARD_DIRS, nearestGuardDirection, type GuardDir, type GuardSkin } from "./GuardSkin";
import { ENFORCER_SKIN } from "./EnforcerAnimations";
import { FONT_MONO } from "../ui/fonts";

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

/** An environmental anomaly a guard's vision cone can notice. */
export interface GuardAnomaly {
  /** Pixel-space position, for cone/LOS checks. */
  x: number;
  y: number;
  /** Tile-space position, for search/anomaly bookkeeping. */
  tx: number;
  ty: number;
  kind: "door" | "chest" | "device" | "stunnedOrderly";
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
  /** Non-null while a Chaff Pack's EMP zone is live; guards inside it can't see. */
  chaffZone: { x: number; y: number; radiusPx: number } | null;
  /** Scales a guard's thermalRadius stat (in tiles) — 0 while Thermal Gel is active. */
  thermalRadiusMultiplier: (baseTiles: number) => number;
  alert: AlertState;
  /** Opened doors/chests, EMP'd devices, and stunned orderlies visible this frame. */
  anomalies?: GuardAnomaly[];
  /** Player's current velocity (px/s), for smart search-point prediction. */
  playerVelocity?: { x: number; y: number };
  /** Cover tiles (pixel centres) within `radiusTiles` of a tile position. */
  coverTilesNear?: (tileX: number, tileY: number, radiusTiles: number) => { x: number; y: number }[];
  /**
   * True when this tile holds a door the guard may work itself — unlocked, and
   * not a wall. Guards route through their own facility's doors rather than
   * treating every one as permanent geometry: `main1`'s patrol beat crosses two
   * of them, and without this the south half of the route is simply unreachable.
   */
  isGuardDoor?: (tileX: number, tileY: number) => boolean;
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
/** How far ahead of its own body a guard reaches to work a door, in tiles. */
const DOOR_REACH_TILES = 0.9;
/** Distance past a door at which the guard shuts it behind itself, in tiles. */
const DOOR_CLOSE_TILES = 1.8;
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
  private x: number;
  private y: number;
  /** Heading the body is travelling along; drives which sprite direction plays. */
  private moveDir: number;
  private scanTimer = 0;
  private turnDir = 1;
  /** Current cone offset from {@link moveDir}, swept back and forth on patrol. */
  private scanOffset = 0;
  private readonly skin: GuardSkin;
  private readonly radiusTiles: number;

  private readonly cone: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Sprite;
  private readonly bang: Phaser.GameObjects.Text;
  private dir: GuardDir = "south";

  private prevPhase: AlertPhase = "INFILTRATION";
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
  private heldDoor: PathNode | null = null;

  constructor(
    scene: Phaser.Scene,
    tileX: number,
    tileY: number,
    tileSize: number,
    components: ComponentData[],
    skin: GuardSkin = ENFORCER_SKIN,
    route: PatrolRoute = [],
  ) {
    this.skin = skin;
    this.radiusTiles = skin.collisionRadiusTiles;
    this.stats = enforcerStatsFor(components);
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

    this.cone = scene.add.graphics().setDepth(400);
    this.body = scene.add.sprite(this.x, this.y, skin.frameKey("south", 0)).setDepth(450);
    this.body.setScale((tileSize * skin.displayTiles) / skin.sourceSize);
    this.body.play(skin.animKey("south"));
    this.bang = scene.add
      .text(this.x, this.y - tileSize, "!", {
        fontFamily: FONT_MONO,
        fontSize: `${Math.floor(tileSize * 0.9)}px`,
        color: "#ffec3d",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(600)
      .setVisible(false);
  }

  update(dt: number, ctx: EnforcerContext): void {
    const { tileSize, grid } = ctx;

    if (ctx.alert.phase === "ALERT") {
      if (this.state !== "ALERT") this.clearPath();
      this.state = "ALERT";
      this.investigation = null;
      this.searchTargets = [];
      this.pendingNoise = null;
      this.pursue(dt, ctx);
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
    const dir = nearestGuardDirection(this.isMoving() ? this.moveDir : this.facing);
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
    this.bang.setPosition(this.x, this.y - tileSize);
    this.bang.setVisible(this.detection > 0.66 || ctx.alert.phase === "ALERT" || this.state === "SUSPICIOUS");
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
   * A stunned orderly instantly escalates to a base-wide sighting; an opened
   * door/chest or an EMP'd device starts a walk-over investigation. Returns
   * true once something claims the guard's attention this frame.
   */
  private scanAnomalies(ctx: EnforcerContext): boolean {
    if (!ctx.anomalies) return false;
    for (const a of ctx.anomalies) {
      if (a.kind === "stunnedOrderly") {
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
    const dist = Math.hypot(dx, dy);
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
    const vlen = Math.hypot(vx, vy);
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
        const da = Math.hypot(a.x - lkpPx.x, a.y - lkpPx.y) || 1;
        const db = Math.hypot(b.x - lkpPx.x, b.y - lkpPx.y) || 1;
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
        if (a.kind === "door" && Math.hypot(a.tx - lkp.x, a.ty - lkp.y) <= SEARCH_RADIUS_TILES) {
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
      const d = Math.hypot(wp.x + 0.5 - tx, wp.y + 0.5 - ty);
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
   */
  private pursue(dt: number, ctx: EnforcerContext): void {
    const { tileSize, alert } = ctx;
    this.scanOffset = 0;

    if (this.canSee(ctx)) {
      this.clearPath();
      const ang = Math.atan2(ctx.player.y - this.y, ctx.player.x - this.x);
      this.faceToward(ang, dt);
      this.step(ctx, ang, this.stats.purgeSpeed * tileSize * dt);
      return;
    }

    const target = alert.lastKnownTile;
    if (!target) return;
    if (this.followPath(dt, ctx, target, this.stats.purgeSpeed) === "unreachable") {
      // Nothing walkable leads there. Hold position and sweep rather than
      // charging the wall in between.
      this.sweepCone(dt, CAUTIOUS_TURN_MULTIPLIER);
    }
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
    const dist = Math.hypot(wx - this.x, wy - this.y);
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
    const openable = ctx.isGuardDoor;
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
    const { tileSize, grid } = ctx;
    if (!ctx.isGuardDoor || !ctx.setDoorOpen) return;

    if (this.heldDoor) {
      const dx = this.heldDoor.x + 0.5 - this.x / tileSize;
      const dy = this.heldDoor.y + 0.5 - this.y / tileSize;
      if (Math.hypot(dx, dy) > DOOR_CLOSE_TILES) {
        ctx.setDoorOpen(this.heldDoor.x, this.heldDoor.y, false);
        this.heldDoor = null;
      }
      return;
    }

    // Probe just past the body's own edge, along the way it's walking.
    const reach = this.radiusTiles + DOOR_REACH_TILES;
    const tx = Math.floor(this.x / tileSize + Math.cos(heading) * reach);
    const ty = Math.floor(this.y / tileSize + Math.sin(heading) * reach);
    if (!grid.isBlocked(tx, ty) || !ctx.isGuardDoor(tx, ty)) return;
    ctx.setDoorOpen(tx, ty, true);
    this.heldDoor = { x: tx, y: ty };
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

  private updateDetection(dt: number, ctx: EnforcerContext): void {
    const seen = this.canSee(ctx);
    if (seen) {
      const light = ctx.lightMultiplierAt(ctx.player.x, ctx.player.y);
      const cautiousBoost = this.state === "CAUTIOUS" ? CAUTIOUS_DETECTION_MULTIPLIER : 1;
      const rate = (1 / this.stats.auditDelay) * light * cautiousBoost;
      this.detection = Math.min(1, this.detection + rate * dt);
      if (this.detection >= 1) {
        this.detection = 1;
        ctx.alert.reportSighting(
          Math.floor(ctx.player.x / ctx.tileSize),
          Math.floor(ctx.player.y / ctx.tileSize),
        );
      }
    } else {
      // Decay when the player is out of sight.
      this.detection = Math.max(0, this.detection - dt * 0.6);
    }
  }

  /**
   * True when the guard senses the player this frame, by either of two paths:
   *  - **thermal** — a short 360° heat sense within {@link EnforcerStats.thermalRadius},
   *    ignoring the cone angle, as long as the player isn't hidden in heat-blocking
   *    cover and there's clear line of sight;
   *  - **cone** — inside the vision cone, within {@link EnforcerStats.sightRange},
   *    with clear LOS, and not crouched behind cover.
   *
   * Compliance short-circuits both, at any range. That is the point of it: the guard
   * looks straight at Rowan, reads him as staff going about his business, and returns
   * to the sweep. Distance is not the limiter — conduct is.
   */
  private canSee(ctx: EnforcerContext): boolean {
    const { player, tileSize, grid } = ctx;

    if (ctx.playerCompliant) return false;

    // A live Chaff Pack EMP zone blinds any guard caught inside it outright.
    if (ctx.chaffZone) {
      const dz = Math.hypot(this.x - ctx.chaffZone.x, this.y - ctx.chaffZone.y);
      if (dz <= ctx.chaffZone.radiusPx) return false;
    }

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    const hasLos = (): boolean =>
      grid.hasLineOfSight(
        this.x / tileSize,
        this.y / tileSize,
        player.x / tileSize,
        player.y / tileSize,
      );

    // Thermal: close-range body heat betrays the player even outside the cone.
    const thermalPx = ctx.thermalRadiusMultiplier(this.stats.thermalRadius) * tileSize;
    if (!ctx.playerThermalConcealed && thermalPx > 0 && dist <= thermalPx && hasLos()) return true;

    // Cone: crouched behind cover hides the player from the visible cone.
    if (ctx.playerConcealed) return false;
    if (dist > this.stats.sightRange * tileSize) return false;
    const angTo = Math.atan2(dy, dx);
    const half = Phaser.Math.DegToRad(this.stats.sightAngle) / 2;
    if (Math.abs(angleDiff(this.facing, angTo)) > half) return false;
    return hasLos();
  }

  /** Draws the wall-clipped vision cone as a fan of rays. */
  private drawCone(grid: CollisionGrid, tileSize: number): void {
    const half = Phaser.Math.DegToRad(this.stats.sightAngle) / 2;
    const rangePx = this.stats.sightRange * tileSize;
    const points: number[] = [this.x, this.y];
    for (let i = 0; i <= RAY_COUNT; i++) {
      const a = this.facing - half + (2 * half * i) / RAY_COUNT;
      const hit = this.castRay(grid, tileSize, a, rangePx);
      points.push(this.x + Math.cos(a) * hit, this.y + Math.sin(a) * hit);
    }

    const alerted = this.detection > 0.66;
    this.cone.clear();
    this.cone.fillStyle(alerted ? 0xff3b3b : 0xffe14d, alerted ? 0.28 : 0.14);
    this.cone.beginPath();
    this.cone.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) this.cone.lineTo(points[i], points[i + 1]);
    this.cone.closePath();
    this.cone.fillPath();
  }

  /** Returns the distance a ray travels before hitting a wall (or maxDist). */
  private castRay(grid: CollisionGrid, tileSize: number, angle: number, maxDist: number): number {
    const step = tileSize * 0.25;
    const cx = Math.cos(angle);
    const cy = Math.sin(angle);
    for (let d = step; d <= maxDist; d += step) {
      const tx = Math.floor((this.x + cx * d) / tileSize);
      const ty = Math.floor((this.y + cy * d) / tileSize);
      if (grid.blocksSight(tx, ty)) return d - step;
    }
    return maxDist;
  }

  get position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
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
    for (const dir of GUARD_DIRS) {
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

/** Smallest signed angle from a to b, in (-pi, pi]. */
function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Rotates `from` toward `to` by at most `maxStep` radians. */
function turnToward(from: number, to: number, maxStep: number): number {
  const d = angleDiff(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}
