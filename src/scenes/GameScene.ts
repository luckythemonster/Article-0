import Phaser from "phaser";
import type { GameLevel, GameMap, Transition } from "../map/types";
import type { ParsedMap } from "../map/EdplayLoader";
import { SpriteAtlas } from "../map/SpriteAtlas";
import { CollisionGrid } from "../systems/CollisionGrid";
import { DetectionSystem } from "../systems/DetectionSystem";
import { AlertState } from "../systems/AlertState";
import { TransitionGraph } from "../systems/TransitionGraph";
import { buildRadarSnapshot } from "../systems/Radar";
import { Player, type InputState } from "../entities/Player";
import { Enforcer } from "../entities/Enforcer";

/** Data passed to {@link GameScene} when (re)starting for a level swap. */
interface GameSceneData {
  level?: string;
  arriveX?: number;
  arriveY?: number;
}

/** Screen-fade duration for a level transition, in ms. */
const FADE_MS = 320;

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
  private transitions!: TransitionGraph;

  /** Where this scene run should start (level + optional arrival tile). */
  private levelName = "main1";
  private arriveTile?: { x: number; y: number };
  /** A fade + level swap is in flight; input and further triggers are ignored. */
  private transitioning = false;
  /**
   * A walk-over transition can only fire once the player has stepped off every
   * transition tile since arriving — otherwise you'd bounce straight back.
   */
  private transitionArmed = false;
  private prompt!: Phaser.GameObjects.Text;

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
    interact: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super("GameScene");
  }

  init(data: GameSceneData): void {
    this.levelName = data.level ?? "main1";
    this.arriveTile =
      data.arriveX !== undefined && data.arriveY !== undefined
        ? { x: data.arriveX, y: data.arriveY }
        : undefined;
  }

  create(): void {
    const parsed = this.registry.get("parsedMap") as ParsedMap;
    this.map = parsed.map;
    this.tileSize = this.map.tileWidth;

    // Reset per-run state: class-field initializers don't re-run on restart.
    this.enforcers = [];
    this.alert = new AlertState();
    this.transitioning = false;
    // Arm only after stepping off the arrival tile (see update()).
    this.transitionArmed = false;

    // Slice every referenced sprite rect into a named frame.
    SpriteAtlas.register(this, parsed.uniqueFrames);

    // The connection graph is map-wide and immutable; build it once and cache.
    this.transitions =
      (this.registry.get("transitionGraph") as TransitionGraph | undefined) ??
      new TransitionGraph(this.map);
    this.registry.set("transitionGraph", this.transitions);

    this.level =
      this.map.levels.find((l) => l.name === this.levelName) ?? this.map.levels[0];

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

    // Interact prompt for hatches/ladders: a small world-space hint floated
    // above the player (same approach as the Enforcer's "!" marker), so the
    // camera zoom/follow keeps it legible without screen-anchor math.
    this.prompt = this.add
      .text(0, 0, "[E] Use access", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#cfe8ff",
        backgroundColor: "#0a0f16cc",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(1000)
      .setVisible(false);

    // Fade in from black (also covers arrivals from a transition).
    this.cameras.main.fadeIn(FADE_MS, 5, 7, 10);

    // The HUD lives in a parallel, unzoomed scene so the camera zoom doesn't
    // scale it. We publish state to the registry for it to read.
    this.registry.set("alertPhase", this.alert.phase);
    this.registry.set("detection", 0);
    if (!this.scene.isActive("UIScene")) this.scene.launch("UIScene");
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

  /** Places the player at the arrival/spawn tile and instantiates guards. */
  private spawnEntities(): void {
    const half = this.tileSize / 2;
    // Arriving via a transition overrides the level's own spawn point.
    const spawnLayer = this.level.layers.find((l) => l.name === "spawn");
    const spawn = spawnLayer?.tiles[0];
    const tile = this.arriveTile ?? spawn;
    const px = tile ? tile.x * this.tileSize + half : this.level.width * half;
    const py = tile ? tile.y * this.tileSize + half : this.level.height * half;
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
      interact: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
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
    // Freeze the player and skip everything while a fade/level-swap is running.
    if (this.transitioning) {
      this.player.sprite.setVelocity(0, 0);
      return;
    }

    this.player.update(this.readInput(), dt);
    this.checkTransitions();

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

    this.registry.set(
      "radar",
      buildRadarSnapshot(
        this.grid,
        this.tileSize,
        { x: this.player.x, y: this.player.y, facing: this.player.facing },
        this.enforcers.map((e) => ({
          position: e.position,
          facing: e.facing,
          detection: e.detection,
        })),
        this.alert.phase === "ALERT",
      ),
    );
  }

  /**
   * Detects when the player is on a transition tile and fires the level swap:
   * stairs trigger by walking over (once armed), hatches/ladders on the
   * interact key. Either way the tile is "armed" only after the player has
   * stepped off the one they arrived on, so a swap never bounces straight back.
   */
  private checkTransitions(): void {
    const tx = Math.floor(this.player.x / this.tileSize);
    const ty = Math.floor(this.player.y / this.tileSize);
    const tr = this.transitions.at(this.level.name, tx, ty);

    // Off any transition tile → clear to trigger the next one we step onto.
    if (!tr) this.transitionArmed = true;

    const onMaintenance = tr?.kind === "maintenance_access" && this.transitionArmed;
    if (onMaintenance) {
      this.prompt.setPosition(this.player.x, this.player.y - this.tileSize * 0.9);
    }
    this.prompt.setVisible(onMaintenance);

    if (!tr || !this.transitionArmed) return;
    if (tr.kind === "stairs") {
      this.beginTransition(tr);
    } else if (Phaser.Input.Keyboard.JustDown(this.keys.interact)) {
      this.beginTransition(tr);
    }
  }

  /** Fades to black, then restarts this scene on the destination level/tile. */
  private beginTransition(tr: Transition): void {
    this.transitioning = true;
    this.prompt.setVisible(false);
    this.player.sprite.setVelocity(0, 0);
    this.cameras.main.fadeOut(FADE_MS, 5, 7, 10);
    this.cameras.main.once(
      Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => {
        this.scene.restart({ level: tr.toLevel, arriveX: tr.toX, arriveY: tr.toY });
      },
    );
  }
}
