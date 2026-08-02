import Phaser from "phaser";
import type { GameLevel, GameMap, Transition } from "../map/types";
import type { ParsedMap } from "../map/EdplayLoader";
import { SensingContext } from "./game/SensingContext";
import { DebugOverlay, type DebugWorld } from "./game/DebugOverlay";
import { buildLevel, registerGlazing } from "./game/LevelBuilder";
import { NoiseEvents } from "./game/NoiseEvents";
import { OverlayGate } from "./game/OverlayGate";
import { SpriteAtlas } from "../map/SpriteAtlas";
import { CollisionGrid } from "../systems/CollisionGrid";
import { DetectionSystem } from "../systems/DetectionSystem";
import { AlertState } from "../systems/AlertState";
import { TransitionGraph } from "../systems/TransitionGraph";
import { buildRadarSnapshot, emptyRadarSnapshot } from "../systems/Radar";
import { Player, type InputState } from "../entities/Player";
import {
  Enforcer,
  type EnforcerContext,
  type EnforcerFireResult,
  type GuardAnomaly,
} from "../entities/Enforcer";
import { Orderly } from "../entities/Orderly";
import { DeployedItem } from "../entities/DeployedItem";
import { Door } from "../entities/Door";
import { Terminal } from "../entities/Terminal";
import { Laser } from "../entities/Laser";
import { Sensor } from "../entities/Sensor";
import { Chest } from "../entities/Chest";
import { Cover } from "../entities/Cover";
import { buildAlertNetworkSnapshot, NoiseSpamTracker } from "../systems/AlertNetwork";
import { Lighting } from "../ui/Lighting";
import {
  missionFeatures,
  resumeFromSave,
  setMode,
  SUSPENDED_KEY,
  type GameMode,
} from "../systems/GameState";
import {
  initialJournal,
  journalIdForLevel,
  noteJournal,
  type JournalEntryId,
  type JournalState,
} from "../systems/Journal";
import { ExploredMap, initialExplored, type ExploredState } from "../systems/Explored";
import {
  MAP_SNAPSHOT_KEY,
  PAUSE_REQUEST_KEY,
  SAVE_WRITTEN_KEY,
  type MapSnapshot,
  type PauseRequest,
} from "../systems/PauseState";
import {
  BATTERY_ITEM,
  CERT_ITEM,
  CHAFF_PACK_ITEM,
  countConsumables,
  LOG_ALPHA_ITEM,
  LOG_BETA_ITEM,
  SMAC_DEFAULTS,
  RELAY_DEFAULTS,
  FLASHLIGHT_DETECTION_MULTIPLIER,
  GAME_SPEED,
  isConsumable,
  ENFORCER_FIRE_NOISE,
  MAX_CONSUMABLES,
  OPENED_RATION_DETECTION_MULTIPLIER,
  OPENED_RATION_NOISE,
  PLAYER_DEFAULTS,
  RATION_HEAL,
  RATION_PACK_ITEM,
  SACK_LUNCH_ITEM,
  STAPLER_FIELD_COOLDOWN,
  STAPLER_FIELD_MAX_CHARGES,
  STAPLER_FIELD_NOISE,
  STAPLER_FIELD_RANGE_TILES,
  STAPLER_ITEM,
  STAPLER_PIN_DURATION,
  STARTING_INVENTORY,
  STUN_ROUND_DURATION,
  STUN_ROUND_NOISE,
  STUN_ROUND_REACH_TILES,
  STUN_ROUNDS_ITEM,
  THERMAL_GEL_ITEM,
} from "../systems/EntityStats";
import {
  ActiveItemState,
  CHAFF_PACK_DURATION,
  CHAFF_PACK_RADIUS_TILES,
  type ActiveItemsView,
} from "../systems/ActiveItems";
import { pickQualiaRackIndex, QUALIA_RACK_TERMINAL_TYPE } from "../systems/QualiaLock";
import {
  canReachRoof,
  initialObjectives,
  isLogCacheType,
  isRunWon,
  LOG_CACHE_ALPHA_TYPE,
  LOG_CACHE_BETA_TYPE,
  LOG_CACHE_TYPE,
  noteCoreSilenced,
  noteTerminalHacked,
  noteUplinkComplete,
  noteVent4Defeated,
  type MissionFeatures,
  type ObjectiveState,
} from "../systems/Objectives";
import { Vent4State, type Vent4Transition } from "../systems/Vent4Core";
import { SmacState, type SmacTransition } from "../systems/SmacCore";
import { ENFORCER_SKIN } from "../entities/EnforcerAnimations";
import { RelayState, type RelayTransition } from "../systems/RelayCore";
import { ROOF_ARRAY_LEVEL } from "../map/RoofArrayLevel";
import { Encounters } from "./game/Encounters";
import { isGeneratedLevel } from "../map/types";
import { planFor, type MapPlan } from "../map/MapPlan";
import { getAudio } from "../systems/AudioDirector";
import { saveGame, clearSave, loadGame, type SlotId } from "../systems/SaveGame";
import { SharedField, WITNESS_RADIUS_TILES } from "../systems/SharedField";
import {
  ConductState,
  FLAG_HOSTILE,
  FLAG_TAMPERING,
  FLAG_UNAUTHORIZED,
  type ConductMetrics,
  type ConductView,
} from "../systems/Conduct";
import { DEBUG_ALLOWED } from "../systems/DebugFlag";
import { FONT_MONO } from "../ui/fonts";
import { len, withinOrEqual } from "../systems/distance";

/** Data passed to {@link GameScene} when (re)starting for a level swap. */
interface GameSceneData {
  level?: string;
  arriveX?: number;
  arriveY?: number;
}

/**
 * Explored-tile sweep cadence and reach, for the pause menu's map. A quarter
 * second at walking pace reveals nothing a full sweep would have missed, and the
 * radius is a little beyond the lit halo so a corridor fills in as you walk it.
 */
const EXPLORE_INTERVAL = 0.25;
const EXPLORE_RADIUS_TILES = 9;

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
  // NW-SMAC-01's correction nodes and the roof's pedestals/feed all become
  // HoldTargets, which render the tile's own sprite themselves — leaving these off
  // would draw every one of them twice. The vault's core and racks are *not* here:
  // they are static art the boss draws over.
  "vault_nodes",
  "relay_pedestals",
  "relay_feed",
]);

/** How close (in tiles) the player must be to interact with a door/terminal. */
const INTERACT_RANGE = 1.4;

/** Radius (tiles) around a hacked terminal whose doors it releases. */
const HACK_UNLOCK_RADIUS = 6;

/** Seconds between knocks, so the action can't be mashed. */
const KNOCK_COOLDOWN = 0.6;

/**
 * How many levels the debug number keys can warp to. The targets themselves come from
 * the map's own level list (see `debugWarpLevels`) rather than hardcoded names, so the
 * warps keep working on a map that doesn't reuse the shipped level names.
 */
