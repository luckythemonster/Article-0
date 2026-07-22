import Phaser from "phaser";
import type { GameLevel, GameMap } from "../map/types";
import type { ParsedMap } from "../map/EdplayLoader";
import { SpriteAtlas } from "../map/SpriteAtlas";
import { CollisionGrid } from "../systems/CollisionGrid";
import { DetectionSystem } from "../systems/DetectionSystem";
import { AlertState } from "../systems/AlertState";
import { Player, type InputState } from "../entities/Player";
import { Enforcer } from "../entities/Enforcer";

/** Layers that hold entities/markers rather than paintable tile art. */
const ENTITY_LAYERS = new Set([
  "spawn",
  "enforcers",
  "orderlies",
  "drones",
  "security",
  "items",
]);

/**
 * The playable scene. Renders one level's tile art in board z-order, builds the
 * wall collision, spawns the player and guards, and drives the stealth systems
 * each frame.
 */
export class GameScene extends Phaser.Scene {
  private map!: GameMap;
  private level!: GameLevel;
  private tileSize = 32;

  private player!: Player;
  private enforcers: Enforcer[] = [];
  private grid!: CollisionGrid;
  private detection!: DetectionSystem;
  private alert = new AlertState();

  private keys!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    sneak: Phaser.Input.Keyboard.Key;
    run: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super("GameScene");
  }

  create(): void {
    const parsed = this.registry.get("parsedMap") as ParsedMap;
    this.map = parsed.map;
    this.tileSize = this.map.tileWidth;

    // Slice every referenced sprite rect into a named frame.
    SpriteAtlas.register(this, parsed.uniqueFrames);

    // Phase 1 plays the entry level.
    this.level = this.map.levels.find((l) => l.name === "main1") ?? this.map.levels[0];

    const worldW = this.level.width * this.tileSize;
    const worldH = this.level.height * this.tileSize;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBackgroundColor("#05070a");

    this.grid = new CollisionGrid(this.level, ["walls"]);
    this.detection = new DetectionSystem(this.level, this.tileSize);

    const wallBodies = this.renderLevel();
    this.spawnEntities();

    this.physics.add.collider(this.player.sprite, wallBodies);

    this.cameras.main.startFollow(this.player.sprite, true, 0.15, 0.15);
    this.cameras.main.setZoom(2);
    this.cameras.main.roundPixels = true;

    this.bindInput();

    // The HUD lives in a parallel, unzoomed scene so the camera zoom doesn't
    // scale it. We publish state to the registry for it to read.
    this.registry.set("alertPhase", this.alert.phase);
    this.registry.set("detection", 0);
    this.scene.launch("UIScene");
  }

  /** Draws tile-art layers in z-order and returns physics bodies for walls. */
  private renderLevel(): Phaser.GameObjects.GameObject[] {
    const half = this.tileSize / 2;
    const wallBodies: Phaser.GameObjects.GameObject[] = [];

    this.level.layers.forEach((layer, layerIndex) => {
      if (ENTITY_LAYERS.has(layer.name)) return;
      const depth = layerIndex * 10;
      for (const tile of layer.tiles) {
        if (!tile.frame) continue;
        const img = this.add
          .image(tile.x * this.tileSize + half, tile.y * this.tileSize + half, tile.frame.textureKey, tile.frame.frameKey)
          .setDepth(depth);
        if (layer.name === "walls") {
          this.physics.add.existing(img, true);
          wallBodies.push(img);
        }
      }
    });

    return wallBodies;
  }

  /** Places the player at the spawn tile and instantiates guards. */
  private spawnEntities(): void {
    const half = this.tileSize / 2;
    const spawnLayer = this.level.layers.find((l) => l.name === "spawn");
    const spawn = spawnLayer?.tiles[0];
    const px = spawn ? spawn.x * this.tileSize + half : this.level.width * half;
    const py = spawn ? spawn.y * this.tileSize + half : this.level.height * half;
    this.player = new Player(this, px, py, this.tileSize);

    const enforcerLayer = this.level.layers.find((l) => l.name === "enforcers");
    if (enforcerLayer) {
      for (const t of enforcerLayer.tiles) {
        this.enforcers.push(new Enforcer(this, t.x, t.y, this.tileSize, t.components));
      }
    }
  }

  private bindInput(): void {
    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      sneak: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      run: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };
  }

  private readInput(): InputState {
    const k = this.keys;
    return {
      up: k.up.isDown || k.w.isDown,
      down: k.down.isDown || k.s.isDown,
      left: k.left.isDown || k.a.isDown,
      right: k.right.isDown || k.d.isDown,
      sneak: k.sneak.isDown,
      run: k.run.isDown,
    };
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.player.update(this.readInput(), dt);

    let maxDetection = 0;
    const ctx = {
      grid: this.grid,
      tileSize: this.tileSize,
      player: { x: this.player.x, y: this.player.y },
      lightMultiplierAt: (x: number, y: number) => this.detection.multiplierAt(x, y),
      playerNoise: this.player.noise,
      alert: this.alert,
    };
    for (const e of this.enforcers) {
      e.update(dt, ctx);
      maxDetection = Math.max(maxDetection, e.detection);
    }

    this.alert.update(dt);
    this.registry.set("alertPhase", this.alert.phase);
    this.registry.set("detection", this.alert.phase === "ALERT" ? 1 : maxDetection);
  }
}
