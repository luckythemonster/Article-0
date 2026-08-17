import Phaser from "phaser";
import type { GameTile } from "../map/types";
import type { CollisionGrid } from "../systems/CollisionGrid";
import { paced, sensorStatsFor, type SensorStats } from "../systems/EntityStats";
import { accrueDetection, canSense, type Eye } from "../systems/Sensing";
import { CAMERA_CONE, drawVisionCone } from "../ui/VisionCone";
import { nearestCardinal } from "./directions";
import {
  CAMERA_DISPLAY_TILES,
  ensureEntityAnim,
  entitySpriteKey,
  hasEntitySprite,
  type EntitySpriteId,
} from "./EntitySprites";
import type { EnforcerContext } from "./Enforcer";

/** The hand-drawn housing, when `assets/sprites/security-camera.png` is on disk. */
const CAMERA_ART: EntitySpriteId = "security-camera";

const RAY_COUNT = 20;
/** Half-arc (degrees) the mounted camera pans its cone across. */
const SWEEP_ARC = 55;
/** Pan oscillation speed (radians of phase per second). */
const SWEEP_SPEED = paced(0.7);

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

  /** Pixel position — public for the same reason as {@link Enforcer.x}. */
  readonly x: number;
  readonly y: number;
  private readonly baseFacing: number;
  private sweepPhase = Phaser.Math.FloatBetween(0, Math.PI * 2);

  private readonly cone: Phaser.GameObjects.Graphics;
  /**
   * The drawn fallback housing, and only that.
   *
   * Left undefined when `public/assets/sprites/security-camera.png` is on disk,
   * because {@link addHousingSprite} has drawn the housing instead — which is
   * why {@link drawHousing} checks before drawing into it.
   */
  private readonly housing?: Phaser.GameObjects.Graphics;
  /** Reused across frames — {@link canSense} only reads it. */
  private readonly eye: Eye;

  /** Which walk surface this camera watches — see `src/map/planes.ts`. */
  readonly plane: number;

  constructor(
    scene: Phaser.Scene,
    tile: GameTile,
    tileSize: number,
    grid: CollisionGrid,
    plane = 0,
  ) {
    this.plane = plane;
    this.stats = sensorStatsFor(tile.components);
    this.x = (tile.x + 0.5) * tileSize + tile.offsetX;
    this.y = (tile.y + 0.5) * tileSize + tile.offsetY;
    this.baseFacing = inferFacing(grid, tile.x, tile.y);
    this.facing = this.baseFacing;
    this.eye = {
      x: this.x,
      y: this.y,
      facing: this.facing,
      rangeTiles: this.stats.detectionRange,
      coneDegrees: this.stats.sightAngle,
      thermalTiles: this.stats.thermalRadius,
      plane,
    };

    this.cone = scene.add.graphics().setDepth(400);
    if (hasEntitySprite(scene, CAMERA_ART)) {
      this.addHousingSprite(scene, tileSize);
    } else {
      this.housing = scene.add.graphics().setDepth(455);
      this.drawHousing(tileSize);
    }
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

    // The camera never moves, so only the swept axis needs republishing.
    this.eye.facing = this.facing;
    this.detection = accrueDetection(
      this.detection,
      canSense(this.eye, ctx),
      dt,
      this.stats.detectionDelay,
      ctx,
    );

    drawVisionCone(
      this.cone,
      ctx.grid,
      this.x,
      this.y,
      this.facing,
      this.stats.sightAngle,
      this.stats.detectionRange,
      ctx.tileSize,
      this.detection,
      CAMERA_CONE,
      RAY_COUNT,
    );
  }

  /**
   * The hand-drawn housing, facing whichever of the four cardinals it was drawn for.
   *
   * The art has exactly four facings and {@link inferFacing} produces a
   * continuous angle — it sums the clear-neighbour vectors, so a camera in a
   * corner comes out diagonal. {@link nearestCardinal} does the snapping, in
   * the same module as the eight-way snap the character sheets use, and it
   * happens once at construction because the *housing* never turns; only the
   * cone sweeps.
   *
   * `active` is a two-frame clip, not a still: the pair differs by one pixel,
   * the `#ff0040` status lamp, held 500ms each. A disabled camera is that same
   * frame with the lamp dark, which is why `stats.state` maps straight onto the
   * tag name without a translation table.
   *
   * Nothing keeps the sprite: a camera's `state` comes off its map component
   * and no code changes it, so the clip picked here is the clip for the level.
   *
   * The size comes from {@link CAMERA_DISPLAY_TILES} rather than from the tile,
   * because unlike the terminal or a door this housing has no authored
   * footprint to read — its tile def is a plain 1x1 cell that the camera is
   * *mounted in*, not filled by. Sharing the constant with `EntitySprites` is
   * what keeps the size drawn here and the footprint the scale rule checks from
   * being two numbers that disagree.
   */
  private addHousingSprite(scene: Phaser.Scene, tileSize: number): void {
    const size = tileSize * CAMERA_DISPLAY_TILES;
    const sprite = scene.add
      .sprite(this.x, this.y, entitySpriteKey(CAMERA_ART))
      .setDisplaySize(size, size)
      .setDepth(455);
    const tag = this.stats.state === "disabled" ? "disabled" : "active";
    const key = ensureEntityAnim(
      scene,
      CAMERA_ART,
      tag,
      nearestCardinal(this.baseFacing),
    );
    if (key !== undefined) sprite.play(key);
  }

  /** A small fixed camera housing with a lens pointing along the mounted facing. */
  private drawHousing(tileSize: number): void {
    const r = tileSize * 0.28;
    const g = this.housing;
    if (!g) return;
    g.fillStyle(0x1a2330, 1);
    g.fillCircle(this.x, this.y, r);
    g.lineStyle(2, 0x4fd8ff, 0.9);
    g.strokeCircle(this.x, this.y, r);
    // Lens nub in the mounted direction.
    g.fillStyle(0x9fe9ff, 1);
    g.fillCircle(this.x + Math.cos(this.baseFacing) * r, this.y + Math.sin(this.baseFacing) * r, r * 0.4);
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
