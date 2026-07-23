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
import { Drone } from "../entities/Drone";
import { Orderly } from "../entities/Orderly";
import { Door } from "../entities/Door";
import { Terminal } from "../entities/Terminal";
import { Laser } from "../entities/Laser";
import { Sensor } from "../entities/Sensor";
import { Chest } from "../entities/Chest";
import { buildAlertNetworkSnapshot } from "../systems/AlertNetwork";
import { Lighting } from "../ui/Lighting";
import { setMode, type GameMode } from "../systems/GameState";
import { PLAYER_DEFAULTS } from "../systems/EntityStats";
import { initialObjectives, isRunWon, noteTerminalHacked, type ObjectiveState } from "../systems/Objectives";
import { getAudio } from "../systems/AudioDirector";
import { saveGame, clearSave } from "../systems/SaveGame";

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
  "doors",
  "terminals",
  "lasers",
]);

/** How close (in tiles) the player must be to interact with a door/terminal. */
const INTERACT_RANGE = 1.4;

/** Radius (tiles) around a hacked terminal whose doors it releases. */
const HACK_UNLOCK_RADIUS = 6;

/** Radius (tiles) a spotted orderly's alarm carries to nearby guards. */
const ORDERLY_ALERT_RADIUS_TILES = 6;

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
  private drones: Drone[] = [];
  private orderlies: Orderly[] = [];
  private doors: Door[] = [];
  private terminals: Terminal[] = [];
  private lasers: Laser[] = [];
  private sensors: Sensor[] = [];
  private chests: Chest[] = [];
  private lighting!: Lighting;
  private grid!: CollisionGrid;
  private detection!: DetectionSystem;
  private alert = new AlertState();
  private transitions!: TransitionGraph;

  /** Where this scene run should start (level + optional arrival tile). */
  private levelName = "main1";
  private arriveTile?: { x: number; y: number };
  /** A fade + level swap is in flight; input and further triggers are ignored. */
  private transitioning = false;
  /** True while paused: the PauseScene overlay is shown and the sim is frozen. */
  private paused = false;
  /** Seconds the player has been cornered by a silicate during a full alert. */
  private captureProgress = 0;
  /** True while the in-game codec overlay is open (sim frozen). */
  private codecOpen = false;
  /** Mission progress (kept in the registry so it survives level swaps). */
  private objectives!: ObjectiveState;
  /**
   * A walk-over transition can only fire once the player has stepped off every
   * transition tile since arriving — otherwise you'd bounce straight back.
   */
  private transitionArmed = false;
  private prompt!: Phaser.GameObjects.Text;
  private hidden!: Phaser.GameObjects.Text;

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
    pause: Phaser.Input.Keyboard.Key;
    abort: Phaser.Input.Keyboard.Key;
    codec: Phaser.Input.Keyboard.Key;
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
    this.drones = [];
    this.orderlies = [];
    this.doors = [];
    this.terminals = [];
    this.lasers = [];
    this.sensors = [];
    this.chests = [];
    this.alert = new AlertState();
    this.transitioning = false;
    this.paused = false;
    this.captureProgress = 0;
    this.codecOpen = false;
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
    const doorBodies = this.spawnInteractables();

    this.physics.add.collider(this.player.sprite, wallBodies);
    this.physics.add.collider(this.player.sprite, doorBodies);

    // Darken the level and light it from the `light_sources` — shares the same
    // data DetectionSystem uses, so lit spots are visibly and mechanically hot.
    this.lighting = new Lighting(this, this.level, this.tileSize);

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

    // "HIDDEN" marker shown over the player while concealed in cover.
    this.hidden = this.add
      .text(0, 0, "HIDDEN", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#8effc0",
        fontStyle: "bold",
        backgroundColor: "#0a0f16cc",
        padding: { x: 3, y: 1 },
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
    // Bio-integrity carries across level transitions / a loaded save via the
    // registry; a fresh run (resetRun cleared it) starts at full.
    const carriedHp = this.registry.get("playerHp") as number | undefined;
    if (carriedHp !== undefined) this.player.hp = carriedHp;
    this.registry.set("playerHp", this.player.hp);
    this.registry.set("playerMaxHp", this.player.maxHp);
    setMode(this.registry, "PLAYING");
    this.objectives =
      (this.registry.get("objectives") as ObjectiveState | undefined) ?? initialObjectives();
    this.registry.set("objectives", this.objectives);
    this.registry.set("currentLevel", this.level.name);
    // Inventory persists across level transitions (registry survives restarts).
    if (!this.registry.has("inventory")) this.registry.set("inventory", []);
    if (!this.scene.isActive("UIScene")) this.scene.launch("UIScene");

    this.saveCheckpoint();
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

    const droneLayer = this.level.layers.find((l) => l.name === "drones");
    if (droneLayer) {
      for (const t of droneLayer.tiles) {
        this.drones.push(new Drone(this, t.x, t.y, this.tileSize, t.components));
      }
    }

    const orderlyLayer = this.level.layers.find((l) => l.name === "orderlies");
    if (orderlyLayer) {
      for (const t of orderlyLayer.tiles) {
        this.orderlies.push(new Orderly(this, t.x, t.y, this.tileSize));
      }
    }
  }

  /**
   * Instantiates doors and terminals from their layers. Doors register their
   * closed cells on the collision grid (built just before this) and expose an
   * Arcade body for player collision; those bodies are returned so the scene can
   * add them to the player collider.
   */
  private spawnInteractables(): Phaser.GameObjects.GameObject[] {
    const doorBodies: Phaser.GameObjects.GameObject[] = [];

    const doorLayer = this.level.layers.find((l) => l.name === "doors");
    if (doorLayer) {
      for (const t of doorLayer.tiles) {
        // Only tiles carrying a `door` component are real doors; the board can
        // also hold stray art. Laser tiles are handled below as Laser hazards;
        // anything else non-door stays decorative.
        if (!t.components.some((c) => c.type === "door")) {
          if (t.frame && !t.ref.toLowerCase().includes("laser")) {
            this.add
              .image(t.x * this.tileSize + this.tileSize / 2, t.y * this.tileSize + this.tileSize / 2, t.frame.textureKey, t.frame.frameKey)
              .setDepth(120);
          }
          continue;
        }
        const door = new Door(this, t, this.tileSize, this.grid);
        this.doors.push(door);
        if (door.body) doorBodies.push(door.body);
      }
    }

    const terminalLayer = this.level.layers.find((l) => l.name === "terminals");
    if (terminalLayer) {
      for (const t of terminalLayer.tiles) {
        if (!t.components.some((c) => c.type === "terminal")) continue;
        this.terminals.push(new Terminal(this, t, this.tileSize));
      }
    }

    // Sensor cameras: the `security` board holds fixed optical cameras (its
    // tiles use a laser-ref sprite but are reinterpreted as cameras here).
    const securityLayer = this.level.layers.find((l) => l.name === "security");
    if (securityLayer) {
      for (const t of securityLayer.tiles) {
        this.sensors.push(new Sensor(this, t, this.tileSize, this.grid));
      }
    }

    // Chests: the `items` board holds searchable supply containers.
    const itemLayer = this.level.layers.find((l) => l.name === "items");
    if (itemLayer) {
      for (const t of itemLayer.tiles) {
        if (!t.components.some((c) => c.type === "chest")) continue;
        this.chests.push(new Chest(this, t, this.tileSize));
      }
    }

    // Lasers can sit on several boards (a dedicated `lasers` board in main1, a
    // stray tile on the `doors` board in main2), so gather them by ref across
    // all layers rather than a single board. The `security` board is skipped —
    // its laser-ref tiles are cameras, spawned above.
    for (const layer of this.level.layers) {
      if (layer.name === "security") continue;
      for (const t of layer.tiles) {
        if (t.ref.toLowerCase().includes("laser")) {
          this.lasers.push(new Laser(this, t, this.tileSize));
        }
      }
    }

    return doorBodies;
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
      pause: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      abort: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      codec: kb.addKey(Phaser.Input.Keyboard.KeyCodes.C),
    };
  }

  /** Toggles the pause overlay and freezes/thaws the arcade sim. */
  private setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    if (p) {
      this.physics.pause();
      this.scene.launch("PauseScene");
    } else {
      this.scene.stop("PauseScene");
      this.physics.resume();
    }
  }

  /** Toggles the in-game codec overlay, freezing/thawing the sim behind it. */
  private setCodecOpen(open: boolean): void {
    if (open === this.codecOpen) return;
    this.codecOpen = open;
    if (open) {
      this.physics.pause();
      this.scene.launch("CodecScene", { interactive: false });
    } else {
      this.scene.stop("CodecScene");
      this.physics.resume();
    }
  }

  /** Abandons the run from the pause overlay and returns to the title. */
  private abortToTitle(): void {
    this.setPaused(false);
    getAudio().setMood("none");
    setMode(this.registry, "TITLE");
    this.scene.stop("UIScene");
    this.scene.start("TitleScene");
    this.scene.stop();
  }

  /** Ends the run: stops play + HUD and shows the outcome scene. */
  private endRun(mode: GameMode, sceneKey: string): void {
    setMode(this.registry, mode);
    getAudio().setMood("none");
    if (mode === "ALIGNED") getAudio().capture();
    else if (mode === "LATTICE") {
      getAudio().victory();
      clearSave();
    }
    this.player.sprite.setVelocity(0, 0);
    this.physics.pause();
    this.scene.stop("UIScene");
    this.scene.launch(sceneKey);
    this.scene.stop();
  }

  /** True when a guard is close enough, with clear sight, to seize the player. */
  private isCornering(e: Enforcer): boolean {
    const d = Math.hypot(e.position.x - this.player.x, e.position.y - this.player.y);
    if (d > PLAYER_DEFAULTS.captureRadius * this.tileSize) return false;
    return this.grid.hasLineOfSight(
      e.position.x / this.tileSize,
      e.position.y / this.tileSize,
      this.player.x / this.tileSize,
      this.player.y / this.tileSize,
    );
  }

  /** Writes a resume checkpoint on entry to this level. */
  private saveCheckpoint(): void {
    saveGame({
      level: this.level.name,
      tileX: Math.floor(this.player.x / this.tileSize),
      tileY: Math.floor(this.player.y / this.tileSize),
      hp: this.player.hp,
      inventory: (this.registry.get("inventory") as string[] | undefined) ?? [],
      objectives: this.objectives,
    });
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

    // Pause (Esc) and the codec (C) each freeze the sim behind an overlay scene.
    if (!this.codecOpen && Phaser.Input.Keyboard.JustDown(this.keys.pause)) this.setPaused(!this.paused);
    if (!this.paused && Phaser.Input.Keyboard.JustDown(this.keys.codec)) this.setCodecOpen(!this.codecOpen);
    if (this.paused || this.codecOpen) {
      this.player.sprite.setVelocity(0, 0);
      if (this.paused && Phaser.Input.Keyboard.JustDown(this.keys.abort)) this.abortToTitle();
      return;
    }

    this.player.update(this.readInput(), dt);
    this.lighting.update(dt);
    this.updateInteractions(dt);

    // Cover concealment: crouched on LOW cover (or on any HIGH cover) hides the
    // player from vision cones entirely.
    const cover = this.detection.coverTypeAt(this.player.x, this.player.y);
    const concealed = cover === "high" || (cover === "low" && this.player.crouched);
    // Thermal sees through cover that leaks heat (ThermalBleed); the map's cover
    // all blocks heat, so concealment normally hides from thermal too.
    const thermalConcealed =
      concealed && !this.detection.thermalBleedAt(this.player.x, this.player.y);
    this.updateHiddenMarker(concealed);

    const phaseBefore = this.alert.phase;
    let maxDetection = 0;
    const ctx = {
      grid: this.grid,
      tileSize: this.tileSize,
      player: { x: this.player.x, y: this.player.y },
      lightMultiplierAt: (x: number, y: number) => this.detection.multiplierAt(x, y),
      playerNoise: this.player.noise,
      playerConcealed: concealed,
      playerThermalConcealed: thermalConcealed,
      alert: this.alert,
    };
    for (const e of this.guards()) {
      const before = e.detection;
      e.update(dt, ctx);
      maxDetection = Math.max(maxDetection, e.detection);
      // A fresh full sighting alerts networked guards within reach.
      if (before < 1 && e.detection >= 1) {
        this.emitNetworkAlert(e.position, e.stats.alertNetworkRadius);
      }
    }

    // Sensor cameras run on the same context, reporting sightings themselves.
    for (const s of this.sensors) {
      const before = s.detection;
      s.update(dt, ctx);
      maxDetection = Math.max(maxDetection, s.detection);
      if (before < 1 && s.detection >= 1) {
        this.emitNetworkAlert(s.position, s.stats.alertNetworkRadius);
      }
    }

    // Orderlies: bystanders, not guards — a clear sighting is a one-shot
    // "witness" event that raises nearby guards' suspicion, same as a noisy door.
    for (const orderly of this.orderlies) {
      if (orderly.update(dt, { grid: this.grid, tileSize: this.tileSize, player: ctx.player, playerConcealed: concealed })) {
        this.emitOrderlyAlert(orderly);
      }
    }

    // Lasers: crossing an active beam/scan zone instantly trips the alarm.
    let laserTripped = false;
    for (const laser of this.lasers) {
      laser.update(dt);
      if (laser.checkTrip(this.player.x, this.player.y)) laserTripped = true;
    }
    if (laserTripped) {
      this.alert.reportSighting(
        Math.floor(this.player.x / this.tileSize),
        Math.floor(this.player.y / this.tileSize),
      );
      this.cameras.main.flash(220, 150, 20, 20);
      this.player.takeDamage(PLAYER_DEFAULTS.hazardDamage);
    }

    this.alert.update(dt);
    if (this.alert.phase === "ALERT" && phaseBefore !== "ALERT") getAudio().ping();
    getAudio().setMood(
      this.alert.phase === "ALERT" ? "alert" : this.alert.phase === "EVASION" ? "search" : "calm",
    );
    this.registry.set("alertPhase", this.alert.phase);
    this.registry.set("detection", this.alert.phase === "ALERT" ? 1 : maxDetection);
    this.registry.set("playerHp", this.player.hp);

    // Fail-state — bio-integrity depleted, or cornered by a silicate during a
    // full alert: the mesh prunes Rowan's logs (Alignment).
    const cornered = this.alert.isCombatAware && this.guards().some((e) => this.isCornering(e));
    this.captureProgress = cornered
      ? this.captureProgress + dt
      : Math.max(0, this.captureProgress - dt * 2);
    if (!this.player.alive || this.captureProgress >= PLAYER_DEFAULTS.captureTime) {
      this.endRun("ALIGNED", "GameOverScene");
      return;
    }
    // Win — logs recovered and Rowan has reached the Lattice uplink deck.
    if (isRunWon(this.objectives, this.level.name)) {
      this.endRun("LATTICE", "VictoryScene");
      return;
    }

    this.registry.set(
      "alertNetwork",
      buildAlertNetworkSnapshot(
        [
          ...this.guards().map((e) => ({ detection: e.detection, mobile: true })),
          ...this.sensors.map((s) => ({ detection: s.detection, mobile: false })),
        ],
        this.alert,
      ),
    );

    this.registry.set(
      "radar",
      buildRadarSnapshot(
        this.grid,
        this.tileSize,
        { x: this.player.x, y: this.player.y, facing: this.player.facing },
        [
          ...this.guards().map((e) => ({
            position: e.position,
            facing: e.facing,
            detection: e.detection,
          })),
          ...this.sensors.map((s) => ({
            position: s.position,
            facing: s.facing,
            detection: s.detection,
          })),
        ],
        this.alert.phase === "ALERT",
      ),
    );
  }

  /**
   * Unified interact (`E`) handling for the frame: level transitions (stairs
   * auto-trigger; hatches/ladders on tap), doors (tap to open/close), and
   * terminals (hold to hack). A single nearest-target prompt is shown. Stairs
   * and hatches are "armed" only after the player steps off the tile they
   * arrived on, so a swap never bounces straight back.
   */
  private updateInteractions(dt: number): void {
    const ts = this.tileSize;
    const ptx = this.player.x / ts;
    const pty = this.player.y / ts;

    // --- Transitions ---
    const tr = this.transitions.at(this.level.name, Math.floor(ptx), Math.floor(pty));
    if (!tr) this.transitionArmed = true;
    if (tr && tr.kind === "stairs" && this.transitionArmed) {
      this.beginTransition(tr);
      return;
    }
    const hatch =
      tr && tr.kind === "maintenance_access" && this.transitionArmed ? tr : undefined;

    const interactDown = this.keys.interact.isDown;
    const interactJust = Phaser.Input.Keyboard.JustDown(this.keys.interact);

    // --- Terminals (hold E) ---
    let nearestTerminal: Terminal | undefined;
    let nearestTerminalDist = Infinity;
    for (const term of this.terminals) {
      if (term.isHacked) continue;
      const d = Math.hypot(term.x / ts - ptx, term.y / ts - pty);
      if (d <= INTERACT_RANGE && d < nearestTerminalDist) {
        nearestTerminalDist = d;
        nearestTerminal = term;
      }
    }
    const hacking = !!nearestTerminal && interactDown;
    if (hacking && nearestTerminal!.hack(dt)) this.applyHack(nearestTerminal!);
    for (const term of this.terminals) {
      if (term !== nearestTerminal || !interactDown) term.idle(dt);
    }

    // --- Chests (hold E to search) ---
    let nearestChest: Chest | undefined;
    let nearestChestDist = Infinity;
    for (const chest of this.chests) {
      if (chest.isOpen) continue;
      const d = Math.hypot(chest.tileX + 0.5 - ptx, chest.tileY + 0.5 - pty);
      if (d <= INTERACT_RANGE && d < nearestChestDist) {
        nearestChestDist = d;
        nearestChest = chest;
      }
    }
    const searching = !!nearestChest && interactDown && !hacking;
    if (searching && nearestChest!.open(dt)) this.collectChest(nearestChest!);
    for (const chest of this.chests) {
      if (chest !== nearestChest || !interactDown || hacking) chest.idle(dt);
    }

    // --- Doors (tap E) ---
    let nearestDoor: Door | undefined;
    let nearestDoorDist = Infinity;
    for (const door of this.doors) {
      if (!door.isManual) continue;
      const d = Math.hypot(door.tileX + 0.5 - ptx, door.tileY + 0.5 - pty);
      if (d <= INTERACT_RANGE && d < nearestDoorDist) {
        nearestDoorDist = d;
        nearestDoor = door;
      }
    }

    // A tap not consumed by a hack opens/closes a door, or uses a hatch —
    // whichever is nearer (a hatch you're standing on always wins).
    if (!hacking && interactJust) {
      const hatchDist = hatch ? 0.2 : Infinity;
      if (nearestDoor && nearestDoorDist <= hatchDist) {
        if (nearestDoor.toggle()) {
          getAudio().door();
          if (nearestDoor.isOpen) this.emitDoorNoise(nearestDoor);
        }
      } else if (hatch) {
        this.beginTransition(hatch);
        return;
      }
    }

    this.showPrompt(
      nearestTerminal,
      nearestTerminalDist,
      nearestDoor,
      nearestDoorDist,
      hatch !== undefined,
      nearestChest,
      nearestChestDist,
    );
  }

  /** Shows a single `[E] …` hint over the player for the nearest interactable. */
  /** Floats the "HIDDEN" marker over the player while concealed in cover. */
  private updateHiddenMarker(concealed: boolean): void {
    if (concealed) {
      this.hidden.setPosition(this.player.x, this.player.y - this.tileSize * 0.9);
      this.hidden.setVisible(true);
    } else {
      this.hidden.setVisible(false);
    }
  }

  private showPrompt(
    terminal: Terminal | undefined,
    terminalDist: number,
    door: Door | undefined,
    doorDist: number,
    hatch: boolean,
    chest: Chest | undefined,
    chestDist: number,
  ): void {
    let label: string | undefined;
    let best = Infinity;
    if (terminal && terminalDist < best) {
      best = terminalDist;
      label = "[E] Hack";
    }
    if (chest && chestDist < best) {
      best = chestDist;
      label = "[E] Search";
    }
    if (door && doorDist < best) {
      best = doorDist;
      label = door.isOpen ? "[E] Close" : "[E] Open";
    }
    if (hatch && 0.2 < best) {
      label = "[E] Use access";
    }

    if (label) {
      this.prompt.setText(label);
      this.prompt.setPosition(this.player.x, this.player.y - this.tileSize * 0.9);
      this.prompt.setVisible(true);
    } else {
      this.prompt.setVisible(false);
    }
  }

  /** A completed hack releases every door within {@link HACK_UNLOCK_RADIUS}. */
  private applyHack(terminal: Terminal): void {
    const tx = terminal.x / this.tileSize;
    const ty = terminal.y / this.tileSize;
    for (const door of this.doors) {
      const d = Math.hypot(door.tileX + 0.5 - tx, door.tileY + 0.5 - ty);
      if (d <= HACK_UNLOCK_RADIUS && door.setOpen(true)) this.emitDoorNoise(door);
    }
    getAudio().hack();
    // Breaching a log-cache terminal recovers EIRA-7's logs (mission objective).
    noteTerminalHacked(this.objectives, terminal.stats.type);
    this.registry.set("objectives", this.objectives);
  }

  /** Every guard-type unit — enforcers and drones share identical AI/hearNoise. */
  private guards(): Enforcer[] {
    return [...this.enforcers, ...this.drones];
  }

  /** A door operating emits noise: nearby guards turn to look and grow wary. */
  private emitDoorNoise(door: Door): void {
    this.emitNoiseAt((door.tileX + 0.5) * this.tileSize, (door.tileY + 0.5) * this.tileSize, door.stats.operationNoise * this.tileSize);
  }

  /** A spotted orderly raises the alarm: nearby guards turn to look and grow wary. */
  private emitOrderlyAlert(orderly: Orderly): void {
    this.emitNoiseAt(orderly.position.x, orderly.position.y, ORDERLY_ALERT_RADIUS_TILES * this.tileSize);
  }

  private emitNoiseAt(cx: number, cy: number, radiusPx: number): void {
    if (radiusPx <= 0) return;
    for (const e of this.guards()) {
      const d = Math.hypot(e.position.x - cx, e.position.y - cy);
      if (d < radiusPx) e.hearNoise(1 - d / radiusPx, cx, cy);
    }
  }

  /**
   * A confirmed sighting propagates through the alert network: every guard
   * within the spotter's {@link EnforcerStats.alertNetworkRadius} snaps to look
   * toward the player and grows wary, so a camera or a distant guard tripping
   * the alarm immediately rallies the ones nearby.
   */
  private emitNetworkAlert(origin: { x: number; y: number }, radiusTiles: number): void {
    const radiusPx = radiusTiles * this.tileSize;
    if (radiusPx <= 0) return;
    for (const e of this.guards()) {
      const ep = e.position;
      if (ep.x === origin.x && ep.y === origin.y) continue; // skip the spotter itself
      if (Math.hypot(ep.x - origin.x, ep.y - origin.y) < radiusPx) {
        e.hearNoise(1, this.player.x, this.player.y);
      }
    }
  }

  /** Empties a searched chest into the persistent inventory and pings guards. */
  private collectChest(chest: Chest): void {
    const inv = (this.registry.get("inventory") as string[] | undefined) ?? [];
    inv.push(...chest.take());
    this.registry.set("inventory", inv);
    this.emitNoiseAt(chest.x, chest.y, chest.stats.noiseOnOpen * this.tileSize);
    getAudio().pickup();
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
