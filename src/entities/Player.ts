import Phaser from "phaser";
import {
  PLAYER_ANIM_FRAME_COUNTS,
  PLAYER_ANIM_FRAME_RATES,
  PLAYER_DISPLAY_TILES,
  PLAYER_SOURCE_SIZE,
  playerAnimKey,
  playerFrameKey,
  type PlayerAnimName,
} from "./PlayerAnimations";
import { DIRS_8, directionOf, type Dir8 } from "./directions";
import {
  ESCORT_SPEED_MULTIPLIER,
  PLAYER_DEFAULTS,
  PLAYER_WALK_TILES,
  paced,
} from "../systems/EntityStats";
import { PLAYER_IDLE_SOUTH_COLLIDER } from "./generated/playerCollider";
import { shadowShapeFor, type ShadowShape } from "../render/shadowShape";
import { len } from "../systems/distance";

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
  /** Footprint the ground shadow is drawn from — see `EntityShadows`. */
  readonly shadow: ShadowShape;
  /** Facing angle in radians; updated as the player moves. */
  facing = -Math.PI / 2; // start facing "up"
  private readonly walkSpeed: number;
  private dir: Dir8 = "south";
  private currentAnim: PlayerAnimName = "idle";
  private stance: Stance = "standing";

  constructor(scene: Phaser.Scene, x: number, y: number, tileSize: number) {
    this.walkSpeed = tileSize * paced(PLAYER_WALK_TILES); // px/sec baseline

    Player.ensureAnimations(scene);

    this.sprite = scene.physics.add.sprite(x, y, playerFrameKey("idle", "south", 0));
    // Above the lighting overlay (700), unlike every other entity. Unlit space is
    // fully opaque, so Rowan would otherwise vanish along with the room whenever he
    // stepped out of the light — the room stays black, but the character reads.
    this.sprite.setDepth(750);

    // Scale the art to ~1.5 tiles tall, then fit the collision body to the
    // sprite's alpha silhouette. The box is traced from the art by the collider
    // generator (`npm run gen:colliders`) rather than hand-tuned, so it tracks
    // the character instead of the padded frame. Values are in the sprite's
    // *unscaled* local space (Arcade Body convention).
    //
    // The two sizes are chosen so this division lands on exactly 0.5, which is
    // what keeps the pixel art crisp under the camera's 2x zoom — see
    // PLAYER_SOURCE_SIZE for why that matters.
    //
    // Crouching does not squash the sprite: the crouched frames are drawn low
    // already, and scaling them by a fraction would put the art back on a
    // non-integer factor — the exact thing this division is arranged to avoid.
    const displaySize = tileSize * PLAYER_DISPLAY_TILES;
    this.sprite.setScale(displaySize / PLAYER_SOURCE_SIZE);
    // Off the same trace the body below is sized from, so the shadow sits under the
    // boots rather than under wherever the padded frame happens to put its centre.
    this.shadow = shadowShapeFor(PLAYER_IDLE_SOUTH_COLLIDER, PLAYER_DISPLAY_TILES, tileSize);
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

  /**
   * True while actually sprinting — moving, upright, with run toggled on. Not just
   * the key state: standing still with run toggled on isn't running. Read by the
   * conduct rules, where a sprint is one of the things that stops you reading as staff.
   */
  get running(): boolean {
    return this.runningNow;
  }
  private runningNow = false;

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

  /** Restores bio-integrity, capped at {@link maxHp} (Medkit). */
  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
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
    // Marching someone at gunpoint rules out a sprint the way a crouch does: his hands
    // are full, and the man in front of him sets the pace either way.
    const running = cursors.run && moving && !cursors.escorting && this.stance === "standing";
    this.runningNow = running;
    // Crouched *and* mid-transition both move at the slow sneak pace. Escorting is
    // its own branch at its own constant even though the two numbers agree today —
    // they answer to different things, and collapsing them would mean retuning the
    // crouch to retune a hostage march.
    const stanceMul =
      transitioning || sneaking
        ? 0.45
        : cursors.escorting
          ? ESCORT_SPEED_MULTIPLIER
          : running
            ? 1.6
            : 1;
    const speed = this.walkSpeed * stanceMul;

    if (moving) {
      const mag = len(vx, vy);
      vx = (vx / mag) * speed;
      vy = (vy / mag) * speed;
      this.facing = Math.atan2(vy, vx);
      // Lock the facing direction while a transition clip plays so turning
      // mid-lower/rise doesn't restart it in a new direction.
      if (!transitioning) this.dir = directionOf(vx, vy);
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

    this.updateInvuln(dt);
  }

  /**
   * Points Rowan at something without moving him.
   *
   * `facing` and the animation direction are otherwise written only inside the
   * `if (moving)` block above, which means Rowan cannot turn on the spot — correct
   * for a game with no aiming, and the one thing a hold-up needs. This seeds both
   * fields and lets `update` play the idle pose in that direction on its own, so a
   * man standing over a hostage looks at him rather than at the last wall he walked
   * toward. No new art is involved.
   *
   * The direction is left alone mid-crouch-transition for the same reason the
   * movement path leaves it alone: turning would restart the one-shot clip facing
   * somewhere else.
   */
  face(angle: number): void {
    this.facing = angle;
    if (this.stance !== "crouching-down" && this.stance !== "standing-up") {
      this.dir = directionOf(Math.cos(angle), Math.sin(angle));
    }
  }

  /** Ticks the post-hit invulnerability window, flashing the sprite while active. */
  private updateInvuln(dt: number): void {
    if (this.hitCooldownLeft <= 0) return;
    this.hitCooldownLeft = Math.max(0, this.hitCooldownLeft - dt);
    if (this.hitCooldownLeft === 0) this.sprite.clearTint();
    else this.sprite.setTint(Math.floor(this.hitCooldownLeft * 12) % 2 === 0 ? 0xffffff : 0xff6b6b);
  }

  /** Enters a lower/rise transition: plays the one-shot clip locked to the
   * current facing. `update()` advances to the settled stance once the clip
   * finishes (see the isPlaying check there). */
  private beginTransition(anim: "crouch-down" | "crouch-up"): void {
    this.stance = anim === "crouch-down" ? "crouching-down" : "standing-up";
    this.currentAnim = anim;
    this.sprite.play(playerAnimKey(anim, this.dir), true);
  }

  private setAnimation(anim: PlayerAnimName, dir: Dir8): void {
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

  /**
   * Where the player *will* be drawn this frame, for anything rendering from their
   * position.
   *
   * Arcade integrates the body during its own `UPDATE` step but only writes the
   * result onto the sprite in `POST_UPDATE`, after `Scene.update()` has run. So
   * anything reading `sprite.x` from scene update is a physics step behind — while
   * the camera, which follows at render time, is not. For a light cast from the
   * player that mismatch is a lag that varies with the frame delta, which is judder.
   * The body's centre is the position everything else will agree on a moment later.
   */
  get eye(): { x: number; y: number } {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return { x: this.sprite.x, y: this.sprite.y };
    return { x: body.center.x, y: body.center.y };
  }

  /** Registers every player animation once per scene. */
  private static ensureAnimations(scene: Phaser.Scene): void {
    for (const anim of Object.keys(PLAYER_ANIM_FRAME_COUNTS) as PlayerAnimName[]) {
      const frameCount = PLAYER_ANIM_FRAME_COUNTS[anim];
      const frameRate = PLAYER_ANIM_FRAME_RATES[anim];
      // The lower/rise transitions are one-shots; everything else loops.
      const repeat = anim === "crouch-down" || anim === "crouch-up" ? 0 : -1;
      for (const dir of DIRS_8) {
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
  /**
   * Marching someone at gunpoint: slower, and no sprinting. Arrives through
   * `GameScene.readInput` rather than off a key, because it is a consequence of the
   * hold rather than an input — the same funnel NW-SMAC-01's axis inversion and the
   * roof's input lock use, and for the same reason.
   */
  escorting: boolean;
}