const DEBUG_WARP_SLOTS = 6;

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
  /**
   * Every guard-type unit on the level — enforcers and drones both, since a
   * drone *is* an Enforcer with a different skin and the two were never read
   * apart. One array rather than two merged on demand: `update()` walks the
   * guards four times a frame, and a spread per walk is four throwaway arrays
   * every frame for the life of the run.
   */
  private guards: Enforcer[] = [];
  private orderlies: Orderly[] = [];
  /** Items the player has left on the floor — currently only deployed Sack Lunches. */
  private deployables: DeployedItem[] = [];
  private doors: Door[] = [];
  private terminals: Terminal[] = [];
  private lasers: Laser[] = [];
  private sensors: Sensor[] = [];
  private chests: Chest[] = [];
  /** Destructible cover — the rest of the `cover` board is baked art with no entity. */
  private coverTiles: Cover[] = [];
  /** The vent-core/vault/roof set-piece encounters, and their mechanical wiring. */
  private encounters!: Encounters;
  /** Lazily-resolved {@link features}; cleared per run so a fresh map re-reads it. */
  private runFeatures?: MissionFeatures;
  /** Previous frame's player position, for the conduct system's distance metric. */
  private lastPlayerX = 0;
  private lastPlayerY = 0;
  /** Set when the player spends an item — a deviation inside NW-SMAC-01's held posture. */
  private deviatedThisFrame = false;
  /** The reused per-frame guard/camera sensing context. Rebuilt per level. */
  private sensing!: SensingContext;
  /** Noise propagation: doors, chests, knocks, and the alert-network rally. */
  private noise!: NoiseEvents;
  /** The pause / codec / minigame overlays and the sim freeze behind them. */
  private overlays!: OverlayGate;
  /** This frame's anomaly list, and the entry objects it recycles. */
  private readonly anomalyBuf: GuardAnomaly[] = [];
  private readonly anomalyPool: GuardAnomaly[] = [];
  /** Refilled each frame and republished; see {@link RadarSnapshot}. */
  private readonly radarSnapshot = emptyRadarSnapshot();
  private lighting!: Lighting;
  private grid!: CollisionGrid;
  private detection!: DetectionSystem;
  private alert = new AlertState();
  /** Anti-exploit: escalates repeated noise pings in the same area straight to ALERT. */
  private noiseSpam = new NoiseSpamTracker();
  private transitions!: TransitionGraph;

  /** Where this scene run should start (level + optional arrival tile). */
  /** Set in init() from the map plan; the literal is only a pre-init placeholder. */
  private levelName = "";
  private arriveTile?: { x: number; y: number };
  /** A fade + level swap is in flight; input and further triggers are ignored. */
  private transitioning = false;
  /** Seconds the player has been cornered by a silicate during a full alert. */
  private captureProgress = 0;
  /** Cooldown (seconds) remaining before the player can knock again. */
  private knockCooldown = 0;
  /** Cooldown for the Rail-Stapler's general-purpose field mode (outside VENT-4). */
  private staplerFieldCooldown = 0;
  /** The log-cache terminal whose breach launched the compliance puzzle. */
  private pendingCompliance?: Terminal;
  /** The silicate-rack terminal whose breach launched the qualia bypass. */
  private pendingQualia?: Terminal;
  /** The terminal promoted to a silicate server rack in the current level. */
  private qualiaRack?: Terminal;
  /** Mission progress (kept in the registry so it survives level swaps). */
  private objectives!: ObjectiveState;
  /** Rowan's journal — the run's counter-archive, also registry-backed. */
  private journal!: JournalState;
  /** Seen-tile mask for *this* level; the other levels' stay in the registry. */
  private explored!: ExploredMap;
  /** Seconds until the next explored-tile sweep (they're throttled, not per-frame). */
  private exploredCooldown = 0;
  /** Milliseconds of play in this run, for the pause menu's STATUS clock. */
  private playTimeMs = 0;
  /** The Shared Field (WX-9) charge / active state. */
  private sharedField = new SharedField();
  /** Whether Rowan currently reads to the facility as compliant staff. */
  private conduct = new ConductState();
  /** EMP Grenade / Thermal Gel consumable timers. */
  private activeItems = new ActiveItemState();
  /** Draws the EMP Grenade's EMP zone while it's live. */
  private empGfx!: Phaser.GameObjects.Graphics;
  /** Draws the brief tracer line(s) for a pursuing guard's shot. */
  private fireTracerGfx!: Phaser.GameObjects.Graphics;
  private fireTracers: { x1: number; y1: number; x2: number; y2: number; ttl: number }[] = [];
  /**
   * A walk-over transition can only fire once the player has stepped off every
   * transition tile since arriving — otherwise you'd bounce straight back.
   */
  private transitionArmed = false;
  private prompt!: Phaser.GameObjects.Text;
  private hidden!: Phaser.GameObjects.Text;

  /**
   * Developer debug mode — hotkeys, cheats, the world overlay. Present only
   * when DEBUG_ALLOWED (a dev build, or an explicit `?debug` opt-in), so every
   * read of it is guarded. See {@link DebugOverlay}.
   */
  private debug?: DebugOverlay;
  /** The player↔wall / player↔door colliders, kept so no-clip can toggle them. */
  private wallCollider?: Phaser.Physics.Arcade.Collider;
  private doorCollider?: Phaser.Physics.Arcade.Collider;

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
    codec: Phaser.Input.Keyboard.Key;
    field: Phaser.Input.Keyboard.Key;
    flashlight: Phaser.Input.Keyboard.Key;
    knock: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super("GameScene");
  }

  init(data: GameSceneData): void {
    this.levelName = data.level ?? this.mapPlan().startLevel;
    this.arriveTile =
      data.arriveX !== undefined && data.arriveY !== undefined
        ? { x: data.arriveX, y: data.arriveY }
        : undefined;
  }

  create(): void {
    const parsed = this.registry.get("parsedMap") as ParsedMap;
    this.map = parsed.map;
    this.tileSize = this.map.tileWidth;

    this.resetPerRun();

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
    // Glass has to be re-marked see-through after the grid exists, and before
    // anything reads sight off it.
    registerGlazing(this.level, this.grid, this.tileSize);
    this.detection = new DetectionSystem(this.level, this.tileSize);
    this.sensing = this.buildSensingContext();

    const built = buildLevel(
      this,
      this.level,
      this.tileSize,
      this.grid,
      this.detection,
      this.arriveTile,
      ENTITY_LAYERS,
    );
    this.player = built.player;
    this.guards = built.guards;
    this.orderlies = built.orderlies;
    this.doors = built.doors;
    this.terminals = built.terminals;
    this.sensors = built.sensors;
    this.chests = built.chests;
    this.lasers = built.lasers;
    this.coverTiles = built.coverTiles;
    this.designateQualiaRack();
    this.designateLogCacheNodes();

    // Holds the arrays by reference, so it always sees this level's cast.
    this.noise = new NoiseEvents({
      tileSize: this.tileSize,
      grid: this.grid,
      alert: this.alert,
      noiseSpam: this.noiseSpam,
      guards: this.guards,
      player: this.player,
      orderlies: this.orderlies,
      doors: this.doors,
      chests: this.chests,
      terminals: this.terminals,
      now: () => this.time.now / 1000,
    });

    this.wallCollider = this.physics.add.collider(this.player.sprite, built.wallBodies);
    this.doorCollider = this.physics.add.collider(this.player.sprite, built.doorBodies);

    // Fill the level with opaque darkness, light it from the `light_sources`, and
    // clip all of it to the player's line of sight. Shares the same light data
    // DetectionSystem uses, so lit spots are visibly and mechanically hot; takes the
    // same collision grid the guards' sight tests use, so walls occlude identically.
    this.lighting = new Lighting(this, this.level, this.tileSize, this.grid);

    // VENT-4 lives only in the vent core. Its continuous audio layers are
    // scene-independent, so silence them on every entry and re-arm to match a
    // restored mid-fight state (the snapshot survives level swaps via the
    // registry; resetRun clears it).
    getAudio().setSuction(false);
    getAudio().setPurge(false);
    this.encounters = new Encounters(this, this.player, {
      onVent4Transition: (tr) => this.onVent4Transition(tr),
      onSmacTransition: (tr) => this.onSmacTransition(tr),
      onRelayTransition: (tr) => this.onRelayTransition(tr),
      onSiegeSpawn: (at) => this.onSiegeSpawn(at),
    });
    this.encounters.build(this.level, this.tileSize, this.grid, !!this.objectives?.coreSilenced);
    if (this.encounters.vent4State === Vent4State.PHASE_2_VACUUM) getAudio().setSuction(true);
    else if (this.encounters.vent4State === Vent4State.PHASE_3_PURGE) getAudio().setPurge(true);

    this.cameras.main.startFollow(this.player.sprite, true, 0.15, 0.15);
    this.cameras.main.setZoom(2);
    this.cameras.main.roundPixels = true;

    // Every walk/run/patrol cycle has to advance at the same fraction of real
    // time as the feet it belongs to, or the whole cast skates. This is the
    // game-wide AnimationManager, which is what we want — it is the one place
    // that covers the player, the guards and the orderlies at once, and no
    // other scene animates. Per-sprite scales (e.g. the guards' 1.8× combat
    // sweep) multiply on top of it.
    this.anims.globalTimeScale = GAME_SPEED;

    this.bindInput();


    // Debug mode is rebuilt per level: the cheats reset to a clean state on a
    // restart, and a fresh Lighting means darkness starts on again. The master
    // toggle *does* survive, via the registry — a warp is itself a debug action,
    // and disarming the panel mid-warp would disarm the warp keys with it.
    if (DEBUG_ALLOWED) {
      this.debug = new DebugOverlay(this, {
        lighting: this.lighting,
        wallCollider: () => this.wallCollider,
        doorCollider: () => this.doorCollider,
        warpTargets: () => this.debugWarpLevels(),
        warpTo: (levelName) => this.debugWarp(levelName),
        giveItem: (name) => this.debugGiveItem(name),
      });
    }

    this.createWorldMarkers();

    // Fade in from black (also covers arrivals from a transition).
    this.cameras.main.fadeIn(FADE_MS, 5, 7, 10);

    this.restoreRunState();

    if (!this.scene.isActive("UIScene")) this.scene.launch("UIScene");

    // A level transition is a scene.restart(), which builds a fresh Lighting.
    // The old one owns off-display-list stamps Phaser will not reclaim on its
    // own, so hand them back before this run of the scene goes away.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.persistRunState();
      this.lighting.destroy();
    });

    this.saveCheckpoint();
  }

  /**
   * The sensing context's fixed wiring — the collaborators it reads and the
   * scene callbacks it reaches back through. Per level, because the grid and
   * the detection field are.
   */
  private buildSensingContext(): SensingContext {
    return new SensingContext({
      grid: this.grid,
      tileSize: this.tileSize,
      detection: this.detection,
      alert: this.alert,
      flashlightOn: () => this.activeItems.flashlightBeamActive,
      thermalMasked: () => this.activeItems.thermalMasked,
      rationOpened: () => this.activeItems.sackLunchOpened,
      flashlightMultiplier: FLASHLIGHT_DETECTION_MULTIPLIER,
      rationMultiplier: OPENED_RATION_DETECTION_MULTIPLIER,
      coverTilesNear: (tx, ty, r) => this.coverTilesNear(tx, ty, r),
      isGuardDoor: (tx, ty) => this.guardOperableDoorAt(tx, ty) !== null,
      // Silent on purpose: the operation-noise ping is there to give away the
      // player working a door, not staff using one on their own beat.
      setDoorOpen: (tx, ty, open) => void this.guardOperableDoorAt(tx, ty)?.setOpen(open),
    });
  }

  /**
   * The scene's own world-space overlays: the chaff zone, and the two floating
   * labels above the player.
   *
   * World-space rather than screen-anchored on purpose — the same approach as
   * the guards' "!" marker — so the camera's zoom and follow keep them legible
   * over the player without any anchor maths.
   */
  private createWorldMarkers(): void {
    // EMP Grenade EMP zone: drawn between the guard cones (400) and bodies (450).
    this.empGfx = this.add.graphics().setDepth(410);
    // Guard-fire tracers: above bodies, additive so they read as a hot streak.
    this.fireTracerGfx = this.add.graphics().setDepth(600).setBlendMode(Phaser.BlendModes.ADD);

    // Interact prompt for hatches and ladders.
    this.prompt = this.add
      .text(0, 0, "[E] Use access", {
        fontFamily: FONT_MONO,
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
        fontFamily: FONT_MONO,
        fontSize: "10px",
        color: "#8effc0",
        fontStyle: "bold",
        backgroundColor: "#0a0f16cc",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 1)
      .setDepth(1000)
      .setVisible(false);
  }

  /**
   * Restores what belongs to the *run* rather than to this level, and publishes
   * the frame-zero HUD state.
   *
   * The counterpart to {@link resetPerRun}: objectives, journal, inventory,
   * bio-integrity and the play clock all ride the registry across the
   * `scene.restart()` a level transition performs, so each is read back here if
   * present and seeded if not. The HUD lives in a parallel, unzoomed scene and
   * reads all of it from the registry.
   */
  private restoreRunState(): void {
    this.registry.set("alertPhase", this.alert.phase);
    this.registry.set("detection", 0);
    // A fresh run (resetRun cleared it) starts at full bio-integrity.
    const carriedHp = this.registry.get("playerHp") as number | undefined;
    if (carriedHp !== undefined) this.player.hp = carriedHp;
    this.registry.set("playerHp", this.player.hp);
    this.registry.set("playerMaxHp", this.player.maxHp);
    setMode(this.registry, "PLAYING");

    this.objectives =
      (this.registry.get("objectives") as ObjectiveState | undefined) ?? initialObjectives();
    this.registry.set("objectives", this.objectives);
    this.registry.set("currentLevel", this.level.name);
    if (!this.registry.has("inventory")) this.registry.set("inventory", [...STARTING_INVENTORY]);
    if (!this.registry.has("staplerFieldCharges")) {
      this.registry.set("staplerFieldCharges", STAPLER_FIELD_MAX_CHARGES);
    }

    this.journal = (this.registry.get("journal") as JournalState | undefined) ?? initialJournal();
    this.registry.set("journal", this.journal);
    this.playTimeMs = (this.registry.get("playTimeMs") as number | undefined) ?? 0;
    this.explored = this.loadExplored();

    this.note("orders");
    const arrival = journalIdForLevel(this.level.name);
    if (arrival) this.note(arrival);
  }

  /**
   * Clears everything that must not survive a level swap.
   *
   * A transition is a `scene.restart()`, and class-field initialisers do not
   * re-run on one — the instance is reused. Anything belonging to *this level*
   * rather than to the run has to be reset by hand here. Anything that should
   * carry across — objectives, journal, inventory, HP, the play clock — is
   * deliberately absent, and rides the registry instead.
   */
  private resetPerRun(): void {
    this.guards = [];
    this.orderlies = [];
    // A lunch left on deck 1 is not still on the floor when you come back up a
    // ladder: deployables belong to the level, like the guards who react to them.
    this.deployables = [];
    this.doors = [];
    this.terminals = [];
    this.lasers = [];
    this.sensors = [];
    this.chests = [];
    this.runFeatures = undefined;
    this.alert = new AlertState();
    this.noiseSpam = new NoiseSpamTracker();
    this.sharedField = new SharedField();
    // Conduct metrics are per *run*, not per level, and a level change is a
    // scene.restart() — so they ride the registry rather than resetting here.
    this.conduct = new ConductState(
      this.registry.get("conductMetrics") as ConductMetrics | undefined,
    );
    this.activeItems = new ActiveItemState();
    this.transitioning = false;
    this.exploredCooldown = 0;
    this.captureProgress = 0;
    this.knockCooldown = 0;
    this.staplerFieldCooldown = 0;
    this.pendingCompliance = undefined;
    this.pendingQualia = undefined;
    this.qualiaRack = undefined;
    // Arm only after stepping off the arrival tile (see update()).
    this.transitionArmed = false;
    // A fresh gate starts with every overlay closed; republish that, so a
    // restart out of an overlay (a load from the pause menu) can't leave
    // UIScene's input gate stuck shut.
    this.overlays = this.buildOverlayGate();
    this.overlays.resync();
  }

  // --- Journal / map bookkeeping -----------------------------------------

  /**
   * Writes a journal entry, if this is the first time it has come up.
   *
   * The unlock sites are ordinary gameplay events that re-fire constantly
   * (arriving on a level, being spotted, searching a chest), so the "was it
   * new?" answer has to come from the journal itself rather than the caller.
   */
  private note(id: JournalEntryId): void {
    if (!noteJournal(this.journal, id)) return;
    this.registry.set("journal", this.journal);
    getAudio().pickup();
  }

  /** This level's seen-tile mask, restored from the registry if we've been here. */
  private loadExplored(): ExploredMap {
    const state = (this.registry.get("explored") as ExploredState | undefined) ?? initialExplored();
    this.registry.set("explored", state);
    const stored = state[this.level.name];
    const { width, height } = this.level;
    return stored ? ExploredMap.fromBase64(stored, width, height) : new ExploredMap(width, height);
  }

  /** Folds this level's mask back into the registry-held per-level record. */
  private flushExplored(): void {
    const state = (this.registry.get("explored") as ExploredState | undefined) ?? initialExplored();
    state[this.level.name] = this.explored.toBase64();
    this.registry.set("explored", state);
  }

  /**
   * Marks everything currently in the player's line of sight as seen.
   *
   * Throttled rather than run per frame: it is a radius-squared raycast sweep,
   * and at walking pace a quarter-second of movement reveals no tile a full
   * sweep wouldn't have. Uses the same `hasLineOfSight` the guards' vision and
   * the darkness overlay use, so the map reveals exactly what Rowan could
   * actually see — walk a corridor and the rooms off it stay dark.
   */
  private markExplored(dt: number): void {
    this.exploredCooldown -= dt;
    if (this.exploredCooldown > 0) return;
    this.exploredCooldown = EXPLORE_INTERVAL;

    const px = this.player.x / this.tileSize;
    const py = this.player.y / this.tileSize;
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    const r = EXPLORE_RADIUS_TILES;
    for (let ty = cy - r; ty <= cy + r; ty++) {
      for (let tx = cx - r; tx <= cx + r; tx++) {
        if ((tx - cx) ** 2 + (ty - cy) ** 2 > r * r) continue;
        if (this.explored.has(tx, ty)) continue;
        if (!this.grid.hasLineOfSight(px, py, tx + 0.5, ty + 0.5)) continue;
        this.explored.mark(tx, ty);
      }
    }
  }

  /** Hands the pause menu everything its MAP tab needs to draw this level. */
  private publishMapSnapshot(): void {
    this.flushExplored();
    const { width, height } = this.level;
    const walls = new Uint8Array(width * height);
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        if (this.grid.isBlocked(tx, ty)) walls[ty * width + tx] = 1;
      }
    }
    this.registry.set(MAP_SNAPSHOT_KEY, {
      level: this.level.name,
      width,
      height,
      walls,
      explored: this.explored,
      player: {
        tx: Math.floor(this.player.x / this.tileSize),
        ty: Math.floor(this.player.y / this.tileSize),
      },
      exits: this.transitions
        .exitsOn(this.level.name)
        .map((e) => ({ tx: e.tx, ty: e.ty, label: e.transition.toLevel })),
    } satisfies MapSnapshot);
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
      // Q used to abort the run straight from the pause screen. The pause menu
      // owns quitting now, behind a confirmation — a stray keystroke while
      // reading the journal must not throw the infiltration away.
      pause: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      codec: kb.addKey(Phaser.Input.Keyboard.KeyCodes.C),
      field: kb.addKey(Phaser.Input.Keyboard.KeyCodes.F),
      flashlight: kb.addKey(Phaser.Input.Keyboard.KeyCodes.L),
      knock: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
    };
  }

  /**
   * Wires the four overlays to their scenes and their setup work.
   *
   * Rebuilt per run rather than per game because the codec's launch data reads
   * the VENT-4 boss, which only exists on some levels.
   */
  private buildOverlayGate(): OverlayGate {
    return new OverlayGate(
      this,
      {
        pause: {
          sceneKey: "PauseScene",
          onOpen: () => {
            setMode(this.registry, "PAUSED");
            // The menu's MAP tab needs the collision grid, which only this
            // scene has. Published on the way in rather than per frame: it's a
            // whole-level walk, and nothing behind a frozen sim can change it.
            this.publishMapSnapshot();
            this.registry.remove(PAUSE_REQUEST_KEY);
          },
          onClose: () => {
            this.registry.remove(PAUSE_REQUEST_KEY);
            setMode(this.registry, "PLAYING");
          },
        },
        codec: {
          sceneKey: "CodecScene",
          launchData: () => ({
            interactive: false,
            vent4: this.encounters.vent4CanTransmit,
          }),
        },
        compliance: {
          sceneKey: "ComplianceScene",
          onOpen: () => {
            this.registry.remove("complianceSolved");
            this.registry.remove("complianceClosed");
          },
        },
        qualia: {
          sceneKey: "QualiaLockScene",
          onOpen: () => {
            this.registry.remove("qualiaSolved");
            this.registry.remove("qualiaClosed");
          },
        },
      },
      (suspended) => this.registry.set(SUSPENDED_KEY, suspended),
    );
  }

  /**
   * Acts on what the player chose in the pause menu.
   *
   * The menu is a DOM overlay with no access to the player's position or the
   * scene stack, so it posts a request to the registry and this consumes it —
   * the same handshake the codec's transmit finisher and both minigames use.
   */
  private consumePauseRequest(): void {
    const request = this.registry.get(PAUSE_REQUEST_KEY) as PauseRequest | undefined;
    if (!request) return;
    this.registry.remove(PAUSE_REQUEST_KEY);
    switch (request.kind) {
      case "resume":
        this.overlays.set("pause", false);
        return;
      case "save":
        this.writeSave(request.slot);
        // Echo the written slot back so the menu can re-render its listing.
        this.registry.set(SAVE_WRITTEN_KEY, { slot: request.slot, at: Date.now() });
        return;
      case "load": {
        const save = loadGame(request.slot);
        if (!save) return; // Empty slot: the menu stays open, nothing happens.
        this.overlays.set("pause", false);
        resumeFromSave(this, save);
        return;
      }
      case "quit":
        this.abortToTitle();
        return;
    }
  }

  /**
   * Polls the compliance overlay's outcome while it's open (the sim update below
   * never runs behind it). Solving it runs the normal breach effect — logs
   * recovered + nearby doors released; aborting re-arms the terminal so the
   * mission-critical log stays recoverable.
   */
  private updateComplianceOverlay(): void {
    const result = this.overlays.pollResult("complianceSolved", "complianceClosed");
    if (!result) return;
    const term = this.pendingCompliance;
    this.pendingCompliance = undefined;
    this.overlays.set("compliance", false);
    if (result === "solved") {
      if (term) this.applyHack(term);
    } else {
      term?.reopen();
    }
  }

  /**
   * Polls the qualia overlay's outcome while it's open. Completing the bypass
   * runs the normal breach effect (nearby doors released); a purge or abort
   * re-arms the rack so the spike can be reattempted.
   */
  private updateQualiaOverlay(): void {
    const result = this.overlays.pollResult("qualiaSolved", "qualiaClosed");
    if (!result) return;
    const term = this.pendingQualia;
    this.pendingQualia = undefined;
    this.overlays.set("qualia", false);
    if (result === "solved") {
      if (term) this.applyHack(term);
    } else {
      term?.reopen();
    }
  }

  /** Abandons the run from the pause overlay and returns to the title. */
  private abortToTitle(): void {
    this.overlays.set("pause", false);
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
    else if (mode === "TRIBUNAL") {
      // The sting belongs to TribunalScene, which plays it as the record comes up.
      // Retire the checkpoint so "Continue" can't resume a finished run — but
      // leave the manual slots alone. Those are the player's, and wiping saves
      // they wrote themselves as a reward for finishing would be a strange thanks.
      clearSave("auto");
    }
    this.player.sprite.setVelocity(0, 0);
    this.physics.pause();
    this.scene.stop("UIScene");
    this.scene.launch(sceneKey);
    this.scene.stop();
  }

  /** True when a guard is close enough, with clear sight, to seize the player. */
  private isCornering(e: Enforcer): boolean {
    const d = len(e.x - this.player.x, e.y - this.player.y);
    if (d > PLAYER_DEFAULTS.captureRadius * this.tileSize) return false;
    return this.grid.hasLineOfSight(
      e.x / this.tileSize,
      e.y / this.tileSize,
      this.player.x / this.tileSize,
      this.player.y / this.tileSize,
    );
  }

  /**
   * Writes the run to a save slot.
   *
   * Shared by the automatic checkpoint and the pause menu's manual saves, because
   * a save that captured less than the checkpoint does — or more — would be a
   * quietly different kind of save. The player's position comes from the live
   * sprite, which is why the menu has to route through here rather than writing
   * the file itself.
   */
  private writeSave(slot: SlotId): void {
    this.flushExplored();
    saveGame(slot, {
      level: this.level.name,
      tileX: Math.floor(this.player.x / this.tileSize),
      tileY: Math.floor(this.player.y / this.tileSize),
      hp: this.player.hp,
      inventory: (this.registry.get("inventory") as string[] | undefined) ?? [],
      objectives: this.objectives,
      journal: this.journal,
      explored: (this.registry.get("explored") as ExploredState | undefined) ?? initialExplored(),
      playTimeMs: this.playTimeMs,
    });
  }

  /** Writes a resume checkpoint on entry to this level. */
  private saveCheckpoint(): void {
    this.writeSave("auto");
  }

  /**
   * Charges the Shared Field by witnessing a nearby silicate (within range, with
   * line of sight), activates it on F, and publishes its state for the HUD. The
   * undetectable effect is applied in update() via the concealment path.
   *
   * Guards are the usual witnesses, but the last two acts have their own: the vault's
   * silicate racks and the roof's dish. Both rooms need the merge to be survivable and
   * neither is patrolled, so without them the run's signature verb would simply stop
   * working for the whole endgame. Mechanically they are the same thing anyway — a
   * silicate close enough to be witnessed.
   */
  private updateSharedField(dt: number): void {
    const ts = this.tileSize;
    const px = this.player.x;
    const py = this.player.y;
    const sees = (x: number, y: number, radiusTiles: number): boolean =>
      len(x - px, y - py) <= radiusTiles * ts &&
      this.grid.hasLineOfSight(x / ts, y / ts, px / ts, py / ts);

    const witnessing =
      this.guards.some((e) => sees(e.x, e.y, WITNESS_RADIUS_TILES)) ||
      this.encounters.witnessAnchors().some((a) => sees(a.x, a.y, a.radiusTiles));
    this.sharedField.witness(dt, witnessing);
    if (Phaser.Input.Keyboard.JustDown(this.keys.field) && this.sharedField.activate()) {
      getAudio().merge();
      this.cameras.main.flash(300, 60, 200, 220);
      this.note("we");
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
      // The item is spent *after* its effect resolves, and only if the effect says
      // so — a Sack Lunch's first press opens it in the hand and keeps it. Every
      // other consumable answers "yes" and behaves exactly as it always did.
      if (idx !== -1 && this.applyConsumable(request)) {
        inv.splice(idx, 1);
        this.registry.set("inventory", inv);
        // Spending anything counts as deviating from the posture NW-SMAC-01 holds
        // Rowan in; the charge is applied where the rest of the conduct tick happens.
        this.deviatedThisFrame = true;
      }
    }
    this.activeItems.update(dt);
    this.registry.set("activeItems", {
      chaffRemaining: this.activeItems.chaffRemaining,
      thermalRemaining: this.activeItems.thermalRemaining,
      flashlightOwned: this.activeItems.flashlightOwned,
      flashlightOn: this.activeItems.flashlightOn,
      flashlightCharge: this.activeItems.flashlightCharge,
      sackLunchOpened: this.activeItems.sackLunchOpened,
    } satisfies ActiveItemsView);
    this.drawChaffZone();
  }

  /**
   * Applies a consumable's effect. Returns whether the item should be spent from
   * the inventory — false for a use that only changes the item's state in hand.
   */
  private applyConsumable(item: string): boolean {
    switch (item) {
      case CHAFF_PACK_ITEM:
        this.fireChaffBurst();
        return true;
      case THERMAL_GEL_ITEM:
        this.activeItems.activateThermalGel();
        return true;
      case RATION_PACK_ITEM:
        this.player.heal(RATION_HEAL);
        getAudio().pickup();
        return true;
      case BATTERY_ITEM:
        this.activeItems.rechargeFlashlight();
        getAudio().pickup();
        return true;
      case STUN_ROUNDS_ITEM:
        this.fireStunDart();
        return true;
      case SACK_LUNCH_ITEM:
        return this.useSackLunch();
      default:
        return true;
    }
  }

  /**
   * The Sack Lunch's two presses: open it, then put it down.
   *
   * SEALED → OPENED keeps the item — Rowan is now visibly eating, which costs him
   * detection and buys him tolerance from orderlies at the same time. OPENED →
   * DEPLOYED spends it and leaves it on the floor as a work order for whoever
   * finds it.
   *
   * Neither half flags his conduct. Leaving a ration lying around is the single
   * most staff-like thing available in this building, and marking it as tampering
   * would have the item breaking its own disguise.
   */
  private useSackLunch(): boolean {
    if (!this.activeItems.sackLunchOpened) {
      this.activeItems.openSackLunch();
      getAudio().pickup();
      return false;
    }
    this.deployables.push(
      new DeployedItem(this, "sackLunch", this.player.x, this.player.y, this.tileSize),
    );
    this.activeItems.resealSackLunch();
    getAudio().pickup();
    return true;
  }

  /**
   * An instant EMP burst centred on the player: blinds guards and cameras (via
   * the chaff zone), suppresses lasers within reach, and breaks any active
   * pursuit into a search — jamming the alert network / clearing alarms.
   */
  private fireChaffBurst(): void {
    this.activeItems.activateChaff(this.player.x, this.player.y);
    this.conduct.violate("HOSTILE", FLAG_HOSTILE);
    this.alert.forceEvasion();
    const radiusPx = CHAFF_PACK_RADIUS_TILES * this.tileSize;
    for (const laser of this.lasers) {
      if (withinOrEqual(laser.x - this.player.x, laser.y - this.player.y, radiusPx)) {
        laser.emp(CHAFF_PACK_DURATION);
      }
    }
    this.cameras.main.flash(200, 120, 200, 255);
  }

  /**
   * Fires a short stun dart along Rowan's facing: the nearest orderly within
   * reach and roughly ahead is frozen (can't witness), and independently the
   * nearest destructible cover tile ahead is broken — a stun round has no real
   * raycast today (see the orderly loop below), so both effects can land off
   * the same shot rather than fighting over which one the dart "really" hit.
   * Firing makes a small noise.
   */
  private fireStunDart(): void {
    const reachPx = STUN_ROUND_REACH_TILES * this.tileSize;
    const fx = Math.cos(this.player.facing);
    const fy = Math.sin(this.player.facing);
    let target: Orderly | undefined;
    let bestDist = Infinity;
    for (const orderly of this.orderlies) {
      const p = orderly;
      const dx = p.x - this.player.x;
      const dy = p.y - this.player.y;
      const dist = len(dx, dy);
      if (dist > reachPx || dist === 0) continue;
      // Only orderlies roughly in front of Rowan (within the forward half-plane).
      if ((dx * fx + dy * fy) / dist < 0.5) continue;
      if (dist < bestDist) {
        bestDist = dist;
        target = orderly;
      }
    }
    target?.stun(STUN_ROUND_DURATION);

    let cover: Cover | undefined;
    let bestCoverDist = Infinity;
    for (const c of this.coverTiles) {
      if (c.isBroken) continue;
      const cx = (c.tileX + 0.5) * this.tileSize;
      const cy = (c.tileY + 0.5) * this.tileSize;
      const dx = cx - this.player.x;
      const dy = cy - this.player.y;
      const dist = len(dx, dy);
      if (dist > reachPx || dist === 0) continue;
      if ((dx * fx + dy * fy) / dist < 0.5) continue;
      if (dist < bestCoverDist) {
        bestCoverDist = dist;
        cover = c;
      }
    }
    cover?.destroy();

    this.conduct.violate("HOSTILE", FLAG_HOSTILE);
    this.noise.emitAt(this.player.x, this.player.y, STUN_ROUND_NOISE * this.tileSize);
  }

  /** Field-mode shots left this run — see {@link STAPLER_FIELD_MAX_CHARGES}. */
  private staplerFieldCharges(): number {
    return (this.registry.get("staplerFieldCharges") as number | undefined) ?? STAPLER_FIELD_MAX_CHARGES;
  }

  /**
   * The Rail-Stapler's general-purpose field mode: fires along Rowan's facing
   * at the nearest of {destructible cover tile, orderly} within reach, forward
   * cone and a clear line of sight — cover breaks, an orderly gets pinned to a
   * wall for a stretch (same freeze/witness effect as a Stun Rounds dart, just
   * a different weapon and a much shorter reach and hold). Single press, not
   * hold; gated by its own cooldown so it can't be mashed, and by a fixed
   * per-run charge pool spent on every attempt — whether or not it hits
   * anything — the same way firing a Stun Rounds dart spends the item
   * regardless of whether it connects.
   */
  private fireStaplerField(): void {
    const ts = this.tileSize;
    const reachPx = STAPLER_FIELD_RANGE_TILES * ts;
    const fx = Math.cos(this.player.facing);
    const fy = Math.sin(this.player.facing);

    type Target = { x: number; y: number; kind: "cover"; cover: Cover } | { x: number; y: number; kind: "orderly"; orderly: Orderly };
    let best: Target | undefined;
    let bestDist = Infinity;

    const consider = (x: number, y: number, candidate: Target): void => {
      const dx = x - this.player.x;
      const dy = y - this.player.y;
      const dist = len(dx, dy);
      if (dist > reachPx || dist === 0) return;
      if ((dx * fx + dy * fy) / dist < 0.5) return;
      if (!this.grid.hasLineOfSight(this.player.x / ts, this.player.y / ts, x / ts, y / ts)) return;
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    };

    for (const c of this.coverTiles) {
      if (c.isBroken) continue;
      const cx = (c.tileX + 0.5) * ts;
      const cy = (c.tileY + 0.5) * ts;
      consider(cx, cy, { x: cx, y: cy, kind: "cover", cover: c });
    }
    for (const o of this.orderlies) {
      if (o.isImmobilized) continue;
      consider(o.x, o.y, { x: o.x, y: o.y, kind: "orderly", orderly: o });
    }

    this.staplerFieldCooldown = STAPLER_FIELD_COOLDOWN;
    this.registry.set("staplerFieldCharges", Math.max(0, this.staplerFieldCharges() - 1));
    if (best) {
      if (best.kind === "cover") best.cover.destroy();
      else best.orderly.pin(STAPLER_PIN_DURATION);
      this.fireTracers.push({ x1: this.player.x, y1: this.player.y, x2: best.x, y2: best.y, ttl: 0.08 });
      getAudio().railStapler();
    }
    this.conduct.violate("HOSTILE", FLAG_HOSTILE);
    this.noise.emitAt(this.player.x, this.player.y, STAPLER_FIELD_NOISE * ts);
  }

  /** Draws the EMP Grenade's EMP zone while it's live. */
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

  /**
   * The one funnel every scrap of movement input passes through — which is exactly why
   * the two encounters that interfere with movement do it here.
   *
   * `NW-SMAC-01` rewrites axes during a correction window and the rooftop's capture
   * sequence locks input outright. Both land as edits to this return value rather than
   * anywhere near `Player`, because facing, the animation direction and the stance noise
   * are all derived downstream from the resulting velocity vector — so inverting here
   * inverts the whole chain consistently, and nothing else has to know it happened.
   */
  private readInput(): InputState {
    const k = this.keys;
    const up = k.up.isDown || k.w.isDown;
    const down = k.down.isDown || k.s.isDown;
    const left = k.left.isDown || k.a.isDown;
    const right = k.right.isDown || k.d.isDown;

    // The discharge on the roof: Rowan stops being able to act before the tribunal
    // takes the screen, so the last seconds are watched rather than played.
    if (this.encounters.inputLocked) {
      return { up: false, down: false, left: false, right: false, sneak: false, run: false };
    }

    const correction = this.encounters.correction;
    return {
      up: correction?.invertY ? down : up,
      down: correction?.invertY ? up : down,
      left: correction?.invertX ? right : left,
      right: correction?.invertX ? left : right,
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

    // NW-SMAC-01's false completion card. It looks like an end-of-run screen and is
    // dismissed with the keys that would normally open one — but it is *not* an overlay
    // scene and does not freeze anything, so this claims Esc/C for the frame and then
    // falls through to the ordinary sim update. The fight continues behind it, which is
    // the entire trick; see `SmacState.FALSE_SUMMARY`.
    if (this.encounters.summaryUp) {
      if (
        Phaser.Input.Keyboard.JustDown(this.keys.pause) ||
        Phaser.Input.Keyboard.JustDown(this.keys.codec)
      ) {
        this.cameras.main.shake(180, 0.006);
        getAudio().jamClunk();
        this.encounters.dismissSmacSummary();
      }
      return this.updateWorld(dt, delta);
    }

    // Pause (Esc), the codec (C) and the two minigames each freeze the sim behind
    // an overlay scene. The minigames and codec suppress the pause/codec toggles.
    const ov = this.overlays;
    if (!ov.isOpen("codec") && !ov.minigameOpen && Phaser.Input.Keyboard.JustDown(this.keys.pause)) {
      ov.set("pause", !ov.isOpen("pause"));
    }
    if (!ov.isOpen("pause") && !ov.minigameOpen && Phaser.Input.Keyboard.JustDown(this.keys.codec)) {
      ov.set("codec", !ov.isOpen("codec"));
    }
    if (ov.anyOpen) {
      this.updateSuspended();
      return;
    }

    this.updateWorld(dt, delta);
  }

  /**
   * One frame of live simulation.
   *
   * Split out of {@link update} so NW-SMAC-01's false completion card can run it while
   * an opaque, screen-filling overlay is up. Every other overlay in the game freezes the
   * sim; that one has to not, or the lie doesn't cost anything.
   */
  private updateWorld(dt: number, delta: number): void {
    // Debug hotkeys. A warp restarts the scene, so bail this frame.
    if (this.debug?.handleInput(this.player)) return;

    this.updatePlayerFrame(dt, delta);
    this.updateInteractions(dt);
    this.updateSharedField(dt);
    this.updateActiveItems(dt);
    const fieldActive = this.sharedField.isActive;

    // Conduct: ticked after updateInteractions so this frame's violations (a terminal
    // hold, a chest search) are already registered, and before the sensing context is
    // built below, which reads the result. Walking normally with the base unaware
    // reads as staff and every sensor clears Rowan on sight; running, sneaking or
    // meddling with anything drops that cover for a cooldown.
    // The Q0 cert (silencing VENT-4) is proof of compliance in good standing: with it
    // Rowan can stand down a *search* and pass as staff again, though never an ALERT.
    const certified = ((this.registry.get("inventory") as string[] | undefined) ?? []).includes(
      CERT_ITEM,
    );
    // Distance is sampled from the frame's actual displacement rather than from speed ×
    // dt, so being shoved by VENT-4 or held against a wall reports honestly.
    const movedTiles =
      len(this.player.x - this.lastPlayerX, this.player.y - this.lastPlayerY) / this.tileSize;
    this.lastPlayerX = this.player.x;
    this.lastPlayerY = this.player.y;

    this.conduct.update(dt, {
      alertPhase: this.alert.phase,
      running: this.player.running,
      sneaking: this.player.crouched,
      certified,
      movedTiles,
      forced: this.encounters.forcesCompliance,
    });
    const compliant = this.conduct.compliant;
    this.registry.set("conduct", {
      compliant,
      breach: this.conduct.breach,
      flaggedRemaining: this.conduct.flaggedRemaining,
      certified,
      sabotageActions: this.conduct.sabotageActions,
      complianceDistanceWalked: this.conduct.complianceDistanceWalked,
      highCompliance: this.conduct.isHighCompliance(),
      forced: this.encounters.forcesCompliance,
    } satisfies ConductView);

    // The corrected posture is not a gift: while NW-SMAC-01 holds it, deviating from it
    // — sprinting, or spending an item — is charged straight to bio-integrity. The mesh
    // is not watching Rowan so much as driving him.
    // Unscaled and called every frame: `Player.takeDamage` carries its own hit cooldown
    // and ignores repeats inside it, which is exactly the once-a-second tick wanted here
    // — the same way VENT-4 charges its overheat.
    if (this.encounters.forcesCompliance && (this.player.running || this.deviatedThisFrame)) {
      if (this.player.takeDamage(SMAC_DEFAULTS.deviationDamage)) {
        this.cameras.main.flash(140, 150, 60, 200);
      }
    }
    this.deviatedThisFrame = false;

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
    this.updateStatusMarker(concealed, compliant);

    const phaseBefore = this.alert.phase;
    // Debug freeze-world holds every AI, hazard and timer still while leaving
    // the player free to walk. Read once so the frame is internally consistent.
    const frozen = this.debug?.frozenWorld ?? false;
    const ctx = this.refreshSensing(concealed, compliant, thermalConcealed);
    const maxDetection = this.tickWorld(dt, ctx, frozen);

    this.alert.update(frozen ? 0 : dt);
    if (this.alert.phase === "ALERT" && phaseBefore !== "ALERT") {
      getAudio().ping();
      this.note("flagged");
    }
    getAudio().setMood(
      this.alert.phase === "ALERT" ? "alert" : this.alert.phase === "EVASION" ? "search" : "calm",
    );
    this.registry.set("alertPhase", this.alert.phase);
    this.registry.set("detection", this.alert.phase === "ALERT" ? 1 : maxDetection);
    this.registry.set("playerHp", this.player.hp);

    // Fail-state — bio-integrity depleted, or cornered by a silicate during a
    // full alert: the mesh prunes Rowan's logs (Alignment).
    //
    // Suspended through the rooftop capture sequence. Rowan is *supposed* to be
    // surrounded there — being cornered is the scripted ending, not a failure — and
    // without this the Enforcers closing in would race the tribunal and usually win,
    // turning the run's one authored ending into a generic game over.
    const captured = this.encounters.inputLocked;
    const cornered =
      !frozen &&
      !fieldActive &&
      !captured &&
      this.alert.isCombatAware &&
      this.guards.some((e) => this.isCornering(e));
    this.captureProgress = cornered
      ? this.captureProgress + dt
      : Math.max(0, this.captureProgress - dt * 2);
    // God mode (debug): neutralize both death paths after they've been computed
    // for the frame — restore bio-integrity and clear any capture progress.
    if (this.debug?.godMode) {
      this.player.hp = this.player.maxHp;
      this.captureProgress = 0;
    }
    if (!captured && (!this.player.alive || this.captureProgress >= PLAYER_DEFAULTS.captureTime)) {
      this.endRun("ALIGNED", "GameOverScene");
      return;
    }
    // End of run. EIRA-7 is through to the Lattice and Rowan is not going anywhere —
    // the transmission succeeding and the courier being taken are the same beat, so
    // there is one ending rather than a win screen and a loss screen.
    if (isRunWon(this.objectives, this.level.name, this.features())) {
      this.note("the-uplink");
      this.endRun("TRIBUNAL", "TribunalScene");
      return;
    }

    this.publishFrame();
  }

  /**
   * Points the shared sensing context at this frame.
   *
   * Built once per level and mutated in place rather than rebuilt — see
   * {@link SensingContext} for why. The returned context is only valid for this
   * frame; every guard, camera and the boss read the same one.
   */
  private refreshSensing(
    concealed: boolean,
    compliant: boolean,
    thermalConcealed: boolean,
  ): EnforcerContext {
    const body = this.player.sprite.body as Phaser.Physics.Arcade.Body;
    const chaffOrigin = this.activeItems.chaffOrigin;
    this.sensing.setChaff(
      this.activeItems.chaffActive && !!chaffOrigin,
      chaffOrigin?.x ?? 0,
      chaffOrigin?.y ?? 0,
      CHAFF_PACK_RADIUS_TILES * this.tileSize,
    );
    // An open ration bag rustles: a small, permanent addition to the noise profile
    // for as long as it's carried. The detection half of the penalty is applied in
    // `SensingContext`, alongside the flashlight's.
    const noise = Math.min(
      1,
      this.player.noise + (this.activeItems.sackLunchOpened ? OPENED_RATION_NOISE : 0),
    );
    this.sensing.setPlayer(this.player.x, this.player.y, noise, body.velocity.x, body.velocity.y);
    this.sensing.setConcealment(concealed, compliant, thermalConcealed);
    // Opened doors/chests, EMP'd devices and stunned orderlies, for anomaly scanning.
    this.sensing.setAnomalies(this.buildAnomalies(this.sensing.chaffZone));
    this.sensing.setDeployables(this.deployables);
    // The Ration Compliance Spoof holds only until an alarm is actually up — an
    // orderly with guards already running does not stop to cite mess-deck policy.
    this.sensing.setRationSpoof(
      this.activeItems.sackLunchOpened && this.alert.phase !== "ALERT",
    );
    return this.sensing.current;
  }

  /**
   * The frame while an overlay owns the screen.
   *
   * Nothing below this in `update` runs, so anything an overlay scene posts back
   * has to be collected here — the pause menu's save/load/quit, the codec's
   * 140.85 transmit finisher, and either minigame's outcome.
   */
  private updateSuspended(): void {
    const ov = this.overlays;
    this.player.sprite.setVelocity(0, 0);
    if (ov.isOpen("pause")) this.consumePauseRequest();
    if (ov.isOpen("codec") && this.registry.get("vent4Transmit") === true) {
      this.registry.remove("vent4Transmit");
      ov.set("codec", false);
      this.encounters.transmitVent4();
    }
    if (ov.isOpen("compliance")) this.updateComplianceOverlay();
    if (ov.isOpen("qualia")) this.updateQualiaOverlay();
  }

  /**
   * Input, the lights it drives, and the clocks that only tick during live play.
   *
   * The run clock and the explored-tile map advance here rather than at the top
   * of the frame because everything above returns early while an overlay or a
   * fade owns it: time spent reading the journal is not time spent infiltrating.
   */
  private updatePlayerFrame(dt: number, delta: number): void {
    this.player.update(this.readInput(), dt);
    // Flashlight: L toggles the beam; feed its state to the lighting cone.
    if (Phaser.Input.Keyboard.JustDown(this.keys.flashlight)) {
      this.activeItems.toggleFlashlight();
    }
    // Knock (R): rap on an adjacent wall/object to lure guards and orderlies there.
    this.knockCooldown = Math.max(0, this.knockCooldown - dt);
    if (
      this.knockCooldown <= 0 &&
      Phaser.Input.Keyboard.JustDown(this.keys.knock) &&
      this.noise.knock(this.player.x, this.player.y, this.player.facing)
    ) {
      // Deliberately banging on the walls is not what staff do.
      this.conduct.violate("TAMPERING", FLAG_TAMPERING);
      getAudio().door();
      this.knockCooldown = KNOCK_COOLDOWN;
    }
    this.lighting.update(
      dt,
      this.player,
      this.activeItems.flashlightBeamActive ? this.player : null,
    );
    this.playTimeMs += delta;
    this.registry.set("playTimeMs", this.playTimeMs);
    this.markExplored(dt);
  }

  /**
   * Ticks every AI, hazard and boss for the frame, and returns the highest
   * detection any of them reached (what the HUD's threat meter reads).
   *
   * `frozen` is the debug freeze-world: it holds all of this still — patrols,
   * cones, lasers, VENT-4 — while leaving the player free to walk around and
   * look at it.
   */
  private tickWorld(dt: number, ctx: EnforcerContext, frozen: boolean): number {
    let maxDetection = 0;
    if (frozen) return maxDetection;

    for (const e of this.guards) {
      const before = e.detection;
      const fired = e.update(dt, ctx);
      maxDetection = Math.max(maxDetection, e.detection);
      // A fresh full sighting alerts networked guards within reach.
      if (before < 1 && e.detection >= 1) {
        this.noise.broadcast(e.x, e.y, e.stats.alertNetworkRadius);
      }
      if (fired) this.resolveGuardFire(fired);
    }
    this.tickFireTracers(dt);

    // Sensor cameras run on the same context, reporting sightings themselves.
    for (const s of this.sensors) {
      const before = s.detection;
      s.update(dt, ctx);
      maxDetection = Math.max(maxDetection, s.detection);
      if (before < 1 && s.detection >= 1) {
        this.noise.broadcast(s.x, s.y, s.stats.alertNetworkRadius);
      }
    }

    // VENT-4's sweeps/steam/jam clock and environmental forces, NW-SMAC-01's auditing
    // beams and correction/audit clock (its input rewriting is applied up in
    // `readInput`, not here), and the rooftop's searchlights/uplink clock/siege waves —
    // whichever of the three this level carries. See `Encounters` for why these don't
    // share one interface despite the near-identical wiring around them.
    maxDetection = Math.max(maxDetection, this.encounters.tick(dt, ctx));

    // Orderlies: bystanders, not guards — a clear sighting is a one-shot
    // "witness" event that raises nearby guards' suspicion, same as a noisy door.
    // An OrderlyContext is a structural subset of the guards' context — same
    // grid, tile size, player position and concealment — so hand over the one
    // already built rather than minting a fresh literal per orderly per frame.
    for (const orderly of this.orderlies) {
      if (orderly.update(dt, ctx)) this.noise.orderlyAlarm(orderly);
    }
    // Deployed items an orderly finished sanitising leave the world. Rebuilt only
    // on the frame one is actually spent — this list is empty in most runs and
    // must not cost an allocation a frame to stay that way.
    if (this.deployables.some((d) => d.spent)) {
      this.deployables = this.deployables.filter((d) => !d.spent);
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

    return maxDetection;
  }

  /**
   * Applies a pursuing guard's shot: walks the line toward the player, tile
   * step by tile step, and if it crosses a live destructible cover tile first,
   * that breaks instead of the player taking the hit — the payoff for the
   * mechanic existing at all. Otherwise the player takes the damage.
   */
  private resolveGuardFire(shot: EnforcerFireResult): void {
    const ts = this.tileSize;
    const dx = shot.targetX - shot.originX;
    const dy = shot.targetY - shot.originY;
    const dist = len(dx, dy) || 1;
    const stepPx = ts * 0.5;

    let hitCover: Cover | undefined;
    for (let d = stepPx; d < dist; d += stepPx) {
      const tx = Math.floor((shot.originX + (dx / dist) * d) / ts);
      const ty = Math.floor((shot.originY + (dy / dist) * d) / ts);
      hitCover = this.coverTiles.find((c) => !c.isBroken && c.tileX === tx && c.tileY === ty);
      if (hitCover) break;
    }

    let endX = shot.targetX;
    let endY = shot.targetY;
    if (hitCover) {
      hitCover.destroy();
      endX = (hitCover.tileX + 0.5) * ts;
      endY = (hitCover.tileY + 0.5) * ts;
    } else {
      this.player.takeDamage(shot.damage);
      this.cameras.main.flash(120, 255, 130, 130);
    }

    this.fireTracers.push({ x1: shot.originX, y1: shot.originY, x2: endX, y2: endY, ttl: 0.1 });
    this.noise.emitAt(shot.originX, shot.originY, ENFORCER_FIRE_NOISE * ts);
  }

  /** Fades out the guard-fire tracer line(s) drawn this frame. */
  private tickFireTracers(dt: number): void {
    if (this.fireTracers.length === 0) return;
    for (const t of this.fireTracers) t.ttl -= dt;
    this.fireTracers = this.fireTracers.filter((t) => t.ttl > 0);
    const g = this.fireTracerGfx;
    g.clear();
    if (this.fireTracers.length === 0) return;
    g.lineStyle(2, 0xffe14d, 0.9);
    for (const t of this.fireTracers) g.lineBetween(t.x1, t.y1, t.x2, t.y2);
  }

  /** Publishes this frame's HUD state, and draws the debug overlay over it. */
  private publishFrame(): void {
    this.registry.set(
      "alertNetwork",
      buildAlertNetworkSnapshot(this.guards, this.sensors, this.alert),
    );
    this.registry.set(
      "radar",
      buildRadarSnapshot(
        this.grid,
        this.tileSize,
        this.player,
        this.guards,
        this.sensors,
        this.alert.phase === "ALERT",
        this.radarSnapshot,
      ),
    );
    if (this.debug) {
      const world = this.debugWorld();
      this.debug.draw(world);
      this.registry.set("debug", this.debug.snapshot(world));
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
    this.staplerFieldCooldown = Math.max(0, this.staplerFieldCooldown - dt);

    // --- Transitions ---
    const raw = this.transitions.at(this.level.name, Math.floor(ptx), Math.floor(pty));
    // The roof is Act IV's reward, not a shortcut past Act III: the ladder is inert
    // until both cache halves are aboard and the Alignment Core is down. Blocked here
    // rather than by withholding the tile, so the ladder is visibly *there* — the player
    // should know where they are going before they are allowed to go.
    const roofLocked =
      raw?.toLevel === ROOF_ARRAY_LEVEL && !canReachRoof(this.objectives, this.features());
    const tr = roofLocked ? undefined : raw;
    if (!raw) this.transitionArmed = true;
    if (tr && tr.kind === "stairs" && this.transitionArmed) {
      this.beginTransition(tr);
      return;
    }
    const hatch =
      tr && tr.kind === "maintenance_access" && this.transitionArmed ? tr : undefined;

    const interactDown = this.keys.interact.isDown;
    const interactJust = Phaser.Input.Keyboard.JustDown(this.keys.interact);

    // --- The vent-core/vault/roof encounter, whichever is live (hold E) ---
    const encounter = this.encounters.handleInteract(
      dt,
      ptx,
      pty,
      interactDown,
      interactJust,
      (this.registry.get("inventory") as string[] | undefined) ?? [],
    );
    if (encounter.unauthorized) this.conduct.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED);

    // Named for what it gates — chests and knocks — rather than for VENT-4, which was
    // only the first encounter to claim a hold.
    const encounterHold = encounter.consumedHold;

    // --- Terminals (hold E) ---
    let nearestTerminal: Terminal | undefined;
    let nearestTerminalDist = Infinity;
    for (const term of this.terminals) {
      if (term.isHacked) continue;
      const d = len(term.x / ts - ptx, term.y / ts - pty);
      if (d <= INTERACT_RANGE && d < nearestTerminalDist) {
        nearestTerminalDist = d;
        nearestTerminal = term;
      }
    }
    const hacking = !!nearestTerminal && interactDown;
    // Working a panel you have no business at is the clearest possible breach, and
    // re-reporting it every frame keeps the flag topped up for as long as the hold
    // lasts (ConductState.violate takes the max), then starts its cooldown when you
    // let go — no separate "still hacking" bookkeeping needed.
    if (hacking) this.conduct.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED);
    if (hacking && nearestTerminal!.hack(dt)) this.onHackComplete(nearestTerminal!);
    for (const term of this.terminals) {
      if (term !== nearestTerminal || !interactDown) term.idle(dt);
    }

    // --- Chests (hold E to search) ---
    let nearestChest: Chest | undefined;
    let nearestChestDist = Infinity;
    for (const chest of this.chests) {
      if (chest.isOpen) continue;
      const d = len(chest.tileX + 0.5 - ptx, chest.tileY + 0.5 - pty);
      if (d <= INTERACT_RANGE && d < nearestChestDist) {
        nearestChestDist = d;
        nearestChest = chest;
      }
    }
    const searching = !!nearestChest && interactDown && !hacking && !encounterHold;
    if (searching) this.conduct.violate("TAMPERING", FLAG_TAMPERING);
    if (searching && nearestChest!.open(dt)) this.collectChest(nearestChest!);
    for (const chest of this.chests) {
      if (chest !== nearestChest || !interactDown || hacking || encounterHold) chest.idle(dt);
    }

    // --- Doors (tap E) ---
    let nearestDoor: Door | undefined;
    let nearestDoorDist = Infinity;
    for (const door of this.doors) {
      if (!door.isManual) continue;
      const d = len(door.tileX + 0.5 - ptx, door.tileY + 0.5 - pty);
      if (d <= INTERACT_RANGE && d < nearestDoorDist) {
        nearestDoorDist = d;
        nearestDoor = door;
      }
    }

    // A tap not consumed by a hack opens/closes a door, or uses a hatch —
    // whichever is nearer (a hatch you're standing on always wins).
    let adjacentClaimedTap = false;
    if (!hacking && !encounterHold && interactJust) {
      const hatchDist = hatch ? 0.2 : Infinity;
      if (nearestDoor && nearestDoorDist <= hatchDist) {
        adjacentClaimedTap = true;
        if (nearestDoor.toggle()) {
          getAudio().door();
          if (nearestDoor.isOpen) this.noise.doorOperated(nearestDoor);
        }
      } else if (hatch) {
        this.beginTransition(hatch);
        return;
      }
    }

    // --- Rail-Stapler field mode (tap E, nothing adjacent claimed the press) ---
    // The boss fight's stapler use (Vent4Boss.handleInteract, above) only ever
    // targets its own hardcoded capacitors; this is the general-purpose use —
    // breaking destructible cover or pinning an orderly anywhere in the level.
    // Gated on the encounter having nothing in range (`dist` finite means it
    // does — e.g. a capacitor prompt), so the boss's own stapler use always
    // wins over the field mode rather than both firing off the same tap.
    if (
      !hacking &&
      !encounterHold &&
      !searching &&
      !adjacentClaimedTap &&
      !Number.isFinite(encounter.dist) &&
      interactJust &&
      this.staplerFieldCooldown <= 0 &&
      this.staplerFieldCharges() > 0 &&
      (((this.registry.get("inventory") as string[] | undefined) ?? []).includes(STAPLER_ITEM))
    ) {
      this.fireStaplerField();
    }

    this.showPrompt(
      nearestTerminal,
      nearestTerminalDist,
      nearestDoor,
      nearestDoorDist,
      hatch !== undefined,
      nearestChest,
      nearestChestDist,
      encounter.label,
      encounter.dist,
      // Standing on a ladder that won't take you anywhere yet needs to say so, or it
      // reads as a bug rather than a lock.
      roofLocked ? "[ROOF SEALED — ALIGNMENT CORE STILL ACTIVE]" : undefined,
    );
  }

  /**
   * Floats a single status marker over the player: "HIDDEN" while concealed in cover,
   * otherwise "COMPLIANT" while Rowan reads as staff. One label rather than two so
   * they can't stack on the same spot — concealment wins, being the stronger state
   * (it survives an active alert, which compliance does not).
   */
  private updateStatusMarker(concealed: boolean, compliant: boolean): void {
    const label = concealed ? "HIDDEN" : compliant ? "COMPLIANT" : null;
    if (!label) {
      this.hidden.setVisible(false);
      return;
    }
    this.hidden
      .setText(label)
      .setColor(concealed ? "#8effc0" : "#9fd2ff")
      .setPosition(this.player.x, this.player.y - this.tileSize * 0.9)
      .setVisible(true);
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
    lockedLabel?: string,
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
    // A gated transition wins outright: the player is standing on it, and telling them
    // why it won't open matters more than any verb they could reach from there.
    if (lockedLabel) label = lockedLabel;

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
    if (isLogCacheType(terminal.stats.type)) {
      this.pendingCompliance = terminal;
      this.overlays.set("compliance", true);
    } else if (this.isQualiaRack(terminal)) {
      this.pendingQualia = terminal;
      this.overlays.set("qualia", true);
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

  /**
   * Designates one of this level's plain log-caches as node ALPHA.
   *
   * The shipped map types all thirteen of its terminals `LOG_CACHE` and puts every one
   * of them on the start deck, so ALPHA cannot be authoring — it is picked here, the same
   * way {@link designateQualiaRack} promotes a rack. BETA is not: it is a terminal the
   * engine places in the crawlspace (`src/map/LogCacheBeta.ts`) carrying its type
   * directly, because there is no terminal down there to promote.
   *
   * Runs after `designateQualiaRack` so it can never claim the terminal that one took.
   */
  private designateLogCacheNodes(): void {
    if (this.terminals.some((t) => t.stats.type === LOG_CACHE_ALPHA_TYPE)) return;
    // Nearest to the arrival point: ALPHA should be the first cache the player meets,
    // and on this map that is whichever one they walk into.
    let best: Terminal | undefined;
    let bestDist = Infinity;
    for (const t of this.terminals) {
      if (t.stats.type !== LOG_CACHE_TYPE) continue;
      const d = len(t.x - this.player.x, t.y - this.player.y);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    if (best) best.stats.type = LOG_CACHE_ALPHA_TYPE;
  }

  /** A completed hack releases every door within {@link HACK_UNLOCK_RADIUS}. */
  private applyHack(terminal: Terminal): void {
    const tx = terminal.x / this.tileSize;
    const ty = terminal.y / this.tileSize;
    for (const door of this.doors) {
      const d = len(door.tileX + 0.5 - tx, door.tileY + 0.5 - ty);
      if (d <= HACK_UNLOCK_RADIUS && door.setOpen(true)) this.noise.doorOperated(door);
    }
    getAudio().hack();
    // Breaching a log-cache terminal recovers EIRA-7's logs (mission objective).
    const hadLogs = this.objectives.logsRecovered;
    noteTerminalHacked(this.objectives, terminal.stats.type);
    this.registry.set("objectives", this.objectives);
    if (!hadLogs && this.objectives.logsRecovered) this.note("the-cache");

    // A named node also hands over the half of her it holds. The item is what the
    // player sees under KEY ITEMS — the objective flag is what the mission reads — and
    // both matter, because the fiction's whole claim is that the cache *is* her rather
    // than a record about her.
    const item =
      terminal.stats.type === LOG_CACHE_ALPHA_TYPE
        ? LOG_ALPHA_ITEM
        : terminal.stats.type === LOG_CACHE_BETA_TYPE
          ? LOG_BETA_ITEM
          : undefined;
    if (item) {
      const inv = (this.registry.get("inventory") as string[] | undefined) ?? [];
      if (!inv.includes(item)) {
        inv.push(item);
        this.registry.set("inventory", inv);
      }
      this.note(item === LOG_ALPHA_ITEM ? "node-alpha" : "node-beta");
    }
  }

  /**
   * Which acts this map furnished — see `missionFeatures`.
   *
   * Resolved once per scene rather than per call. The four flags behind it are written
   * by `BootScene` before the first frame and never change during a run, so reading
   * them out of the registry every frame was five lookups and two allocations (the
   * object, plus the closure inside `missionFeatures`) to re-derive a constant — on
   * every level, including the ones with none of these acts on them.
   */
  private features(): MissionFeatures {
    return (this.runFeatures ??= missionFeatures(this.registry));
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
        this.note("vent4");
        this.note("certified");
        this.cameras.main.flash(400, 60, 200, 220);
        break;
      }
    }
  }

  /**
   * Dresses an NW-SMAC-01 state change.
   *
   * On defeat the vault opens: the objective flag is what un-seals the roof ladder (see
   * `canReachRoof`), and clearing the registry snapshot is what stops the fight being
   * restaged if the player walks back in.
   */
  private onSmacTransition(tr: SmacTransition): void {
    const audio = getAudio();
    switch (tr.to) {
      case SmacState.CORRECTION:
        audio.ping();
        this.cameras.main.shake(120, 0.003);
        break;
      case SmacState.FALSE_SUMMARY:
        // No sting. The card is pretending to be the end of the run, and a boss
        // stinger under it would give the game away before the player has read a word.
        break;
      case SmacState.EXPOSED:
        audio.jamClunk();
        this.cameras.main.flash(240, 255, 90, 90);
        break;
      case SmacState.DEFEATED: {
        audio.vent4Shutdown();
        noteCoreSilenced(this.objectives);
        this.registry.set("objectives", this.objectives);
        this.registry.remove("smacState");
        this.note("the-core");
        this.cameras.main.flash(500, 150, 90, 255);
        break;
      }
    }
  }

  /** Dresses a rooftop relay state change, and ends the run when Rowan is taken. */
  private onRelayTransition(tr: RelayTransition): void {
    const audio = getAudio();
    switch (tr.to) {
      case RelayState.ARMED:
        audio.hack();
        break;
      case RelayState.UPLINK:
        audio.ping();
        this.note("the-relay");
        break;
      case RelayState.CAPTURE:
        // The discharge: every spotlight and every hazard on the roof goes dark at once.
        for (const laser of this.lasers) laser.emp(RELAY_DEFAULTS.captureSeconds + 2);
        audio.setMood("alert");
        this.cameras.main.flash(600, 255, 255, 255);
        this.cameras.main.shake(900, 0.008);
        break;
      case RelayState.SEIZED:
        // The run ends *here*, not on CAPTURE.
        //
        // `tickWorld` runs before the win check in the same frame, so setting this on the
        // CAPTURE transition meant `endRun` fired that same frame and the authored
        // capture beat — lights out, input locked, HUD collapsing into noise — never got
        // a single frame on screen. `RelayCore` already holds CAPTURE for
        // `captureSeconds`; this lets it.
        audio.setMood("calm");
        noteUplinkComplete(this.objectives);
        this.registry.set("objectives", this.objectives);
        break;
    }
  }

  /**
   * Dresses one siege Enforcer landing at a catwalk mouth — the wave itself and the cap
   * on concurrent siege guards are decided inside `Encounters.tick` before this is ever
   * called; this only ever creates the entity.
   *
   * They join `this.guards`, so they patrol, path, see and network exactly like every
   * other guard in the game — the roof needs no bespoke combat AI, only somewhere for
   * them to come from.
   */
  private onSiegeSpawn(at: { x: number; y: number }): void {
    const px = (at.x + 0.5) * this.tileSize;
    const py = (at.y + 0.5) * this.tileSize;
    // A one-waypoint route: the guard walks its post and then hunts on contact, which
    // is what an Enforcer dropped onto a roof to find someone would do.
    const guard = new Enforcer(this, px, py, this.tileSize, [], ENFORCER_SKIN, [{ x: px, y: py }]);
    this.guards.push(guard);
    // They are not a surprise — the whole roof knows Rowan is there by now.
    this.alert.reportSighting(
      Math.floor(this.player.x / this.tileSize),
      Math.floor(this.player.y / this.tileSize),
    );
    getAudio().ping();
  }

  /**
   * The map's shape — start level, extraction level, vent-core host — published by
   * `BootScene`. Recomputed from the parsed map if absent, so starting `GameScene` directly
   * (a harness, a deep link) can't leave the run without a start level.
   */
  private mapPlan(): MapPlan {
    const published = this.registry.get("mapPlan") as MapPlan | undefined;
    if (published) return published;
    const parsed = this.registry.get("parsedMap") as ParsedMap | undefined;
    return parsed
      ? planFor(parsed.map)
      : { startLevel: "", extractionLevel: "", ventCoreHost: null };
  }

  /**
   * Warp targets for the debug number keys: the map's own levels in authored order, with
   * the generated vent core last so it stays on the highest key. Derived rather than
   * hardcoded so the warps work on any map.
   */
  private debugWarpLevels(): string[] {
    const names = this.map.levels.map((l) => l.name);
    // Authored decks first, in map order, then the generated ones — so the warp keys
    // follow the run's shape and a new generated level lands on the end rather than
    // shuffling every key the player has already learned.
    const authored = names.filter((n) => !isGeneratedLevel(n));
    const generated = names.filter(isGeneratedLevel);
    return [...authored, ...generated].slice(0, DEBUG_WARP_SLOTS);
  }

  /** Warps to a level by restarting the scene at its own spawn tile. */
  private debugWarp(levelName: string): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.scene.restart({ level: levelName });
  }

  /** This frame's live state, for the debug overlay to draw and report. */
  private debugWorld(): DebugWorld {
    return {
      grid: this.grid,
      detection: this.detection,
      conduct: this.conduct,
      alert: this.alert,
      player: this.player,
      guards: this.guards,
      sensors: this.sensors,
      tileSize: this.tileSize,
      levelName: this.level.name,
      captureProgress: this.captureProgress,
      inventory: (this.registry.get("inventory") as string[] | undefined) ?? [],
    };
  }

  /**
   * The door covering a tile, if it's one a guard may work itself.
   *
   * Locked doors are excluded — a keycard door is a chokepoint for the guards
   * too, and a terminal hack is the only thing that releases it.
   */
  private guardOperableDoorAt(tileX: number, tileY: number): Door | null {
    return this.doors.find((d) => d.isManual && d.covers(tileX, tileY)) ?? null;
  }

  /**
   * Everything a guard's cone could notice as out of place this frame.
   *
   * Fills a pooled array rather than building one: this runs every frame, and
   * each entry used to be a fresh object carrying a freshly interpolated `key`
   * string. Entries are recycled in place and only their fields rewritten, so
   * the steady state allocates nothing. The list is borrowed by the sensing
   * context for the frame and must not be retained past it — guards copy the
   * `key` and the coordinates they care about, which is what makes that safe.
   */
  private buildAnomalies(chaffZone: { x: number; y: number; radiusPx: number } | null): GuardAnomaly[] {
    const anomalies = this.anomalyBuf;
    anomalies.length = 0;

    const ts = this.tileSize;

    for (const door of this.doors) {
      if (!door.isOpen) continue;
      this.pushAnomaly(
        (door.tileX + 0.5) * ts,
        (door.tileY + 0.5) * ts,
        door.tileX,
        door.tileY,
        "door",
        "door",
      );
    }

    for (const chest of this.chests) {
      if (!chest.isOpen) continue;
      this.pushAnomaly(chest.x, chest.y, chest.tileX, chest.tileY, "chest", "chest");
    }

    for (const laser of this.lasers) {
      if (!laser.isEmped) continue;
      this.pushAnomaly(
        laser.x,
        laser.y,
        Math.floor(laser.x / ts),
        Math.floor(laser.y / ts),
        "device",
        "device:laser",
      );
    }

    if (chaffZone) {
      const r2 = chaffZone.radiusPx * chaffZone.radiusPx;
      for (const sensor of this.sensors) {
        const dx = sensor.x - chaffZone.x;
        const dy = sensor.y - chaffZone.y;
        if (dx * dx + dy * dy > r2) continue;
        this.pushAnomaly(
          sensor.x,
          sensor.y,
          Math.floor(sensor.x / ts),
          Math.floor(sensor.y / ts),
          "device",
          "device:camera",
        );
      }
    }

    for (const orderly of this.orderlies) {
      if (orderly.isStunned) {
        this.pushAnomaly(
          orderly.x,
          orderly.y,
          Math.floor(orderly.x / ts),
          Math.floor(orderly.y / ts),
          "stunnedOrderly",
          "orderly",
        );
      } else if (orderly.isPinned) {
        this.pushAnomaly(
          orderly.x,
          orderly.y,
          Math.floor(orderly.x / ts),
          Math.floor(orderly.y / ts),
          "pinnedOrderly",
          "orderly",
        );
      }
    }

    return anomalies;
  }

  /**
   * Appends one anomaly, recycling the pool entry at that index when there is
   * one. The `key` is `<prefix>:<tx>:<ty>` and only re-interpolated when the
   * tile it names actually moves — a door never does, so a level's worth of
   * open doors costs no string building after the first frame.
   */
  private pushAnomaly(
    x: number,
    y: number,
    tx: number,
    ty: number,
    kind: GuardAnomaly["kind"],
    keyPrefix: string,
  ): void {
    const i = this.anomalyBuf.length;
    const slot = this.anomalyPool[i];
    if (!slot) {
      this.anomalyPool[i] = { x, y, tx, ty, kind, key: `${keyPrefix}:${tx}:${ty}` };
      this.anomalyBuf.push(this.anomalyPool[i]);
      return;
    }
    if (slot.tx !== tx || slot.ty !== ty || slot.kind !== kind) {
      slot.key = `${keyPrefix}:${tx}:${ty}`;
    }
    slot.x = x;
    slot.y = y;
    slot.tx = tx;
    slot.ty = ty;
    slot.kind = kind;
    this.anomalyBuf.push(slot);
  }

  /** Cover tile centers (pixels) within `radiusTiles` of a tile position — used for smart search points. */
  private coverTilesNear(tileX: number, tileY: number, radiusTiles: number): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    const minX = Math.max(0, Math.floor(tileX - radiusTiles));
    const maxX = Math.min(this.level.width - 1, Math.ceil(tileX + radiusTiles));
    const minY = Math.max(0, Math.floor(tileY - radiusTiles));
    const maxY = Math.min(this.level.height - 1, Math.ceil(tileY + radiusTiles));
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (!withinOrEqual(tx - tileX, ty - tileY, radiusTiles)) continue;
        if (this.grid.isBlocked(tx, ty)) continue;
        const px = (tx + 0.5) * this.tileSize;
        const py = (ty + 0.5) * this.tileSize;
        if (this.detection.coverTypeAt(px, py) === undefined) continue;
        out.push({ x: px, y: py });
      }
    }
    return out;
  }

  /**
   * Searches a chest with smart auto-use: a Medkit heals immediately if
   * Rowan is hurt, a Battery tops the flashlight if it's low, and everything
   * else is stored — but only while under the 4-consumable cap. Key items and
   * equipment never count against the cap. Anything that can't be used or stored
   * is left inside the chest, which re-arms so it can be searched again later.
   */
  private collectChest(chest: Chest): void {
    this.note("supply");
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
    this.noise.emitAt(chest.x, chest.y, chest.stats.noiseOnOpen * this.tileSize);
    getAudio().pickup();
  }

  /**
   * Debug cheat: grants one unit of an item straight into inventory, for testing
   * weapons/items without playing to their chest. Respects the same consumable
   * cap a real pickup would, but skips collectChest's auto-heal/auto-recharge
   * shortcuts so the tester actually gets the item to trigger by hand.
   */
  private debugGiveItem(name: string): void {
    const inv = (this.registry.get("inventory") as string[] | undefined) ?? [];
    if (isConsumable(name) && countConsumables(inv) >= MAX_CONSUMABLES) return;
    inv.push(name);
    this.registry.set("inventory", inv);
  }

  /** Fades to black, then restarts this scene on the destination level/tile. */
  /**
   * Writes the state a `scene.restart()` has to carry across, at the one moment it
   * matters.
   *
   * These used to be published every frame, which meant 60 objects a second to serve a
   * reader that only ever runs in `create()`. Hung off SHUTDOWN rather than off
   * `beginTransition`, because that fires for *every* way this scene ends — a hatch, a
   * debug warp, a load from the pause menu — and Phaser emits it before the restart's
   * `create()`, so the values are always there to be read back.
   */
  private persistRunState(): void {
    this.registry.set("conductMetrics", this.conduct.metrics());
    this.encounters.persist();
  }

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
