import Phaser from "phaser";
import type { GameTile } from "../map/types";
import type { CollisionGrid } from "../systems/CollisionGrid";
import { sensorStatsFor, type SensorStats } from "../systems/EntityStats";
import type { EnforcerContext } from "./Enforcer";

const RAY_COUNT = 20;
/** Half-arc (degrees) the mounted camera pans its cone across. */
const SWEEP_ARC = 55;
/** Pan oscillation speed (radians of phase per second). */
const SWEEP_SPEED = 0.7;

/**
 * A fixed optical security camera — the `security` board's stationary answer to
 * a patrolling guard. It never moves: the cone sweeps back and forth around a
 * mounted facing (inferred from the surrounding walls, since the tiles carry no
 * facing data), clipped against walls like a guard's, and fills a per-camera
 * detection meter while the player is in view with clear line of sight. Reaching
 * full detection reports a sighting to the alert FSM exactly as a guard does.
 *
 * Shares the guard {@link EnforcerContext} so the scene drives it with the same
 * per-frame data, and reuses the same thermal short-range sense.
 */
export class Sensor {
  readonly stats: SensorStats;
  detection = 0; // 0..1
  facing: number;

  private readonly x: number;
  private readonly y: number;
  private readonly baseFacing: number;
  private sweepPhase = Phaser.Math.FloatBetween(0, Math.PI * 2);

  private readonly cone: Phaser.GameObjects.Graphics;
  private readonly housing: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, grid: CollisionGrid) {
    this.stats = sensorStatsFor(tile.components);
    this.x = (tile.x + 0.5) * tileSize + tile.offsetX;
    this.y = (tile.y + 0.5) * tileSize + tile.offsetY;
    this.baseFacing = inferFacing(grid, tile.x, tile.y);
    this.facing = this.baseFacing;

    this.cone = scene.add.graphics().setDepth(400);
    this.housing = scene.add.graphics().setDepth(455);
    this.drawHousing(tileSize);
  }

  update(dt: number, ctx: EnforcerContext): void {
    if (this.stats.state === "disabled") {
      this.cone.clear();
      return;
    }
    // Pan the cone back and forth around the mounted facing.
    this.sweepPhase += dt * SWEEP_SPEED;
    this.facing =
      this.baseFacing + Phaser.Math.DegToRad(SWEEP_ARC) * Math.sin(this.sweepPhase);

    this.updateDetection(dt, ctx);
    this.drawCone(ctx.grid, ctx.tileSize);
  }

  private updateDetection(dt: number, ctx: EnforcerContext): void {
    if (this.canSee(ctx)) {
      const light = ctx.lightMultiplierAt(ctx.player.x, ctx.player.y);
      const rate = (1 / this.stats.detectionDelay) * light;
      this.detection = Math.min(1, this.detection + rate * dt);
      if (this.detection >= 1) {
        this.detection = 1;
        ctx.alert.reportSighting(
          Math.floor(ctx.player.x / ctx.tileSize),
          Math.floor(ctx.player.y / ctx.tileSize),
        );
      }
    } else {
      this.detection = Math.max(0, this.detection - dt * 0.6);
    }
  }

  /** True when the player is in the cone (or thermal radius) with clear LOS. */
  private canSee(ctx: EnforcerContext): boolean {
    const { player, tileSize, grid } = ctx;

    // A live Chaff Pack EMP zone blinds any camera caught inside it outright.
    if (ctx.chaffZone) {
      const dz = Math.hypot(this.x - ctx.chaffZone.x, this.y - ctx.chaffZone.y);
      if (dz <= ctx.chaffZone.radiusPx) return false;
    }

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    const hasLos = (): boolean =>
      grid.hasLineOfSight(this.x / tileSize, this.y / tileSize, player.x / tileSize, player.y / tileSize);

    const thermalPx = ctx.thermalRadiusMultiplier(this.stats.thermalRadius) * tileSize;
    if (!ctx.playerThermalConcealed && thermalPx > 0 && dist <= thermalPx && hasLos()) return true;

    if (ctx.playerConcealed) return false;
    if (dist > this.stats.detectionRange * tileSize) return false;
    const angTo = Math.atan2(dy, dx);
    const half = Phaser.Math.DegToRad(this.stats.sightAngle) / 2;
    if (Math.abs(angleDiff(this.facing, angTo)) > half) return false;
    return hasLos();
  }

  /** Draws the wall-clipped vision cone as a fan of rays (cyan, red when hot). */
  private drawCone(grid: CollisionGrid, tileSize: number): void {
    const half = Phaser.Math.DegToRad(this.stats.sightAngle) / 2;
    const rangePx = this.stats.detectionRange * tileSize;
    const points: number[] = [this.x, this.y];
    for (let i = 0; i <= RAY_COUNT; i++) {
      const a = this.facing - half + (2 * half * i) / RAY_COUNT;
      const hit = this.castRay(grid, tileSize, a, rangePx);
      points.push(this.x + Math.cos(a) * hit, this.y + Math.sin(a) * hit);
    }

    const alerted = this.detection > 0.66;
    this.cone.clear();
    this.cone.fillStyle(alerted ? 0xff3b3b : 0x4fd8ff, alerted ? 0.28 : 0.14);
    this.cone.beginPath();
    this.cone.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) this.cone.lineTo(points[i], points[i + 1]);
    this.cone.closePath();
    this.cone.fillPath();
  }

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

  /** A small fixed camera housing with a lens pointing along the mounted facing. */
  private drawHousing(tileSize: number): void {
    const r = tileSize * 0.28;
    const g = this.housing;
    g.fillStyle(0x1a2330, 1);
    g.fillCircle(this.x, this.y, r);
    g.lineStyle(2, 0x4fd8ff, 0.9);
    g.strokeCircle(this.x, this.y, r);
    // Lens nub in the mounted direction.
    g.fillStyle(0x9fe9ff, 1);
    g.fillCircle(this.x + Math.cos(this.baseFacing) * r, this.y + Math.sin(this.baseFacing) * r, r * 0.4);
  }

  get position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }
}

/** Faces the camera toward the most open side (sum of clear-neighbour vectors). */
function inferFacing(grid: CollisionGrid, tx: number, ty: number): number {
  let vx = 0;
  let vy = 0;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    if (!grid.isBlocked(tx + dx, ty + dy)) {
      vx += dx;
      vy += dy;
    }
  }
  if (vx === 0 && vy === 0) return Math.PI / 2; // walled in: default to south
  return Math.atan2(vy, vx);
}

/** Smallest signed angle from a to b, in (-pi, pi]. */
function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
