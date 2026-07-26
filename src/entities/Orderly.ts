import Phaser from "phaser";
import type { CollisionGrid } from "../systems/CollisionGrid";
import { paced } from "../systems/EntityStats";
import { DIRS_8, nearestDirection, type Dir8 } from "./directions";
import { alertMarker } from "./markers";
import {
  ORDERLY_ANIM_FRAME_COUNTS,
  ORDERLY_ANIM_FRAME_RATES,
  orderlyAnimKey,
  orderlyFrameKey,
  type OrderlyAnimName,
} from "./OrderlyAnimations";

export interface OrderlyContext {
  grid: CollisionGrid;
  tileSize: number;
  player: { x: number; y: number };
  /** True when the player is hidden (crouched in cover) — orderlies can't see them either. */
  playerConcealed: boolean;
  /** True when the player reads as compliant staff — nothing to report. */
  playerCompliant: boolean;
}

const SIGHT_RANGE_TILES = 5;
const WANDER_LEASH_TILES = 2.5;
const WALK_SPEED_TILES = paced(1.1);
/** Seconds an orderly lingers at a knock it walked over to inspect before resuming its wander. */
const DISTRACT_PAUSE = 2.5;

/**
 * A bystander, not a threat — the map's `orderlies` tiles carry no gameplay
 * component (unlike guards/drones), so this is a distinct, lighter mechanic.
 *
 * An orderly wanders loosely near its spawn point. If it gets a clear,
 * unobstructed line of sight to the player (no cone-angle restriction — a
 * person just looks around) and the player isn't concealed, it startles: a
 * one-shot "witness" sighting. `update()` returns `true` on exactly that
 * frame so the scene can react (raise nearby guards' suspicion, the same way
 * a noisy door does) — after which the orderly freezes, its job done. It's a
 * hazard to avoid being seen by, not a persistent threat like a guard.
 */
export class Orderly {
  private x: number;
  private y: number;
  private readonly spawnX: number;
  private readonly spawnY: number;
  private facing = 0;
  private moving = false;
  private wanderTimer: number;
  private dir: Dir8 = "south";
  private alerted = false;
  /** Seconds of stun remaining; while > 0 the orderly is frozen and can't witness. */
  private stunTimer = 0;
  /** A knock the orderly is walking over to inspect, or null while wandering. */
  private distractTarget: { x: number; y: number } | null = null;
  private distractPause = 0;

