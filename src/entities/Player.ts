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
  private dir: PlayerAnimDir = "south";
  private currentAnim: PlayerAnimName = "idle";
  private stance: Stance = "standing";

  constructor(scene: Phaser.Scene, x: number, y: number, tileSize: number) {
    this.walkSpeed = tileSize * 3.2; // px/sec baseline

    Player.ensureAnimations(scene);

    this.sprite = scene.physics.add.sprite(x, y, playerFrameKey("idle", "south", 0));
    this.sprite.setDepth(500);

    // Scale the 88x88 art to ~1.5 tiles tall, then size the collision body in
    // the sprite's *unscaled* local space (Arcade Body convention) so it
    // roughly covers the torso rather than the padded frame.
    const displaySize = tileSize * 1.5;
    const scale = displaySize / 88;
    this.sprite.setScale(scale);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(36, 40);
    this.sprite.setCollideWorldBounds(true);

    this.sprite.play(playerAnimKey("idle", "south"));
  }

  /** How loud the player currently is (0..1), from movement + stance. */
  noise = 0;

  /**
   * True only once *fully* crouched — not during the lower/rise transitions.
   * Cover concealment keys off this, so tapping Shift can't grant an instant
   * hide before Rowan has actually gone to ground.
   */
  get crouched(): boolean {
    return this.stance === "crouched";
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

    // Kick off a stance transition from a settled state; the one-shot clip
    // (started in beginTransition) latches the target stance on completion.
    if (this.stance === "standing" && wantCrouch) {
      this.beginTransition("crouch-down", "crouched");
    } else if (this.stance === "crouched" && !wantCrouch) {
      this.beginTransition("crouch-up", "standing");
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
  }

  /** Enters a lower/rise transition: plays the one-shot clip locked to the
   * current facing, and advances to the target stance when it finishes. */
  private beginTransition(anim: "crouch-down" | "crouch-up", target: Stance): void {
    this.stance = anim === "crouch-down" ? "crouching-down" : "standing-up";
    const key = playerAnimKey(anim, this.dir);
    this.currentAnim = anim;
    this.sprite.play(key, true);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + key, () => {
      // Only latch if we're still in this transition (guards against a stray
      // late event after some other state change).
      if (this.stance === "crouching-down" || this.stance === "standing-up") {
        this.stance = target;
      }
    });
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
