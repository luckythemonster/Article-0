import Phaser from "phaser";
import type { ComponentData } from "../map/types";
import { CollisionGrid } from "../systems/CollisionGrid";
import { AlertState, type AlertPhase } from "../systems/AlertState";
import { enforcerStatsFor, type EnforcerStats } from "../systems/EntityStats";
import { GUARD_DIRS, nearestGuardDirection, type GuardDir, type GuardSkin } from "./GuardSkin";
import { ENFORCER_SKIN } from "./EnforcerAnimations";

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
  facing: number;
  state: GuardState = "PATROL";
  private x: number;
  private y: number;
  private scanTimer = 0;
  private turnDir = 1;
  private readonly skin: GuardSkin;

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

  constructor(
    scene: Phaser.Scene,
    tileX: number,
    tileY: number,
    tileSize: number,
    components: ComponentData[],
    skin: GuardSkin = ENFORCER_SKIN,
  ) {
    this.skin = skin;
    this.stats = enforcerStatsFor(components);
    this.x = (tileX + 0.5) * tileSize;
    this.y = (tileY + 0.5) * tileSize;
    this.facing = Phaser.Math.FloatBetween(0, Math.PI * 2);

    Enforcer.ensureAnimations(scene, skin);

    this.cone = scene.add.graphics().setDepth(400);
    this.body = scene.add.sprite(this.x, this.y, skin.frameKey("south", 0)).setDepth(450);
    this.body.setScale((tileSize * skin.displayTiles) / skin.sourceSize);
    this.body.play(skin.animKey("south"));
    this.bang = scene.add
      .text(this.x, this.y - tileSize, "!", {
        fontFamily: "monospace",
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

    const dir = nearestGuardDirection(this.facing);
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
      const ang = Math.atan2(inv.py - this.y, inv.px - this.x);
      this.facing = turnToward(this.facing, ang, Phaser.Math.DegToRad(this.stats.turnRate) * dt * 2);
      if (Math.abs(angleDiff(this.facing, ang)) < FACING_EPSILON) this.inspectTimer += dt;
    } else {
      const dist = Math.hypot(inv.px - this.x, inv.py - this.y);
      if (dist > ctx.tileSize * ARRIVE_DIST_FACTOR) {
        const ang = Math.atan2(inv.py - this.y, inv.px - this.x);
        this.facing = turnToward(this.facing, ang, Phaser.Math.DegToRad(this.stats.turnRate) * dt * 2);
        const speed = this.stats.patrolSpeed * ctx.tileSize;
        const nx = this.x + Math.cos(this.facing) * speed * dt;
        const ny = this.y + Math.sin(this.facing) * speed * dt;
        if (!ctx.grid.isBlocked(Math.floor(nx / ctx.tileSize), Math.floor(ny / ctx.tileSize))) {
          this.x = nx;
          this.y = ny;
        }
      } else {
        this.inspectTimer += dt;
      }
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

  /** Walks the smart search-point list; falls back to a cautious sweep once exhausted. */
  private search(dt: number, ctx: EnforcerContext): void {
    if (this.searchTargets.length === 0) {
      this.patrol(dt, ctx, true);
      return;
    }

    const target = this.searchTargets[this.searchIndex];
    const dist = Math.hypot(target.x - this.x, target.y - this.y);
    if (dist > ctx.tileSize * ARRIVE_DIST_FACTOR) {
      const ang = Math.atan2(target.y - this.y, target.x - this.x);
      this.facing = turnToward(this.facing, ang, Phaser.Math.DegToRad(this.stats.turnRate) * dt * 2);
      const speed = this.stats.purgeSpeed * ctx.tileSize * 0.75;
      const nx = this.x + Math.cos(this.facing) * speed * dt;
      const ny = this.y + Math.sin(this.facing) * speed * dt;
      if (!ctx.grid.isBlocked(Math.floor(nx / ctx.tileSize), Math.floor(ny / ctx.tileSize))) {
        this.x = nx;
        this.y = ny;
      } else {
        this.facing += Phaser.Math.FloatBetween(-1, 1);
      }
      return;
    }

    this.searchPause += dt;
    if (this.searchPause >= SEARCH_POINT_PAUSE) {
      this.searchPause = 0;
      this.searchIndex++;
      if (this.searchIndex >= this.searchTargets.length) this.searchTargets = [];
    }
  }

  private patrol(dt: number, ctx: EnforcerContext, cautious: boolean = false): void {
    const { grid, tileSize } = ctx;
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      // Occasional scan turn to sweep the cone around.
      this.scanTimer = Phaser.Math.FloatBetween(1.5, 3.5);
      this.turnDir = Math.random() < 0.5 ? -1 : 1;
    }

    const speed = this.stats.patrolSpeed * tileSize;
    const nx = this.x + Math.cos(this.facing) * speed * dt;
    const ny = this.y + Math.sin(this.facing) * speed * dt;
    const tx = Math.floor(nx / tileSize);
    const ty = Math.floor(ny / tileSize);

    if (grid.isBlocked(tx, ty)) {
      // Bounced off a wall: turn toward a random new heading.
      this.facing += Phaser.Math.FloatBetween(Math.PI * 0.5, Math.PI * 1.5);
    } else {
      this.x = nx;
      this.y = ny;
      // Gentle scan drift while walking — faster sweep while CAUTIOUS.
      const turnMult = cautious ? CAUTIOUS_TURN_MULTIPLIER : 1;
      this.facing += this.turnDir * Phaser.Math.DegToRad(this.stats.turnRate) * 0.15 * dt * turnMult;
    }
  }

  private pursue(dt: number, ctx: EnforcerContext): void {
    const { grid, tileSize, alert } = ctx;
    const target = alert.lastKnownTile!;
    const goalX = (target.x + 0.5) * tileSize;
    const goalY = (target.y + 0.5) * tileSize;
    const ang = Math.atan2(goalY - this.y, goalX - this.x);
    // Turn toward the goal, capped by turn rate.
    this.facing = turnToward(this.facing, ang, Phaser.Math.DegToRad(this.stats.turnRate) * dt * 2);

    const speed = this.stats.purgeSpeed * tileSize;
    const nx = this.x + Math.cos(this.facing) * speed * dt;
    const ny = this.y + Math.sin(this.facing) * speed * dt;
    if (!grid.isBlocked(Math.floor(nx / tileSize), Math.floor(ny / tileSize))) {
      this.x = nx;
      this.y = ny;
    } else {
      this.facing += Phaser.Math.FloatBetween(-1, 1);
    }
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
   */
  private canSee(ctx: EnforcerContext): boolean {
    const { player, tileSize, grid } = ctx;

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
      if (grid.isBlocked(tx, ty)) return d - step;
    }
    return maxDist;
  }

  get position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
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