  private readonly body: Phaser.GameObjects.Sprite;
  private readonly bang: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number, tileSize: number) {
    this.x = this.spawnX = (tileX + 0.5) * tileSize;
    this.y = this.spawnY = (tileY + 0.5) * tileSize;
    this.wanderTimer = Phaser.Math.FloatBetween(1, 3);

    Orderly.ensureAnimations(scene);
    this.body = scene.add.sprite(this.x, this.y, orderlyFrameKey("idle", "south", 0)).setDepth(440);
    // The 84x84 source art scaled to ~1.5 tiles tall, matching the guards.
    this.body.setScale((tileSize * 1.5) / 84);
    this.body.play(orderlyAnimKey("idle", "south"));

    this.bang = alertMarker(scene, this.x, this.y, tileSize);
  }

  /** Freezes the orderly for a stretch (a Stun Rounds dart) — can't witness. */
  stun(seconds: number): void {
    this.stunTimer = Math.max(this.stunTimer, seconds);
    this.moving = false;
    this.bang.setVisible(false);
  }

  /**
   * Lures the orderly to inspect a nearby noise (a player's knock): it leaves
   * its wander, walks over, pauses, then drifts back. A no-op while stunned or
   * already startled by witnessing the player. `sx,sy` are pixels.
   */
  distract(sx: number, sy: number): void {
    if (this.stunTimer > 0 || this.alerted) return;
    this.distractTarget = { x: sx, y: sy };
    this.distractPause = 0;
  }

  /** True on the exact frame the orderly first spots the player. */
  update(dt: number, ctx: OrderlyContext): boolean {
    // Stunned: hold still and stay blind until the dart wears off.
    if (this.stunTimer > 0) {
      this.stunTimer = Math.max(0, this.stunTimer - dt);
      this.moving = false;
      this.body.setPosition(this.x, this.y);
      this.bang.setPosition(this.x, this.y - ctx.tileSize);
      return false;
    }

    if (!this.alerted) {
      if (this.distractTarget) this.investigateDistraction(dt, ctx);
      else this.wander(dt, ctx);
    }

    const dir = nearestDirection(this.facing);
    const anim: OrderlyAnimName = this.moving ? "walk" : "idle";
    if (dir !== this.dir || this.body.anims.currentAnim?.key !== orderlyAnimKey(anim, dir)) {
      this.dir = dir;
      this.body.play(orderlyAnimKey(anim, dir), true);
    }
    this.body.setPosition(this.x, this.y);
    this.bang.setPosition(this.x, this.y - ctx.tileSize);

    if (this.alerted) return false;

    if (this.canSee(ctx)) {
      this.alerted = true;
      this.moving = false;
      this.bang.setVisible(true);
      return true;
    }
    return false;
  }

  private wander(dt: number, ctx: OrderlyContext): void {
    const { grid, tileSize } = ctx;
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.moving = !this.moving || Math.random() < 0.5;
      if (this.moving) {
        // Head roughly back toward spawn once the leash stretches too far,
        // otherwise wander in a random direction.
        const strayed = Math.hypot(this.x - this.spawnX, this.y - this.spawnY) > WANDER_LEASH_TILES * tileSize;
        this.facing = strayed
          ? Math.atan2(this.spawnY - this.y, this.spawnX - this.x)
          : Phaser.Math.FloatBetween(0, Math.PI * 2);
      }
      this.wanderTimer = this.moving
        ? Phaser.Math.FloatBetween(0.8, 1.8)
        : Phaser.Math.FloatBetween(1.5, 3.5);
    }

    if (!this.moving) return;
    const speed = WALK_SPEED_TILES * tileSize;
    const nx = this.x + Math.cos(this.facing) * speed * dt;
    const ny = this.y + Math.sin(this.facing) * speed * dt;
    if (grid.isBlocked(Math.floor(nx / tileSize), Math.floor(ny / tileSize))) {
      this.moving = false;
      this.wanderTimer = Phaser.Math.FloatBetween(1, 2);
    } else {
      this.x = nx;
      this.y = ny;
    }
  }

  /**
   * Walks toward a knock and lingers there before giving up. Once the pause
   * elapses (or the path is blocked) it clears the target so {@link wander}
   * resumes — the spawn leash then drifts the orderly back home.
   */
  private investigateDistraction(dt: number, ctx: OrderlyContext): void {
    const target = this.distractTarget!;
    const { grid, tileSize } = ctx;
    const dist = Math.hypot(target.x - this.x, target.y - this.y);

    if (dist > tileSize * 0.5) {
      this.moving = true;
      this.facing = Math.atan2(target.y - this.y, target.x - this.x);
      const speed = WALK_SPEED_TILES * tileSize;
      const nx = this.x + Math.cos(this.facing) * speed * dt;
      const ny = this.y + Math.sin(this.facing) * speed * dt;
      if (grid.isBlocked(Math.floor(nx / tileSize), Math.floor(ny / tileSize))) {
        // Can't reach it — pause where we are, then give up.
        this.moving = false;
        this.distractPause += dt;
        if (this.distractPause >= DISTRACT_PAUSE) this.distractTarget = null;
      } else {
        this.x = nx;
        this.y = ny;
      }
      return;
    }

    // Arrived: look around for a beat, then resume wandering.
    this.moving = false;
    this.distractPause += dt;
    if (this.distractPause >= DISTRACT_PAUSE) {
      this.distractTarget = null;
      this.distractPause = 0;
    }
  }

  /** Unobstructed sight to the player within range — no cone-angle limit. */
  private canSee(ctx: OrderlyContext): boolean {
    // Orderlies are the readiest to be fooled: a coworker walking by is a coworker
    // walking by, so a compliant Rowan never startles one into raising the alarm.
    if (ctx.playerCompliant) return false;
    if (ctx.playerConcealed) return false;
    const { player, tileSize, grid } = ctx;
    const dist = Math.hypot(player.x - this.x, player.y - this.y);
    if (dist > SIGHT_RANGE_TILES * tileSize) return false;
    return grid.hasLineOfSight(this.x / tileSize, this.y / tileSize, player.x / tileSize, player.y / tileSize);
  }

  get position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /** True while frozen by a Stun Rounds dart — guards treat this as an anomaly. */
  get isStunned(): boolean {
    return this.stunTimer > 0;
  }

  /** Registers idle/walk animations for each direction once per scene. */
  private static ensureAnimations(scene: Phaser.Scene): void {
    for (const anim of Object.keys(ORDERLY_ANIM_FRAME_COUNTS) as OrderlyAnimName[]) {
      const frameCount = ORDERLY_ANIM_FRAME_COUNTS[anim];
      const frameRate = ORDERLY_ANIM_FRAME_RATES[anim];
      for (const dir of DIRS_8) {
        const key = orderlyAnimKey(anim, dir);
        if (scene.anims.exists(key)) continue;
        scene.anims.create({
          key,
          frames: Array.from({ length: frameCount }, (_, i) => ({
            key: orderlyFrameKey(anim, dir, i),
          })),
          frameRate,
          repeat: -1,
        });
      }
    }
  }
}
