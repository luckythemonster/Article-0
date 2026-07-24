import Phaser from "phaser";
import {
  PLAYER_ANIM_DIRS,
  PLAYER_ANIM_FRAME_COUNTS,
  PLAYER_ANIM_FRAME_RATES,
  nearestDirection,
  playerAnimKey,
  playerFrameKey,
  type PlayerAnimDir,
  type PlayerAnimName,
} from "./PlayerAnimations";
import { PLAYER_DEFAULTS } from "../systems/EntityStats";
import { PLAYER_IDLE_SOUTH_COLLIDER } from "./generated/playerCollider";

/**
 * The player-controlled infiltrator, rendered with the PixelLab-generated
 * "Rowan Ibarra" character sheet (idle/walk/run/crouch cycles, full 8
 * directions).
 *
 * Movement is free 8-directional via an arcade-physics body, and the sprite's
 * facing matches it exactly; the animation played reflects stance (idle /
 * walk / run / crouch-sneak). Sneaking halves speed and noise; running is
 * faster but noisier — noise feeds the detection system.
 */
/**
 * Standing ⇄ crouched is a small state machine rather than an instant pose
 * swap: entering/leaving the crouch plays a one-shot lower/rise transition
 * that must finish before the target stance takes over, so the change reads
 * as Rowan actually ducking down and standing back up.
 */
type Stance = "standing" | "crouching-down" | "crouched" | "standing-up";

