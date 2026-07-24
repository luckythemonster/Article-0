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
import {
  BATTERY_ITEM,
  CERT_ITEM,
  CHAFF_PACK_ITEM,
  countConsumables,
  FLASHLIGHT_DETECTION_MULTIPLIER,
  isConsumable,
  MAX_CONSUMABLES,
  PLAYER_DEFAULTS,
  RATION_HEAL,
  RATION_PACK_ITEM,
  STUN_ROUND_DURATION,
  STUN_ROUND_NOISE,
  STUN_ROUND_REACH_TILES,
  STUN_ROUNDS_ITEM,
  THERMAL_GEL_ITEM,
  VENT4_DEFAULTS,
} from "../systems/EntityStats";
import {
  ActiveItemState,
  CHAFF_PACK_DURATION,
  CHAFF_PACK_RADIUS_TILES,
  type ActiveItemsView,
} from "../systems/ActiveItems";
import { pickQualiaRackIndex, QUALIA_RACK_TERMINAL_TYPE } from "../systems/QualiaLock";
import {
  initialObjectives,
  isRunWon,
  LOG_CACHE_TYPE,
  noteTerminalHacked,
  noteVent4Defeated,
  type ObjectiveState,
} from "../systems/Objectives";
import { Vent4Boss, type Vent4InteractResult } from "../entities/Vent4Boss";
import { Vent4State, type Vent4Snapshot, type Vent4Transition } from "../systems/Vent4Core";
import { VENT_CORE_LEVEL } from "../map/VentCoreLevel";
import { getAudio } from "../systems/AudioDirector";
import { saveGame, clearSave } from "../systems/SaveGame";
import { SharedField, WITNESS_RADIUS_TILES } from "../systems/SharedField";
import { DEBUG_ALLOWED } from "../systems/DebugFlag";
import type { DebugSnapshot } from "../ui/DebugHud";

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
  "substations",
]);

/** How close (in tiles) the player must be to interact with a door/terminal. */
const INTERACT_RANGE = 1.4;

/** Radius (tiles) around a hacked terminal whose doors it releases. */
const HACK_UNLOCK_RADIUS = 6;

/** Radius (tiles) a spotted orderly's alarm carries to nearby guards. */
const ORDERLY_ALERT_RADIUS_TILES = 6;

