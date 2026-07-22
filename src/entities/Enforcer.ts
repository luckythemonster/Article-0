import Phaser from "phaser";
import type { ComponentData } from "../map/types";
import { CollisionGrid } from "../systems/CollisionGrid";
import { AlertState } from "../systems/AlertState";
import { enforcerStatsFor, type EnforcerStats } from "../systems/EntityStats";
import {
  ENFORCER_ANIM_DIRS,
  ENFORCER_PATROL_FRAME_COUNT,
  enforcerAnimKey,
  enforcerFrameKey,
  nearestDirectionFromAngle,
  type EnforcerAnimDir,
} from "./EnforcerAnimations";

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
  alert: AlertState;
}

const RAY_COUNT = 24;

/**
 * A patrolling guard ("enforcer") with a wall-clipped vision cone and a
 * per-guard detection meter.
 *
 * Patrol: paces forward, turning when it hits a wall and periodically doing a
 * scan turn. On global ALERT it converges on the last known player tile at
 * purge speed. Detection accumulates while the player is inside the cone with
 * clear line of sight, scaled by light and by whether the player is standing
 * still / sneaking. Reaching full detection reports a sighting to the alert FSM.
 */
export class Enforcer {
  readonly stats: EnforcerStats;
  detection = 0; // 0..1
  facing: number;
  private x: number;
  private y: number;
  private scanTimer = 0;
  private turnDir = 1;

  private readonly cone: Phaser.GameObjects.Graphics;
  private readonly body: Phaser.GameObjects.Sprite;
  private readonly bang: Phaser.GameObjects.Text;
  private dir: EnforcerAnimDir = "south";

  constructor(
    scene: Phaser.Scene,
    tileX: number,
    tileY: number,
    tileSize: number,
    components: ComponentData[],
  ) {
    this.stats = enforcerStatsFor(components);
    this.x = (tileX + 0.5) * tileSize;
    this.y = (tileY + 0.5) * tileSize;
    this.facing = Phaser.Math.FloatBetween(0, Math.PI * 2);

    Enforcer.ensureAnimations(scene);

    this.cone = scene.add.graphics().setDepth(400);
    this.body = scene.add.sprite(this.x, this.y, enforcerFrameKey("south", 0)).setDepth(450);
    // The 48x48 source art scaled to ~1.5 tiles tall, matching the player.
    this.body.setScale((tileSize * 1.5) / 48);
    this.body.play(enforcerAnimKey("south"));
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

    if (ctx.alert.isCombatAware && ctx.alert.lastKnownTile) {
      this.pursue(dt, ctx);
    } else {
      this.patrol(dt, ctx);
    }

    this.updateDetection(dt, ctx);
    this.drawCone(grid, tileSize);

    const dir = nearestDirectionFromAngle(this.facing);
    if (dir !== this.dir) {
      this.dir = dir;
      this.body.play(enforcerAnimKey(dir), true);
    }
    // Sweep the scanner faster while actively pursuing.
    this.body.anims.timeScale = ctx.alert.isCombatAware ? 1.8 : 1;
    this.body.setTint(ctx.alert.phase === "ALERT" ? 0xff9a9a : 0xffffff);
    this.body.setPosition(this.x, this.y);
    this.bang.setPosition(this.x, this.y - tileSize);
    this.bang.setVisible(this.detection > 0.66 || ctx.alert.phase === "ALERT");
  }

  private patrol(dt: number, ctx: EnforcerContext): void {
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
      // Gentle scan drift while walking.
      this.facing += this.turnDir * Phaser.Math.DegToRad(this.stats.turnRate) * 0.15 * dt;
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
      const rate = (1 / this.stats.auditDelay) * light;
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

  /** True when the player is inside the cone, within range, with clear LOS. */
  private canSee(ctx: EnforcerContext): boolean {
    // Crouched behind cover: hidden from vision entirely.
    if (ctx.playerConcealed) return false;

    const { player, tileSize, grid } = ctx;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    const rangePx = this.stats.sightRange * tileSize;
    if (dist > rangePx) return false;

    const angTo = Math.atan2(dy, dx);
    const half = Phaser.Math.DegToRad(this.stats.sightAngle) / 2;
    if (Math.abs(angleDiff(this.facing, angTo)) > half) return false;

    return grid.hasLineOfSight(
      this.x / tileSize,
      this.y / tileSize,
      player.x / tileSize,
      player.y / tileSize,
    );
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
   * confirm. `intensity` is 0..1 (louder/closer = higher); `sx,sy` are pixels.
   */
  hearNoise(intensity: number, sx: number, sy: number): void {
    this.detection = Math.min(0.9, this.detection + intensity * 0.4);
    this.facing = Math.atan2(sy - this.y, sx - this.x);
  }

  /** Registers the patrol-scan animation for each direction once per scene. */
  private static ensureAnimations(scene: Phaser.Scene): void {
    for (const dir of ENFORCER_ANIM_DIRS) {
      const key = enforcerAnimKey(dir);
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: Array.from({ length: ENFORCER_PATROL_FRAME_COUNT }, (_, i) => ({
          key: enforcerFrameKey(dir, i),
        })),
        frameRate: 8,
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