export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  /** Facing angle in radians; updated as the player moves. */
  facing = -Math.PI / 2; // start facing "up"
  private readonly walkSpeed: number;
  private readonly baseScale: number;
  private dir: PlayerAnimDir = "south";
  private currentAnim: PlayerAnimName = "idle";
  private stance: Stance = "standing";

  /** Crouched Rowan renders at this fraction of his standing height. */
  private static readonly CROUCH_SCALE_FACTOR = 0.8;

  constructor(scene: Phaser.Scene, x: number, y: number, tileSize: number) {
    this.walkSpeed = tileSize * 3.2; // px/sec baseline

    Player.ensureAnimations(scene);

    this.sprite = scene.physics.add.sprite(x, y, playerFrameKey("idle", "south", 0));
    this.sprite.setDepth(500);

    // Scale the 88x88 art to ~1.5 tiles tall, then fit the collision body to
    // the sprite's alpha silhouette. The box is traced from the art by the
    // collider generator (`npm run gen:colliders`) rather than hand-tuned, so
    // it tracks the character instead of the padded frame. Values are in the
    // sprite's *unscaled* local space (Arcade Body convention).
    const displaySize = tileSize * 1.5;
    this.baseScale = displaySize / 88;
    this.sprite.setScale(this.baseScale);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const { width, height, offsetX, offsetY } = PLAYER_IDLE_SOUTH_COLLIDER.aabb;
    body.setSize(width, height);
    body.setOffset(offsetX, offsetY);
    this.sprite.setCollideWorldBounds(true);

    this.sprite.play(playerAnimKey("idle", "south"));
  }

  /** How loud the player currently is (0..1), from movement + stance. */
  noise = 0;

  /** Full and current bio-integrity (health). */
  readonly maxHp = PLAYER_DEFAULTS.maxHp;
  hp = PLAYER_DEFAULTS.maxHp;
  /** Seconds of invulnerability remaining after the last hit. */
  private hitCooldownLeft = 0;

  /**
   * True only once *fully* crouched — not during the lower/rise transitions.
   * Cover concealment keys off this, so tapping Shift can't grant an instant
   * hide before Rowan has actually gone to ground.
   */
  get crouched(): boolean {
    return this.stance === "crouched";
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  /**
   * Applies damage unless still within the post-hit invulnerability window.
   * Returns true if the hit landed (so callers can trigger feedback/SFX).
   */
  takeDamage(amount: number): boolean {
    if (this.hitCooldownLeft > 0 || this.hp <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.hitCooldownLeft = PLAYER_DEFAULTS.hitCooldown;
    return true;
  }

  update(cursors: InputState, dt: number): void {
    let vx = 0;
    let vy = 0;
    if (cursors.left) vx -= 1;
    if (cursors.right) vx += 1;
    if (cursors.up) vy -= 1;
    if (cursors.down) vy += 1;

    const moving = vx !== 0 || vy !== 0;
    const wantCrouch = cursors.sneak;

    // Advance a running transition the moment its one-shot clip has finished.
    // A non-repeating anim sets isPlaying=false and holds its last frame when
    // done, so this is deterministic — unlike a fire-once animationcomplete
    // event it can never be missed, so holding Shift always settles into (and
    // holds) the looping idle crouch instead of freezing on the lower clip.
    if (
      (this.stance === "crouching-down" || this.stance === "standing-up") &&
      !this.sprite.anims.isPlaying
    ) {
      this.stance = this.stance === "crouching-down" ? "crouched" : "standing";
    }

    // Kick off a stance transition from a settled state.
    if (this.stance === "standing" && wantCrouch) {
      this.beginTransition("crouch-down");
    } else if (this.stance === "crouched" && !wantCrouch) {
      this.beginTransition("crouch-up");
    }

    const transitioning = this.stance === "crouching-down" || this.stance === "standing-up";
    const crouchedNow = this.stance === "crouched";
    const sneaking = crouchedNow && moving;
    const running = cursors.run && moving && this.stance === "standing";
    // Crouched *and* mid-transition both move at the slow sneak pace.
    const stanceMul = transitioning || sneaking ? 0.45 : running ? 1.6 : 1;
    const speed = this.walkSpeed * stanceMul;

    if (moving) {
      const len = Math.hypot(vx, vy);
      vx = (vx / len) * speed;
      vy = (vy / len) * speed;
      this.facing = Math.atan2(vy, vx);
      // Lock the facing direction while a transition clip plays so turning
      // mid-lower/rise doesn't restart it in a new direction.
      if (!transitioning) this.dir = nearestDirection(vx, vy);
    }
    this.sprite.setVelocity(vx, vy);

    // Noise: still = silent, sneak/transition = low, walk = medium, run = high.
    const target = !moving ? 0 : sneaking || transitioning ? 0.15 : running ? 1 : 0.5;
    this.noise = Phaser.Math.Linear(this.noise, target, Math.min(1, dt * 6));

    // While a transition clip is playing, leave it alone — it owns the sprite
    // until it completes. Otherwise pick the stance-appropriate pose.
    if (!transitioning) {
      const anim: PlayerAnimName = crouchedNow
        ? moving
          ? "crouch-walk"
          : "crouch"
        : moving
          ? running
            ? "run"
            : "walk"
          : "idle";
      this.setAnimation(anim, this.dir);
    }

    this.updateScale();
    this.updateInvuln(dt);
  }

  /** Ticks the post-hit invulnerability window, flashing the sprite while active. */
  private updateInvuln(dt: number): void {
    if (this.hitCooldownLeft <= 0) return;
    this.hitCooldownLeft = Math.max(0, this.hitCooldownLeft - dt);
    if (this.hitCooldownLeft === 0) this.sprite.clearTint();
    else this.sprite.setTint(Math.floor(this.hitCooldownLeft * 12) % 2 === 0 ? 0xffffff : 0xff6b6b);
  }

  /**
   * Crouched Rowan renders shorter than standing. The height change is
   * synced to the lower/rise clip's own playback progress (not a fixed
   * timer), so it always finishes exactly when the pose does, however fast
   * or slow that animation ends up being.
   */
  private updateScale(): void {
    const crouchScale = this.baseScale * Player.CROUCH_SCALE_FACTOR;
    let scale: number;
    switch (this.stance) {
      case "standing":
        scale = this.baseScale;
        break;
      case "crouched":
        scale = crouchScale;
        break;
      case "crouching-down":
        scale = Phaser.Math.Linear(this.baseScale, crouchScale, this.sprite.anims.getProgress());
        break;
      case "standing-up":
        scale = Phaser.Math.Linear(crouchScale, this.baseScale, this.sprite.anims.getProgress());
        break;
    }
    this.sprite.setScale(scale);
  }

  /** Enters a lower/rise transition: plays the one-shot clip locked to the
   * current facing. `update()` advances to the settled stance once the clip
   * finishes (see the isPlaying check there). */
  private beginTransition(anim: "crouch-down" | "crouch-up"): void {
    this.stance = anim === "crouch-down" ? "crouching-down" : "standing-up";
    this.currentAnim = anim;
    this.sprite.play(playerAnimKey(anim, this.dir), true);
  }

  private setAnimation(anim: PlayerAnimName, dir: PlayerAnimDir): void {
    if (anim === this.currentAnim && this.sprite.anims.currentAnim?.key === playerAnimKey(anim, dir)) {
      return;
    }
    this.currentAnim = anim;
    this.sprite.play(playerAnimKey(anim, dir), true);
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }

  /** Registers every player animation once per scene. */
  private static ensureAnimations(scene: Phaser.Scene): void {
    for (const anim of Object.keys(PLAYER_ANIM_FRAME_COUNTS) as PlayerAnimName[]) {
      const frameCount = PLAYER_ANIM_FRAME_COUNTS[anim];
      const frameRate = PLAYER_ANIM_FRAME_RATES[anim];
      // The lower/rise transitions are one-shots; everything else loops.
      const repeat = anim === "crouch-down" || anim === "crouch-up" ? 0 : -1;
      for (const dir of PLAYER_ANIM_DIRS) {
        const key = playerAnimKey(anim, dir);
        if (scene.anims.exists(key)) continue;
        scene.anims.create({
          key,
          frames: Array.from({ length: frameCount }, (_, i) => ({
            key: playerFrameKey(anim, dir, i),
          })),
          frameRate,
          repeat,
        });
      }
    }
  }
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
  sneak: boolean;
}
