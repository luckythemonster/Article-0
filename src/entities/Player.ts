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
export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  /** Facing angle in radians; updated as the player moves. */
  facing = -Math.PI / 2; // start facing "up"
  private readonly walkSpeed: number;
  private dir: PlayerAnimDir = "south";
  private currentAnim: PlayerAnimName = "idle";

  constructor(scene: Phaser.Scene, x: number, y: number, tileSize: number) {
    this.walkSpeed = tileSize * 3.2; // px/sec baseline

    Player.ensureAnimations(scene);

    this.sprite = scene.physics.add.sprite(x, y, playerFrameKey("idle", "south", 0));
    this.sprite.setDepth(500);

    // Scale the 64x64 art to read well against 32px tiles, then size the
    // collision body in the sprite's *unscaled* local space (Arcade Body
    // convention) so it roughly covers the torso rather than the padded frame.
    const displaySize = tileSize * 1.3;
    const scale = displaySize / 64;
    this.sprite.setScale(scale);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(26, 30);
    this.sprite.setCollideWorldBounds(true);

    this.sprite.play(playerAnimKey("idle", "south"));
  }

  /** How loud the player currently is (0..1), from movement + stance. */
  noise = 0;

  /** True while the crouch (Shift/sneak) input is held — moving or still. */
  crouched = false;

  update(cursors: InputState, dt: number): void {
    let vx = 0;
    let vy = 0;
    if (cursors.left) vx -= 1;
    if (cursors.right) vx += 1;
    if (cursors.up) vy -= 1;
    if (cursors.down) vy += 1;

    const moving = vx !== 0 || vy !== 0;
    const sneaking = cursors.sneak && moving;
    const running = cursors.run && moving && !cursors.sneak;
    this.crouched = cursors.sneak;
    const stanceMul = sneaking ? 0.45 : running ? 1.6 : 1;
    const speed = this.walkSpeed * stanceMul;

    if (moving) {
      const len = Math.hypot(vx, vy);
      vx = (vx / len) * speed;
      vy = (vy / len) * speed;
      this.facing = Math.atan2(vy, vx);
      this.dir = nearestDirection(vx, vy);
    }
    this.sprite.setVelocity(vx, vy);

    // Noise: still = silent, sneak = low, walk = medium, run = high.
    const target = !moving ? 0 : sneaking ? 0.15 : running ? 1 : 0.5;
    this.noise = Phaser.Math.Linear(this.noise, target, Math.min(1, dt * 6));

    // Crouch pose whenever sneaking — including standing still behind cover.
    const anim: PlayerAnimName = !moving
      ? this.crouched
        ? "crouch"
        : "idle"
      : sneaking
        ? "crouch"
        : running
          ? "run"
          : "walk";
    this.setAnimation(anim, this.dir);
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
      for (const dir of PLAYER_ANIM_DIRS) {
        const key = playerAnimKey(anim, dir);
        if (scene.anims.exists(key)) continue;
        scene.anims.create({
          key,
          frames: Array.from({ length: frameCount }, (_, i) => ({
            key: playerFrameKey(anim, dir, i),
          })),
          frameRate,
          repeat: -1,
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
