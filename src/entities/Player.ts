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
  PRESS_FLUSH_PULL,
  PRESS_LEAN_SECONDS,
  PRESS_NOISE,
  PRESS_SPEED_MULTIPLIER,
  paced,
} from "../systems/EntityStats";
import type { PressState } from "../systems/WallPress";
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
  private readonly tileSize: number;
  /**
   * The face being held this frame, or null when not pressed.
   *
   * Deliberately *not* a fifth {@link Stance}. The concealment rules need both
   * axes at once — low cover hides you only if you are pressed against it *and*
   * crouched, high cover hides you standing — so folding pressing into the stance
   * enum would make "crouched against a crate" unrepresentable, which is the
   * single most useful thing the mechanic does.
   */
  private press: PressState | null = null;
  /** Current lean, in pixels, eased toward {@link leanTargetX}/{@link leanTargetY}. */
  private leanX = 0;
  private leanY = 0;
  private leanTargetX = 0;
  private leanTargetY = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, tileSize: number) {
    this.tileSize = tileSize;
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

  /** True while holding a face — read by the concealment and conduct rules. */
  get pressed(): boolean {
    return this.press !== null;
  }

  /** The face currently held, for the concealment rules to ask what it is made of. */
  get pressedSurface(): PressState | null {
    return this.press;
  }

  /**
   * True once actually leaning past a corner. Keyed off the eased lean rather
   * than the input, so the HUD reads the same thing the sightline does.
   */
  get peeking(): boolean {
    return this.leanX !== 0 || this.leanY !== 0;
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
    this.press = cursors.press;
    // Squeezed under a desk there is nowhere to stand up *to*, so releasing Shift
    // holds the crouch until Rowan is back out from under it. Routing it through
    // `wantCrouch` rather than blocking the transition means the rise plays the
    // moment he clears the tile, with no special case anywhere else.
    const wantCrouch = cursors.sneak || !cursors.canStand;

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
    // A man with his back flat against a wall is not about to break into a sprint,
    // for the same reason marching a hostage rules one out.
    const running =
      cursors.run && moving && !cursors.escorting && !this.press && this.stance === "standing";
    this.runningNow = running;
    // Crouched *and* mid-transition both move at the slow sneak pace. Pressing and
    // escorting are their own branches at their own constants even though all three
    // numbers agree today — they answer to different things, and collapsing them
    // would mean retuning the crouch to retune a hostage march.
    const stanceMul = this.press
      ? PRESS_SPEED_MULTIPLIER
      : transitioning || sneaking
        ? 0.45
        : cursors.escorting
          ? ESCORT_SPEED_MULTIPLIER
          : running
            ? 1.6
            : 1;
    const speed = this.walkSpeed * stanceMul;

    let sliding = false;
    if (this.press) {
      const held = this.pressedVelocity(this.press, vx, vy, speed, transitioning);
      vx = held.vx;
      vy = held.vy;
      sliding = held.sliding;
    } else {
      this.leanTargetX = 0;
      this.leanTargetY = 0;
      if (moving) {
        const mag = len(vx, vy);
        vx = (vx / mag) * speed;
        vy = (vy / mag) * speed;
        this.facing = Math.atan2(vy, vx);
        // Lock the facing direction while a transition clip plays so turning
        // mid-lower/rise doesn't restart it in a new direction.
        if (!transitioning) this.dir = directionOf(vx, vy);
      }
    }
    this.sprite.setVelocity(vx, vy);
    this.easeLean(dt);

    // Noise: still = silent, pressed slide = quietest of all, sneak/transition =
    // low, walk = medium, run = high. A press that isn't going anywhere — held at
    // a corner, or mid-peek — is as silent as standing still.
    const target = this.press
      ? sliding
        ? PRESS_NOISE
        : 0
      : !moving
        ? 0
        : sneaking || transitioning
          ? 0.15
          : running
            ? 1
            : 0.5;
    this.noise = Phaser.Math.Linear(this.noise, target, Math.min(1, dt * 6));

    // While a transition clip is playing, leave it alone — it owns the sprite
    // until it completes. Otherwise pick the stance-appropriate pose.
    if (!transitioning) {
      // Pressed, the walk cycle follows what the body actually does rather than
      // what was asked of it: held at a corner or mid-lean he is standing still,
      // however hard the direction is being held.
      const striding = this.press ? sliding : moving;
      const anim: PlayerAnimName = crouchedNow
        ? striding
          ? "crouch-walk"
          : "crouch"
        : striding
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

  /**
   * Velocity while holding a face, and whether he is actually travelling along it.
   *
   * Two perpendicular jobs, and because the face is axis-aligned they never fight:
   * the **tangent** axis carries the input, projected onto the wall so pushing
   * diagonally into it slides along instead of stalling; the **normal** axis
   * carries a proportional pull onto the flush line, which is what puts his back
   * against the wall over a few frames rather than snapping him to it.
   *
   * The peek falls out of the same branch. A step the wall no longer backs is
   * refused — that is what stops him walking off the end of the face — and the
   * input that would have taken him there becomes a lean past the corner instead.
   */
  private pressedVelocity(
    p: PressState,
    inputX: number,
    inputY: number,
    speed: number,
    transitioning: boolean,
  ): { vx: number; vy: number; sliding: boolean } {
    // How much of the input runs along the face, and which way.
    const along = inputX * p.tx + inputY * p.ty;
    const sign = along > 0 ? 1 : along < 0 ? -1 : 0;
    const side = sign > 0 ? p.pos : sign < 0 ? p.neg : null;

    const sliding = side !== null && side.open;
    const leaning = side !== null && !side.open ? side.lean : null;
    this.leanTargetX = leaning ? leaning.x * this.tileSize : 0;
    this.leanTargetY = leaning ? leaning.y * this.tileSize : 0;

    if (sliding) {
      this.facing = Math.atan2(p.ty * sign, p.tx * sign);
      // Same reason the walking path locks it: turning mid-lower/rise would
      // restart the one-shot clip facing somewhere else.
      if (!transitioning) this.dir = directionOf(p.tx * sign, p.ty * sign);
    }

    const { nx, ny, flush } = p.surface;
    const centre = this.bodyCentre;
    // Already a signed velocity on the normal's axis: positive means "further
    // along that axis to reach the wall", which is exactly what Arcade wants.
    const pull = (flush * this.tileSize - (nx !== 0 ? centre.x : centre.y)) * PRESS_FLUSH_PULL;
    const travel = sliding ? sign * speed : 0;
    return {
      vx: p.tx * travel + (nx !== 0 ? pull : 0),
      vy: p.ty * travel + (ny !== 0 ? pull : 0),
      sliding,
    };
  }

  /**
   * Eases the lean toward this frame's target.
   *
   * Snapped to the target once inside a pixel, because {@link peeking} is a
   * boolean the HUD reads: an exponential ease alone never quite reaches zero, so
   * un-leaning would leave Rowan reading as peeking for the rest of the run.
   */
  private easeLean(dt: number): void {
    const t = Math.min(1, dt / PRESS_LEAN_SECONDS);
    this.leanX = Phaser.Math.Linear(this.leanX, this.leanTargetX, t);
    this.leanY = Phaser.Math.Linear(this.leanY, this.leanTargetY, t);
    if (Math.abs(this.leanX - this.leanTargetX) < 1) this.leanX = this.leanTargetX;
    if (Math.abs(this.leanY - this.leanTargetY) < 1) this.leanY = this.leanTargetY;
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
    const c = this.bodyCentre;
    return { x: c.x + this.leanX, y: c.y + this.leanY };
  }

  /**
   * The body's true centre, without the peek lean — what physics and every
   * sensing check answer to.
   *
   * The split between this and {@link eye} *is* the peek: leaning moves where
   * Rowan looks from without moving where he can be seen, so the darkness opens
   * around a corner while `canSense` still reads a body tucked safely behind it.
   *
   * Note there is deliberately no *visual* lean to go with it, and the obvious
   * ways to add one do not work: Arcade's `Body.preUpdate` calls
   * `updateFromGameObject()` every frame, deriving the body's position from the
   * sprite's, so nudging `sprite.x` or `body.offset` to lean the art drags the
   * body along with it — which would hand the guards exactly the exposure the
   * peek exists to avoid. The sightline opening is the feedback.
   */
  private get bodyCentre(): { x: number; y: number } {
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
  /**
   * The wall face to hold this frame, or null to move freely.
   *
   * Resolved by the scene (which owns the collision grid) and handed over as
   * plain geometry, so `Player` never queries the world itself — the same funnel
   * `escorting` above arrives through, and for the same reason: it is a
   * consequence of where Rowan is standing rather than a key someone pressed.
   */
  press: PressState | null;
  /**
   * False while there is no headroom to stand up into — squeezed under cover.
   * Holds the crouch rather than blocking the rise, so Rowan straightens up on
   * his own the moment he is clear.
   */
  canStand: boolean;
}