/** Debug warp targets, indexed by the number keys 1..5 (dev-only). */
const DEBUG_WARP_LEVELS = ["main1", "main2", "duct1", "duct2", VENT_CORE_LEVEL];

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
  /** VENT-4, present only on the vent_core level. */
  private vent4?: Vent4Boss;
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
  /** True while the Doctrinal Compliance minigame overlay is open (sim frozen). */
  private complianceOpen = false;
  /** The log-cache terminal whose breach launched the compliance puzzle. */
  private pendingCompliance?: Terminal;
  /** True while the Qualia Phase-Lock minigame overlay is open (sim frozen). */
  private qualiaOpen = false;
  /** The silicate-rack terminal whose breach launched the qualia bypass. */
  private pendingQualia?: Terminal;
  /** The terminal promoted to a silicate server rack in the current level. */
  private qualiaRack?: Terminal;
  /** Mission progress (kept in the registry so it survives level swaps). */
  private objectives!: ObjectiveState;
  /** The Shared Field (WX-9) charge / active state. */
  private sharedField = new SharedField();
  /** Chaff Pack / Thermal Gel consumable timers. */
  private activeItems = new ActiveItemState();
  /** Draws the Chaff Pack's EMP zone while it's live. */
  private empGfx!: Phaser.GameObjects.Graphics;
  /**
   * A walk-over transition can only fire once the player has stepped off every
   * transition tile since arriving — otherwise you'd bounce straight back.
   */
  private transitionArmed = false;
  private prompt!: Phaser.GameObjects.Text;
  private hidden!: Phaser.GameObjects.Text;

  // --- Debug mode (see DEBUG_ALLOWED — dev builds, or an explicit ?debug opt-in) ---
  /** Master switch: the debug panel is shown and the debug hotkeys respond. */
  private debugEnabled = false;
  /** Invincibility — blocks both death paths (HP depletion and capture). */
  private godMode = false;
  /** No-clip — the player's wall/door colliders are disabled. */
  private noClip = false;
  /** World-space debug draw: LOS rays, blocked tiles, detection tint. */
  private worldDraw = false;
  /** Freeze-world: halts guards, cameras, hazards, alert and capture (player free). */
  private frozenWorld = false;
  /** Graphics layer for the world-space debug draw. */
  private debugGfx?: Phaser.GameObjects.Graphics;
  /** The player↔wall / player↔door colliders, kept so no-clip can toggle them. */
  private wallCollider?: Phaser.Physics.Arcade.Collider;
  private doorCollider?: Phaser.Physics.Arcade.Collider;
  /** Debug hotkeys, bound only in dev builds. */
  private debugKeys?: {
    toggle: Phaser.Input.Keyboard.Key;
    god: Phaser.Input.Keyboard.Key;
    noClip: Phaser.Input.Keyboard.Key;
    world: Phaser.Input.Keyboard.Key;
    freeze: Phaser.Input.Keyboard.Key;
    warp: Phaser.Input.Keyboard.Key[];
  };

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
    field: Phaser.Input.Keyboard.Key;
    flashlight: Phaser.Input.Keyboard.Key;
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
    this.vent4 = undefined;
    this.alert = new AlertState();
    this.transitioning = false;
    this.paused = false;
    this.captureProgress = 0;
    this.codecOpen = false;
    this.complianceOpen = false;
    this.pendingCompliance = undefined;
    this.qualiaOpen = false;
    this.pendingQualia = undefined;
    this.qualiaRack = undefined;
    this.sharedField = new SharedField();
    this.activeItems = new ActiveItemState();
    // Arm only after stepping off the arrival tile (see update()).
    this.transitionArmed = false;
    // Debug flags don't survive a restart; the master toggle stays on so a
    // debug-mode warp keeps the panel up, but the cheats reset to a clean state.
    this.godMode = false;
    this.noClip = false;
    this.worldDraw = false;
    this.frozenWorld = false;

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
    this.designateQualiaRack();

    this.wallCollider = this.physics.add.collider(this.player.sprite, wallBodies);
    this.doorCollider = this.physics.add.collider(this.player.sprite, doorBodies);

    // Darken the level and light it from the `light_sources` — shares the same
    // data DetectionSystem uses, so lit spots are visibly and mechanically hot.
    this.lighting = new Lighting(this, this.level, this.tileSize);

    // VENT-4 lives only in the vent core. Its continuous audio layers are
    // scene-independent, so silence them on every entry and re-arm to match a
    // restored mid-fight state (the snapshot survives level swaps via the
    // registry; resetRun clears it).
    getAudio().setSuction(false);
    getAudio().setPurge(false);
    if (this.level.name === VENT_CORE_LEVEL) {
      this.vent4 = new Vent4Boss(
        this,
        this.level,
        this.tileSize,
        this.grid,
        this.registry.get("vent4State") as Vent4Snapshot | undefined,
      );
      if (this.vent4.state === Vent4State.PHASE_2_VACUUM) getAudio().setSuction(true);
      else if (this.vent4.state === Vent4State.PHASE_3_PURGE) getAudio().setPurge(true);
    }
    this.registry.set("vent4", this.vent4 ? this.vent4.hudView() : null);

    this.cameras.main.startFollow(this.player.sprite, true, 0.15, 0.15);
    this.cameras.main.setZoom(2);
    this.cameras.main.roundPixels = true;

    this.bindInput();

    // Chaff Pack EMP zone: drawn between the guard cones (400) and bodies (450).
    this.empGfx = this.add.graphics().setDepth(410);

    // World-space debug overlay: drawn below the depth-1000 HUD/prompts.
    if (DEBUG_ALLOWED) {
      this.debugGfx = this.add.graphics().setDepth(900);
    }

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
      field: kb.addKey(Phaser.Input.Keyboard.KeyCodes.F),
      flashlight: kb.addKey(Phaser.Input.Keyboard.KeyCodes.L),
    };

    // Debug hotkeys: dev builds always, deployed builds via the ?debug opt-in.
    if (DEBUG_ALLOWED) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.debugKeys = {
        toggle: kb.addKey(K.BACKTICK),
        god: kb.addKey(K.G),
        noClip: kb.addKey(K.N),
        world: kb.addKey(K.V),
        freeze: kb.addKey(K.H),
        warp: [K.ONE, K.TWO, K.THREE, K.FOUR, K.FIVE].map((c) => kb.addKey(c)),
      };
    }
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
      this.scene.launch("CodecScene", {
        interactive: false,
        vent4: this.vent4?.canTransmit ?? false,
      });
    } else {
      this.scene.stop("CodecScene");
      this.physics.resume();
    }
  }

  /** Toggles the Doctrinal Compliance minigame overlay, freezing/thawing the sim. */
  private setComplianceOpen(open: boolean): void {
    if (open === this.complianceOpen) return;
    this.complianceOpen = open;
    if (open) {
      this.physics.pause();
      this.registry.remove("complianceSolved");
      this.registry.remove("complianceClosed");
      this.scene.launch("ComplianceScene", {});
    } else {
      this.scene.stop("ComplianceScene");
      this.physics.resume();
    }
  }

  /**
   * Polls the compliance overlay's outcome while it's open (the sim update below
   * never runs behind it). Solving it runs the normal breach effect — logs
   * recovered + nearby doors released; aborting re-arms the terminal so the
   * mission-critical log stays recoverable.
   */
  private updateComplianceOverlay(): void {
    if (this.registry.get("complianceSolved") === true) {
      this.registry.remove("complianceSolved");
      const term = this.pendingCompliance;
      this.pendingCompliance = undefined;
      this.setComplianceOpen(false);
      if (term) this.applyHack(term);
    } else if (this.registry.get("complianceClosed") === true) {
      this.registry.remove("complianceClosed");
      const term = this.pendingCompliance;
      this.pendingCompliance = undefined;
      this.setComplianceOpen(false);
      term?.reopen();
    }
  }

  /** Toggles the Qualia Phase-Lock minigame overlay, freezing/thawing the sim. */
  private setQualiaOpen(open: boolean): void {
    if (open === this.qualiaOpen) return;
    this.qualiaOpen = open;
    if (open) {
      this.physics.pause();
      this.registry.remove("qualiaSolved");
      this.registry.remove("qualiaClosed");
      this.scene.launch("QualiaLockScene", {});
    } else {
      this.scene.stop("QualiaLockScene");
      this.physics.resume();
    }
  }

  /**
   * Polls the qualia overlay's outcome while it's open. Completing the bypass
   * runs the normal breach effect (nearby doors released); a purge or abort
   * re-arms the rack so the spike can be reattempted.
   */
  private updateQualiaOverlay(): void {
    if (this.registry.get("qualiaSolved") === true) {
      this.registry.remove("qualiaSolved");
      const term = this.pendingQualia;
      this.pendingQualia = undefined;
      this.setQualiaOpen(false);
      if (term) this.applyHack(term);
    } else if (this.registry.get("qualiaClosed") === true) {
      this.registry.remove("qualiaClosed");
      const term = this.pendingQualia;
      this.pendingQualia = undefined;
      this.setQualiaOpen(false);
      term?.reopen();
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

  /**
   * Charges the Shared Field by witnessing a nearby silicate (within range, with
   * line of sight), activates it on F, and publishes its state for the HUD. The
   * undetectable effect is applied in update() via the concealment path.
   */
  private updateSharedField(dt: number): void {
    const ts = this.tileSize;
    const px = this.player.x;
    const py = this.player.y;
    const witnessing = this.guards().some((e) => {
      const d = Math.hypot(e.position.x - px, e.position.y - py);
      return (
        d <= WITNESS_RADIUS_TILES * ts &&
        this.grid.hasLineOfSight(e.position.x / ts, e.position.y / ts, px / ts, py / ts)
      );
    });
    this.sharedField.witness(dt, witnessing);
    if (Phaser.Input.Keyboard.JustDown(this.keys.field) && this.sharedField.activate()) {
      getAudio().merge();
      this.cameras.main.flash(300, 60, 200, 220);
    }
    this.sharedField.update(dt);
    this.registry.set("sharedField", {
      charge: this.sharedField.charge,
      active: this.sharedField.active,
      ready: this.sharedField.ready,
    });
  }

  /**
   * Polls the item-use request UIScene posts on hotkeys 1/2 (the same
   * request/consume pattern as the compliance/qualia overlays), validates
   * possession, spends the item, and ticks both item timers.
   */
  private updateActiveItems(dt: number): void {
    const request = this.registry.get("itemUseRequest") as string | undefined;
    if (request) {
      this.registry.remove("itemUseRequest");
      const inv = (this.registry.get("inventory") as string[] | undefined) ?? [];
      const idx = inv.indexOf(request);
      if (idx !== -1) {
        inv.splice(idx, 1);
        this.registry.set("inventory", inv);
        this.applyConsumable(request);
      }
    }
    this.activeItems.update(dt);
    this.registry.set("activeItems", {
      chaffRemaining: this.activeItems.chaffRemaining,
      thermalRemaining: this.activeItems.thermalRemaining,
      flashlightOwned: this.activeItems.flashlightOwned,
      flashlightOn: this.activeItems.flashlightOn,
      flashlightCharge: this.activeItems.flashlightCharge,
    } satisfies ActiveItemsView);
    this.drawChaffZone();
  }

  /** Applies a consumable's effect once it's been spent from the inventory. */
  private applyConsumable(item: string): void {
    switch (item) {
      case CHAFF_PACK_ITEM:
        this.fireChaffBurst();
        break;
      case THERMAL_GEL_ITEM:
        this.activeItems.activateThermalGel();
        break;
      case RATION_PACK_ITEM:
        this.player.heal(RATION_HEAL);
        getAudio().pickup();
        break;
      case BATTERY_ITEM:
        this.activeItems.rechargeFlashlight();
        getAudio().pickup();
        break;
      case STUN_ROUNDS_ITEM:
        this.fireStunDart();
        break;
    }
  }

  /**
   * An instant EMP burst centred on the player: blinds guards and cameras (via
   * the chaff zone), suppresses lasers within reach, and breaks any active
   * pursuit into a search — jamming the alert network / clearing alarms.
   */
  private fireChaffBurst(): void {
    this.activeItems.activateChaff(this.player.x, this.player.y);
    this.alert.forceEvasion();
    const radiusPx = CHAFF_PACK_RADIUS_TILES * this.tileSize;
    for (const laser of this.lasers) {
      if (Math.hypot(laser.x - this.player.x, laser.y - this.player.y) <= radiusPx) {
        laser.emp(CHAFF_PACK_DURATION);
      }
    }
    this.cameras.main.flash(200, 120, 200, 255);
  }

  /**
   * Fires a short stun dart along Rowan's facing: the nearest orderly within
   * reach and roughly ahead is frozen (can't witness). Firing makes a small noise.
   */
  private fireStunDart(): void {
    const reachPx = STUN_ROUND_REACH_TILES * this.tileSize;
    const fx = Math.cos(this.player.facing);
    const fy = Math.sin(this.player.facing);
    let target: Orderly | undefined;
    let bestDist = Infinity;
    for (const orderly of this.orderlies) {
      const p = orderly.position;
      const dx = p.x - this.player.x;
      const dy = p.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > reachPx || dist === 0) continue;
      // Only orderlies roughly in front of Rowan (within the forward half-plane).
      if ((dx * fx + dy * fy) / dist < 0.5) continue;
      if (dist < bestDist) {
        bestDist = dist;
        target = orderly;
      }
    }
    target?.stun(STUN_ROUND_DURATION);
    this.emitNoiseAt(this.player.x, this.player.y, STUN_ROUND_NOISE * this.tileSize);
  }

  /** Draws the Chaff Pack's EMP zone while it's live. */
  private drawChaffZone(): void {
    const g = this.empGfx;
    g.clear();
    if (!this.activeItems.chaffActive || !this.activeItems.chaffOrigin) return;
    const { x, y } = this.activeItems.chaffOrigin;
    const radiusPx = CHAFF_PACK_RADIUS_TILES * this.tileSize;
    g.fillStyle(0x7fd8ff, 0.12);
    g.fillCircle(x, y, radiusPx);
    g.lineStyle(2, 0xbdf0ff, 0.6);
    g.strokeCircle(x, y, radiusPx);
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

    // Pause (Esc), the codec (C) and the two minigames each freeze the sim behind
    // an overlay scene. The minigames and codec suppress the pause/codec toggles.
    if (!this.codecOpen && !this.complianceOpen && !this.qualiaOpen && Phaser.Input.Keyboard.JustDown(this.keys.pause)) {
      this.setPaused(!this.paused);
    }
    if (!this.paused && !this.complianceOpen && !this.qualiaOpen && Phaser.Input.Keyboard.JustDown(this.keys.codec)) {
      this.setCodecOpen(!this.codecOpen);
    }
    if (this.paused || this.codecOpen || this.complianceOpen || this.qualiaOpen) {
      this.player.sprite.setVelocity(0, 0);
      if (this.paused && Phaser.Input.Keyboard.JustDown(this.keys.abort)) this.abortToTitle();
      // The codec's 140.85 transmit finisher: CodecScene raises the flag, and
      // it must be consumed here — the sim update below never runs while the
      // overlay is open.
      if (this.codecOpen && this.registry.get("vent4Transmit") === true) {
        this.registry.remove("vent4Transmit");
        const tr = this.vent4?.transmitFinisher() ?? null;
        this.setCodecOpen(false);
        if (tr) this.onVent4Transition(tr);
      }
      if (this.complianceOpen) this.updateComplianceOverlay();
      if (this.qualiaOpen) this.updateQualiaOverlay();
      return;
    }

    // Debug hotkeys. A warp restarts the scene, so bail this frame.
    if (DEBUG_ALLOWED && this.handleDebugInput()) return;

    this.player.update(this.readInput(), dt);
    // Flashlight: L toggles the beam; feed its state to the lighting cone.
    if (Phaser.Input.Keyboard.JustDown(this.keys.flashlight)) {
      this.activeItems.toggleFlashlight();
    }
    this.lighting.update(
      dt,
      this.activeItems.flashlightBeamActive
        ? { x: this.player.x, y: this.player.y, facing: this.player.facing }
        : null,
    );
    this.updateInteractions(dt);
    this.updateSharedField(dt);
    this.updateActiveItems(dt);
    const fieldActive = this.sharedField.isActive;

    // Cover concealment: crouched on LOW cover (or on any HIGH cover) hides the
    // player from vision cones. The Shared Field (WX-9) hides Rowan from
    // everything for its duration — the mesh perceives him as part of "we".
    const cover = this.detection.coverTypeAt(this.player.x, this.player.y);
    const coverConceal = cover === "high" || (cover === "low" && this.player.crouched);
    const concealed = fieldActive || coverConceal;
    // Thermal sees through cover that leaks heat (ThermalBleed); the map's cover
    // all blocks heat, so concealment normally hides from thermal too.
    const thermalConcealed =
      fieldActive || (coverConceal && !this.detection.thermalBleedAt(this.player.x, this.player.y));
    this.updateHiddenMarker(concealed);

    const phaseBefore = this.alert.phase;
    let maxDetection = 0;
    const ctx = {
      grid: this.grid,
      tileSize: this.tileSize,
      player: { x: this.player.x, y: this.player.y },
      // Emitting the flashlight beam makes Rowan far easier to spot in LOS.
      lightMultiplierAt: (x: number, y: number) =>
        this.detection.multiplierAt(x, y) *
        (this.activeItems.flashlightBeamActive ? FLASHLIGHT_DETECTION_MULTIPLIER : 1),
      playerNoise: this.player.noise,
      playerConcealed: concealed,
      playerThermalConcealed: thermalConcealed,
      thermalRadiusMultiplier: (base: number) =>
        this.detection.thermalRadiusFor(base, this.activeItems.thermalMasked),
      chaffZone:
        this.activeItems.chaffActive && this.activeItems.chaffOrigin
          ? { ...this.activeItems.chaffOrigin, radiusPx: CHAFF_PACK_RADIUS_TILES * this.tileSize }
          : null,
      alert: this.alert,
    };
    // Debug freeze-world (H) short-circuits every AI/hazard update below by
    // iterating nothing (or ticking with 0), so patrols, cones, lasers, VENT-4,
    // alert decay and capture all hold still while the player can still move.
    for (const e of this.frozenWorld ? [] : this.guards()) {
      const before = e.detection;
      e.update(dt, ctx);
      maxDetection = Math.max(maxDetection, e.detection);
      // A fresh full sighting alerts networked guards within reach.
      if (before < 1 && e.detection >= 1) {
        this.emitNetworkAlert(e.position, e.stats.alertNetworkRadius);
      }
    }

    // Sensor cameras run on the same context, reporting sightings themselves.
    for (const s of this.frozenWorld ? [] : this.sensors) {
      const before = s.detection;
      s.update(dt, ctx);
      maxDetection = Math.max(maxDetection, s.detection);
      if (before < 1 && s.detection >= 1) {
        this.emitNetworkAlert(s.position, s.stats.alertNetworkRadius);
      }
    }

    // VENT-4: sweeps/steam/jam clock, then its environmental forces — added
    // AFTER Player.update's setVelocity so suction and air jets survive the
    // frame (the player re-sets velocity from input every tick).
    if (this.vent4 && !this.frozenWorld) {
      const tick = this.vent4.update(dt, ctx);
      maxDetection = Math.max(maxDetection, this.vent4.detection);
      if (tick.transition) this.onVent4Transition(tick.transition);
      if (tick.burst) {
        this.cameras.main.flash(220, 150, 40, 10);
        this.player.takeDamage(VENT4_DEFAULTS.burstDamage);
      }
      if (tick.steamHit && this.player.takeDamage(VENT4_DEFAULTS.steamDamage)) {
        this.cameras.main.shake(120, 0.004);
      }
      if (tick.overheating && this.player.takeDamage(VENT4_DEFAULTS.overheatDamage)) {
        this.cameras.main.flash(160, 120, 30, 10);
      }
      const forces = this.vent4.computeForces(dt, this.player.x, this.player.y);
      const body = this.player.sprite.body as Phaser.Physics.Arcade.Body;
      body.velocity.x += forces.vx;
      body.velocity.y += forces.vy;
      if (forces.inIntake) this.player.takeDamage(VENT4_DEFAULTS.intakeDamage);
      this.registry.set("vent4", this.vent4.hudView());
      this.registry.set("vent4State", this.vent4.snapshot());
    }

    // Orderlies: bystanders, not guards — a clear sighting is a one-shot
    // "witness" event that raises nearby guards' suspicion, same as a noisy door.
    for (const orderly of this.frozenWorld ? [] : this.orderlies) {
      if (orderly.update(dt, { grid: this.grid, tileSize: this.tileSize, player: ctx.player, playerConcealed: concealed })) {
        this.emitOrderlyAlert(orderly);
      }
    }

    // Lasers: crossing an active beam/scan zone instantly trips the alarm.
    let laserTripped = false;
    for (const laser of this.frozenWorld ? [] : this.lasers) {
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

    this.alert.update(this.frozenWorld ? 0 : dt);
    if (this.alert.phase === "ALERT" && phaseBefore !== "ALERT") getAudio().ping();
    getAudio().setMood(
      this.alert.phase === "ALERT" ? "alert" : this.alert.phase === "EVASION" ? "search" : "calm",
    );
    this.registry.set("alertPhase", this.alert.phase);
    this.registry.set("detection", this.alert.phase === "ALERT" ? 1 : maxDetection);
    this.registry.set("playerHp", this.player.hp);

    // Fail-state — bio-integrity depleted, or cornered by a silicate during a
    // full alert: the mesh prunes Rowan's logs (Alignment).
    const cornered =
      !this.frozenWorld && !fieldActive && this.alert.isCombatAware && this.guards().some((e) => this.isCornering(e));
    this.captureProgress = cornered
      ? this.captureProgress + dt
      : Math.max(0, this.captureProgress - dt * 2);
    // God mode (debug): neutralize both death paths after they've been computed
    // for the frame — restore bio-integrity and clear any capture progress.
    if (this.godMode) {
      this.player.hp = this.player.maxHp;
      this.captureProgress = 0;
    }
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

    // Debug mode: world-space overlay + a state snapshot for the HUD.
    if (DEBUG_ALLOWED) {
      this.drawDebugWorld();
      this.registry.set("debug", this.buildDebugSnapshot());
    }
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

    // --- VENT-4 verbs (sub-stations / winches / pitons / stapler) ---
    let vent: Vent4InteractResult | undefined;
    if (this.vent4) {
      vent = this.vent4.handleInteract(
        dt,
        ptx,
        pty,
        interactDown,
        interactJust,
        (this.registry.get("inventory") as string[] | undefined) ?? [],
      );
      if (vent.transition) this.onVent4Transition(vent.transition);
    }
    const ventHold = vent?.consumedHold ?? false;

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
    if (hacking && nearestTerminal!.hack(dt)) this.onHackComplete(nearestTerminal!);
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
    const searching = !!nearestChest && interactDown && !hacking && !ventHold;
    if (searching && nearestChest!.open(dt)) this.collectChest(nearestChest!);
    for (const chest of this.chests) {
      if (chest !== nearestChest || !interactDown || hacking || ventHold) chest.idle(dt);
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
    if (!hacking && !ventHold && interactJust) {
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
      vent?.label,
      vent?.dist ?? Infinity,
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
    ventLabel?: string,
    ventDist = Infinity,
  ): void {
    let label: string | undefined;
    let best = Infinity;
    if (terminal && terminalDist < best) {
      best = terminalDist;
      label = "[E] Hack";
    }
    if (ventLabel && ventDist < best) {
      best = ventDist;
      label = ventLabel;
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

  /**
   * A completed hold-to-hack. A log-cache breach opens the Doctrinal Compliance
   * minigame — solving it recovers EIRA-7's logs — while every other terminal
   * fires its effect immediately as before.
   */
  private onHackComplete(terminal: Terminal): void {
    if (terminal.stats.type === LOG_CACHE_TYPE) {
      this.pendingCompliance = terminal;
      this.setComplianceOpen(true);
    } else if (this.isQualiaRack(terminal)) {
      this.pendingQualia = terminal;
      this.setQualiaOpen(true);
    } else {
      this.applyHack(terminal);
    }
  }

  /** A terminal is a silicate server rack if authored so, or promoted per level. */
  private isQualiaRack(terminal: Terminal): boolean {
    return terminal.stats.type === QUALIA_RACK_TERMINAL_TYPE || terminal === this.qualiaRack;
  }

  /**
   * Promotes the terminal nearest the player's arrival point to a silicate server
   * rack, so breaching it launches the Qualia Phase-Lock bypass. Prefers a plain
   * terminal, but the shipped map types every terminal as a log-cache, so it will
   * retype the nearest log-cache instead — never the last one, since the mission
   * needs a log-cache to recover EIRA-7's logs. Skipped when the level already
   * authors an explicit `qualia_rack` terminal or has no terminal to spare.
   */
  private designateQualiaRack(): void {
    const idx = pickQualiaRackIndex(
      this.terminals.map((t) => ({ type: t.stats.type, x: t.x, y: t.y })),
      { x: this.player.x, y: this.player.y },
      LOG_CACHE_TYPE,
    );
    if (idx < 0) return;
    const rack = this.terminals[idx];
    rack.stats.type = QUALIA_RACK_TERMINAL_TYPE;
    this.qualiaRack = rack;
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

  /**
   * Dresses a VENT-4 state change: continuous audio layers, stingers, and (on
   * defeat) the compliance cert + optional objective. Banners ride the `vent4`
   * registry snapshot, and the mood keys off the alert phase as usual — the
   * boss raises it through reportSighting like every other detector.
   */
  private onVent4Transition(tr: Vent4Transition): void {
    const audio = getAudio();
    switch (tr.to) {
      case Vent4State.PHASE_1_SWEEP:
        audio.setSuction(false);
        audio.setPurge(false);
        break;
      case Vent4State.PHASE_2_VACUUM:
        audio.setSuction(true);
        audio.setPurge(false);
        break;
      case Vent4State.JAMMED:
        audio.setSuction(false);
        audio.jamClunk();
        break;
      case Vent4State.PHASE_3_PURGE:
        audio.setSuction(false);
        audio.setPurge(true);
        audio.ping();
        break;
      case Vent4State.DEFEATED: {
        audio.setSuction(false);
        audio.setPurge(false);
        audio.vent4Shutdown();
        const inv = (this.registry.get("inventory") as string[] | undefined) ?? [];
        if (!inv.includes(CERT_ITEM)) {
          inv.push(CERT_ITEM);
          this.registry.set("inventory", inv);
        }
        noteVent4Defeated(this.objectives);
        this.registry.set("objectives", this.objectives);
        this.cameras.main.flash(400, 60, 200, 220);
        break;
      }
    }
  }

  /** Every guard-type unit — enforcers and drones share identical AI/hearNoise. */
  private guards(): Enforcer[] {
    return [...this.enforcers, ...this.drones];
  }

  // ------------------------------------------------------------------ debug --
  // Everything below is only reachable when DEBUG_ALLOWED is true — dev builds,
  // or a deployed build with the ?debug opt-in (see src/systems/DebugFlag.ts).

  /**
   * Reads the debug hotkeys for the frame and applies them. Returns `true` if a
   * warp was triggered (the scene is restarting, so the caller should bail).
   */
  private handleDebugInput(): boolean {
    const dk = this.debugKeys;
    if (!dk) return false;
    if (Phaser.Input.Keyboard.JustDown(dk.toggle)) this.setDebugEnabled(!this.debugEnabled);
    if (!this.debugEnabled) return false;
    if (Phaser.Input.Keyboard.JustDown(dk.god)) this.godMode = !this.godMode;
    if (Phaser.Input.Keyboard.JustDown(dk.noClip)) this.setNoClip(!this.noClip);
    if (Phaser.Input.Keyboard.JustDown(dk.world)) this.worldDraw = !this.worldDraw;
    if (Phaser.Input.Keyboard.JustDown(dk.freeze)) this.frozenWorld = !this.frozenWorld;
    for (let i = 0; i < dk.warp.length; i++) {
      if (Phaser.Input.Keyboard.JustDown(dk.warp[i])) {
        this.debugWarp(DEBUG_WARP_LEVELS[i]);
        return true;
      }
    }
    return false;
  }

  /** Master switch. Disabling clears every cheat for a clean return to play. */
  private setDebugEnabled(on: boolean): void {
    this.debugEnabled = on;
    if (!on) {
      this.godMode = false;
      this.worldDraw = false;
      this.frozenWorld = false;
      this.setNoClip(false);
      this.debugGfx?.clear();
    }
  }

  /** Toggles no-clip by enabling/disabling the player's wall+door colliders. */
  private setNoClip(on: boolean): void {
    this.noClip = on;
    if (this.wallCollider) this.wallCollider.active = !on;
    if (this.doorCollider) this.doorCollider.active = !on;
    const body = this.player.sprite.body as Phaser.Physics.Arcade.Body;
    body.checkCollision.none = on;
    this.player.sprite.setCollideWorldBounds(!on);
  }

  /** Warps to a level by restarting the scene at its own spawn tile. */
  private debugWarp(levelName: string): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.scene.restart({ level: levelName });
  }

  /** Draws the world-space debug overlay: blocked tiles, detection tint, LOS. */
  private drawDebugWorld(): void {
    const g = this.debugGfx;
    if (!g) return;
    g.clear();
    if (!this.debugEnabled || !this.worldDraw) return;

    const ts = this.tileSize;
    const view = this.cameras.main.worldView;
    const minTx = Math.max(0, Math.floor(view.x / ts));
    const maxTx = Math.min(this.grid.width - 1, Math.ceil(view.right / ts));
    const minTy = Math.max(0, Math.floor(view.y / ts));
    const maxTy = Math.min(this.grid.height - 1, Math.ceil(view.bottom / ts));

    // Blocked tiles (red) and detection-multiplier hot spots (amber) in view.
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (this.grid.isBlocked(tx, ty)) {
          g.fillStyle(0xff3b3b, 0.12);
          g.fillRect(tx * ts, ty * ts, ts, ts);
          continue;
        }
        const m = this.detection.multiplierAt((tx + 0.5) * ts, (ty + 0.5) * ts);
        if (m > 1.05) {
          g.fillStyle(0xffb03b, Math.min(0.25, (m - 1) * 0.3));
          g.fillRect(tx * ts, ty * ts, ts, ts);
        }
      }
    }

    // Line of sight from the player to each guard (green = clear, red = blocked).
    const ptx = this.player.x / ts;
    const pty = this.player.y / ts;
    for (const e of this.guards()) {
      const pos = e.position;
      const clear = this.grid.hasLineOfSight(ptx, pty, pos.x / ts, pos.y / ts);
      g.lineStyle(1, clear ? 0x59d98e : 0xff3b3b, 0.6);
      g.lineBetween(this.player.x, this.player.y, pos.x, pos.y);
    }
  }

  /** Snapshot of live state for the DebugHud (published to the registry). */
  private buildDebugSnapshot(): DebugSnapshot {
    const ts = this.tileSize;
    return {
      enabled: this.debugEnabled,
      godMode: this.godMode,
      noClip: this.noClip,
      worldDraw: this.worldDraw,
      frozenWorld: this.frozenWorld,
      fps: this.game.loop.actualFps,
      px: this.player.x,
      py: this.player.y,
      tileX: Math.floor(this.player.x / ts),
      tileY: Math.floor(this.player.y / ts),
      facing: this.player.facing,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      capture: this.captureProgress,
      captureTime: PLAYER_DEFAULTS.captureTime,
      level: this.level.name,
      alertPhase: this.alert.phase,
      units: [
        ...this.guards().map((e, i) => ({ label: `G${i}`, detection: e.detection })),
        ...this.sensors.map((s, i) => ({ label: `S${i}`, detection: s.detection })),
      ],
    };
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

  /**
   * Searches a chest with smart auto-use: a Ration Pack heals immediately if
   * Rowan is hurt, a Battery tops the flashlight if it's low, and everything
   * else is stored — but only while under the 4-consumable cap. Key items and
   * equipment never count against the cap. Anything that can't be used or stored
   * is left inside the chest, which re-arms so it can be searched again later.
   */
  private collectChest(chest: Chest): void {
    const inv = (this.registry.get("inventory") as string[] | undefined) ?? [];
    const leftover: string[] = [];
    let held = countConsumables(inv);
    const hasRoom = (): boolean => held < MAX_CONSUMABLES;

    for (const item of chest.take()) {
      if (item === RATION_PACK_ITEM && this.player.hp < this.player.maxHp) {
        this.player.heal(RATION_HEAL); // auto-consumed on pickup
        continue;
      }
      if (
        item === BATTERY_ITEM &&
        this.activeItems.flashlightOwned &&
        this.activeItems.flashlightCharge < 1
      ) {
        this.activeItems.rechargeFlashlight(); // auto-consumed on pickup
        continue;
      }
      if (isConsumable(item)) {
        if (hasRoom()) {
          inv.push(item);
          held++;
        } else {
          leftover.push(item); // 4/4 — stays in the chest
        }
        continue;
      }
      // Key items (Access Chit, EIRA-7 log) and equipment: always stored, uncapped.
      inv.push(item);
    }

    chest.retain(leftover);
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
