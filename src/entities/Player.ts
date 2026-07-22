import Phaser from "phaser";

/**
 * The player-controlled infiltrator.
 *
 * Free 8-directional movement via an arcade-physics body, with a run/sneak
 * modifier. Sneaking (Shift) halves speed and noise; running is faster but
 * noisier — noise feeds the detection system in later phases. Facing direction
 * is tracked for interactions and for the noise/vision model.
 *
 * The map has no dedicated protagonist sprite, so we draw a generated marker
 * (a body disc plus a facing wedge) that reads clearly against the tile art.
 */
export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  /** Facing angle in radians; updated as the player moves. */
  facing = -Math.PI / 2; // start facing "up"
  private readonly walkSpeed: number;
  private readonly facingGfx: Phaser.GameObjects.Triangle;

  constructor(scene: Phaser.Scene, x: number, y: number, tileSize: number) {
    this.walkSpeed = tileSize * 3.2; // px/sec baseline

    const key = Player.ensureTexture(scene, tileSize);
    this.sprite = scene.physics.add.sprite(x, y, key);
    this.sprite.setDepth(500);
    // A body a bit smaller than a tile so the agent slips through 1-wide gaps.
    const bodySize = Math.floor(tileSize * 0.6);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setSize(bodySize, bodySize);
    this.sprite.setCollideWorldBounds(true);

    // A small wedge showing facing, drawn over the body.
    this.facingGfx = scene.add
      .triangle(x, y, 0, -tileSize * 0.5, -tileSize * 0.18, -tileSize * 0.2, tileSize * 0.18, -tileSize * 0.2, 0xffffff)
      .setDepth(501);
  }

  /** How loud the player currently is (0..1), from movement + stance. */
  noise = 0;

  update(cursors: InputState, dt: number): void {
    let vx = 0;
    let vy = 0;
    if (cursors.left) vx -= 1;
    if (cursors.right) vx += 1;
    if (cursors.up) vy -= 1;
    if (cursors.down) vy += 1;

    const moving = vx !== 0 || vy !== 0;
    const stanceMul = cursors.sneak ? 0.45 : cursors.run ? 1.6 : 1;
    const speed = this.walkSpeed * stanceMul;

    if (moving) {
      const len = Math.hypot(vx, vy);
      vx = (vx / len) * speed;
      vy = (vy / len) * speed;
      this.facing = Math.atan2(vy, vx);
    }
    this.sprite.setVelocity(vx, vy);

    // Noise: still = silent, sneak = low, walk = medium, run = high.
    const target = !moving ? 0 : cursors.sneak ? 0.15 : cursors.run ? 1 : 0.5;
    this.noise = Phaser.Math.Linear(this.noise, target, Math.min(1, dt * 6));

    // Keep the facing wedge glued to the body and pointed along `facing`.
    this.facingGfx.setPosition(this.sprite.x, this.sprite.y);
    this.facingGfx.setRotation(this.facing + Math.PI / 2);
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }

  /** Builds (once) the generated player body texture. */
  private static ensureTexture(scene: Phaser.Scene, tileSize: number): string {
    const key = "player-marker";
    if (scene.textures.exists(key)) return key;
    const g = scene.make.graphics({ x: 0, y: 0 });
    const r = Math.floor(tileSize * 0.34);
    const c = tileSize / 2;
    g.fillStyle(0x0a0a0a, 1);
    g.fillCircle(c, c, r + 2);
    g.fillStyle(0x39d3ff, 1); // cyan infiltrator
    g.fillCircle(c, c, r);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(c, c, Math.max(2, r - 5));
    g.generateTexture(key, tileSize, tileSize);
    g.destroy();
    return key;
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
