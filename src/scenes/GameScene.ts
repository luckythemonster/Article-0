import Phaser from "phaser";
import type { GameLevel, GameMap, Transition } from "../map/types";
import type { ParsedMap } from "../map/EdplayLoader";
import { SensingContext } from "./game/SensingContext";
import { SpriteAtlas } from "../map/SpriteAtlas";
import { CollisionGrid } from "../systems/CollisionGrid";
import { DetectionSystem } from "../systems/DetectionSystem";
import { AlertState } from "../systems/AlertState";
import { TransitionGraph } from "../systems/TransitionGraph";
import { buildRadarSnapshot, emptyRadarSnapshot } from "../systems/Radar";
import { Player, type InputState } from "../entities/Player";
import { Enforcer, type GuardAnomaly } from "../entities/Enforcer";
import { ENFORCER_SKIN } from "../entities/EnforcerAnimations";
import { Drone } from "../entities/Drone";
import { routeFromLayer } from "../systems/PatrolRoute";
import { Orderly } from "../entities/Orderly";
import { Door, footprintCells } from "../entities/Door";
import { Terminal } from "../entities/Terminal";
import { Laser } from "../entities/Laser";
import { Sensor } from "../entities/Sensor";
import { Chest } from "../entities/Chest";
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
  glassStatsFor,
  isGlass,
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
import { Vent4Boss, type Vent4InteractResult } from "../entities/Vent4Boss";
import { Vent4State, type Vent4Snapshot, type Vent4Transition } from "../systems/Vent4Core";
import { BossCore, type SmacInteractResult } from "../entities/BossCore";
import { SmacState, type SmacSnapshot, type SmacTransition } from "../systems/SmacCore";
import { RoofRelay, type RelayInteractResult } from "../entities/RoofRelay";
import { RelayState, type RelaySnapshot, type RelayTransition } from "../systems/RelayCore";
import { VENT_CORE_LEVEL } from "../map/VentCoreLevel";
import { ROOF_ARRAY_LEVEL } from "../map/RoofArrayLevel";
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
import type { DebugSnapshot } from "../ui/DebugHud";
import { FONT_MONO } from "../ui/fonts";
import { len, within, withinOrEqual } from "../systems/distance";

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

/** Radius (tiles) a spotted orderly's alarm carries to nearby guards. */
const ORDERLY_ALERT_RADIUS_TILES = 6;

/** Backup radius (tiles) when repeated noise pings in one area escalate straight to ALERT. */
const SPAM_ESCALATION_RADIUS_TILES = 8;

/** Radius (tiles) a knock's noise carries — between a door (4) and an orderly alarm (6). */
const KNOCK_NOISE_TILES = 5;

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
  private doors: Door[] = [];
  private terminals: Terminal[] = [];
  private lasers: Laser[] = [];
  private sensors: Sensor[] = [];
  private chests: Chest[] = [];
  /** VENT-4, present only on the vent_core level. */
  private vent4?: Vent4Boss;
  /** NW-SMAC-01, present only on the level carrying the vault boards. */
  private smac?: BossCore;
  /** The rooftop relay, present only on the roof_array level. */
  private relay?: RoofRelay;
  /** Enforcers landed by the rooftop siege, counted against `maxSiegeGuards`. */
  private siegeGuards = 0;
  /** Previous frame's player position, for the conduct system's distance metric. */
  private lastPlayerX = 0;
  private lastPlayerY = 0;
  /** Set when the player spends an item — a deviation inside NW-SMAC-01's held posture. */
  private deviatedThisFrame = false;
  /** The reused per-frame guard/camera sensing context. Rebuilt per level. */
  private sensing!: SensingContext;
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
  /** True while paused: the PauseScene overlay is shown and the sim is frozen. */
  private paused = false;
  /** Seconds the player has been cornered by a silicate during a full alert. */
  private captureProgress = 0;
  /** Cooldown (seconds) remaining before the player can knock again. */
  private knockCooldown = 0;
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
  /** Darkness off — the lighting/line-of-sight overlay is hidden so the level reads. */
  private darknessOff = false;
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
    darkness: Phaser.Input.Keyboard.Key;
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

    // Reset per-run state: class-field initializers don't re-run on restart.
    this.guards = [];
    this.orderlies = [];
    this.doors = [];
    this.terminals = [];
    this.lasers = [];
    this.sensors = [];
    this.chests = [];
    this.vent4 = undefined;
    this.smac = undefined;
    this.relay = undefined;
    this.siegeGuards = 0;
    this.alert = new AlertState();
    this.noiseSpam = new NoiseSpamTracker();
    this.transitioning = false;
    this.paused = false;
    this.exploredCooldown = 0;
    this.captureProgress = 0;
    this.knockCooldown = 0;
    this.codecOpen = false;
    this.complianceOpen = false;
    this.pendingCompliance = undefined;
    this.qualiaOpen = false;
    this.pendingQualia = undefined;
    this.qualiaRack = undefined;
    // Flags above just reset; republish so a restart out of an overlay (a load
    // from the pause menu) can't leave UIScene's input gate stuck closed.
    this.syncSuspended();
    this.sharedField = new SharedField();
    // Conduct metrics are per *run*, not per level, and a level change is a
    // scene.restart() — so they ride the registry rather than resetting here.
    this.conduct = new ConductState(
      this.registry.get("conductMetrics") as ConductMetrics | undefined,
    );
    this.activeItems = new ActiveItemState();
    // Arm only after stepping off the arrival tile (see update()).
    this.transitionArmed = false;
    // Debug flags don't survive a restart; the master toggle stays on so a
    // debug-mode warp keeps the panel up, but the cheats reset to a clean state.
    this.godMode = false;
    this.noClip = false;
    this.worldDraw = false;
    this.frozenWorld = false;
    // A fresh Lighting is built below, so this must start in step with it (on).
    this.darknessOff = false;

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
    this.registerGlazing();
    this.detection = new DetectionSystem(this.level, this.tileSize);
    this.sensing = new SensingContext({
      grid: this.grid,
      tileSize: this.tileSize,
      detection: this.detection,
      alert: this.alert,
      flashlightOn: () => this.activeItems.flashlightBeamActive,
      thermalMasked: () => this.activeItems.thermalMasked,
      flashlightMultiplier: FLASHLIGHT_DETECTION_MULTIPLIER,
      coverTilesNear: (tx, ty, r) => this.coverTilesNear(tx, ty, r),
      isGuardDoor: (tx, ty) => this.guardOperableDoorAt(tx, ty) !== null,
      // Silent on purpose: the operation-noise ping is there to give away the
      // player working a door, not staff using one on their own beat.
      setDoorOpen: (tx, ty, open) => void this.guardOperableDoorAt(tx, ty)?.setOpen(open),
    });

    const wallBodies = this.renderLevel();
    this.spawnEntities();
    const doorBodies = this.spawnInteractables();
    this.designateQualiaRack();
    this.designateLogCacheNodes();

    this.wallCollider = this.physics.add.collider(this.player.sprite, wallBodies);
    this.doorCollider = this.physics.add.collider(this.player.sprite, doorBodies);

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

    // NW-SMAC-01 is keyed off the vault boards rather than a level name, so the act
    // travels with the generated fixtures instead of with `main2` specifically. It stays
    // down once beaten — re-entering the vault should not restage a fight you have won.
    if (this.level.layers.some((l) => l.name === "vault_core") && !this.objectives.coreSilenced) {
      this.smac = new BossCore(
        this,
        this.level,
        this.tileSize,
        this.grid,
        this.registry.get("smacState") as SmacSnapshot | undefined,
        SMAC_DEFAULTS,
      );
    }
    this.registry.set("smac", this.smac ? this.smac.hudView() : null);

    if (this.level.name === ROOF_ARRAY_LEVEL) {
      this.relay = new RoofRelay(
        this,
        this.level,
        this.tileSize,
        this.grid,
        this.registry.get("relayState") as RelaySnapshot | undefined,
        RELAY_DEFAULTS,
      );
    }
    this.registry.set("relay", this.relay ? this.relay.hudView() : null);

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

    // Journal, explored map and run clock ride the registry across the
    // scene.restart() a level transition performs, exactly as objectives do.
    this.journal = (this.registry.get("journal") as JournalState | undefined) ?? initialJournal();
    this.registry.set("journal", this.journal);
    this.playTimeMs = (this.registry.get("playTimeMs") as number | undefined) ?? 0;
    this.explored = this.loadExplored();
    this.note("orders");
    const arrival = journalIdForLevel(this.level.name);
    if (arrival) this.note(arrival);

    if (!this.scene.isActive("UIScene")) this.scene.launch("UIScene");

    // A level transition is a scene.restart(), which builds a fresh Lighting.
    // The old one owns off-display-list stamps Phaser will not reclaim on its
    // own, so hand them back before this run of the scene goes away.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.lighting.destroy());

    this.saveCheckpoint();
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

  /**
   * Registers glazing with the collision grid: clear glass stops movement but not sight,
   * so a pane reads as a window rather than a wall.
   *
   * Glass *doors* look after themselves — {@link Door} reads its own `glass` component and
   * keeps its cells transparent through open and close. This pass exists for glass placed
   * directly on a **blocking** board, which never becomes a `Door`: the shipped map puts
   * two panes on `main2`'s `walls` board, and before this they blocked sight like
   * concrete. Runs before the doors spawn, so it only touches already-blocked cells and
   * leaves the door footprints to `Door.applyState`.
   */
  private registerGlazing(): void {
    for (const layer of this.level.layers) {
      for (const tile of layer.tiles) {
        if (!isGlass(tile.components) || glassStatsFor(tile.components).visionBlock) continue;
        for (const cell of footprintCells(tile, this.tileSize)) {
          if (this.grid.isBlocked(cell.x, cell.y)) {
            this.grid.setBlocked(cell.x, cell.y, true, true);
          }
        }
      }
    }
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

    // A guard board is one guard's *route*, not a headcount — see
    // `routeFromLayer`. Each board therefore spawns a single guard standing on
    // waypoint 0 and walking the rest as a loop.
    const enforcerLayer = this.level.layers.find((l) => l.name === "enforcers");
    const enforcerRoute = routeFromLayer(enforcerLayer);
    if (enforcerLayer && enforcerRoute.length > 0) {
      const start = enforcerRoute[0];
      this.guards.push(
        new Enforcer(
          this,
          start.x,
          start.y,
          this.tileSize,
          enforcerLayer.tiles[0].components,
          ENFORCER_SKIN,
          enforcerRoute,
        ),
      );
    }

    const droneLayer = this.level.layers.find((l) => l.name === "drones");
    const droneRoute = routeFromLayer(droneLayer);
    if (droneLayer && droneRoute.length > 0) {
      const start = droneRoute[0];
      this.guards.push(
        new Drone(this, start.x, start.y, this.tileSize, droneLayer.tiles[0].components, droneRoute),
      );
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
      // Q used to abort the run straight from the pause screen. The pause menu
      // owns quitting now, behind a confirmation — a stray keystroke while
      // reading the journal must not throw the infiltration away.
      pause: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      codec: kb.addKey(Phaser.Input.Keyboard.KeyCodes.C),
      field: kb.addKey(Phaser.Input.Keyboard.KeyCodes.F),
      flashlight: kb.addKey(Phaser.Input.Keyboard.KeyCodes.L),
      knock: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
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
        darkness: kb.addKey(K.O),
        // One key per DEBUG_WARP_SLOTS. The list used to stop at FIVE, which quietly
        // made the sixth level unreachable by warp the moment one was added.
        warp: [K.ONE, K.TWO, K.THREE, K.FOUR, K.FIVE, K.SIX]
          .slice(0, DEBUG_WARP_SLOTS)
          .map((c) => kb.addKey(c)),
      };
    }
  }

  /**
   * Publishes whether an overlay currently owns the screen.
   *
   * `UIScene` runs in parallel and keeps updating behind every overlay, so it
   * needs to know when *not* to read gameplay input — see the hotkey gate there.
   * Computed from all four flags in one place rather than set by each toggle, so
   * closing one overlay while another is open can't clear it.
   */
  private syncSuspended(): void {
    const suspended = this.paused || this.codecOpen || this.complianceOpen || this.qualiaOpen;
    this.registry.set(SUSPENDED_KEY, suspended);
  }

  /** Toggles the pause menu and freezes/thaws the arcade sim. */
  private setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    this.syncSuspended();
    if (p) {
      this.physics.pause();
      setMode(this.registry, "PAUSED");
      // The menu's MAP tab needs the collision grid, which only this scene has.
      // Published on the way in rather than per frame: it's a whole-level walk,
      // and nothing behind a frozen sim can change it.
      this.publishMapSnapshot();
      this.registry.remove(PAUSE_REQUEST_KEY);
      this.scene.launch("PauseScene");
    } else {
      this.scene.stop("PauseScene");
      this.registry.remove(PAUSE_REQUEST_KEY);
      setMode(this.registry, "PLAYING");
      this.physics.resume();
    }
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
        this.setPaused(false);
        return;
      case "save":
        this.writeSave(request.slot);
        // Echo the written slot back so the menu can re-render its listing.
        this.registry.set(SAVE_WRITTEN_KEY, { slot: request.slot, at: Date.now() });
        return;
      case "load": {
        const save = loadGame(request.slot);
        if (!save) return; // Empty slot: the menu stays open, nothing happens.
        this.setPaused(false);
        resumeFromSave(this, save);
        return;
      }
      case "quit":
        this.abortToTitle();
        return;
    }
  }

  /** Toggles the in-game codec overlay, freezing/thawing the sim behind it. */
  private setCodecOpen(open: boolean): void {
    if (open === this.codecOpen) return;
    this.codecOpen = open;
    this.syncSuspended();
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
    this.syncSuspended();
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
    this.syncSuspended();
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
      (this.smac?.racks.some((r) => sees(r.x, r.y, SMAC_DEFAULTS.rackWitnessRadius)) ?? false) ||
      (this.relay !== undefined &&
        sees(this.relay.dish.x, this.relay.dish.y, RELAY_DEFAULTS.dishWitnessRadius));
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
      if (idx !== -1) {
        inv.splice(idx, 1);
        this.registry.set("inventory", inv);
        this.applyConsumable(request);
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
   * reach and roughly ahead is frozen (can't witness). Firing makes a small noise.
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
    this.conduct.violate("HOSTILE", FLAG_HOSTILE);
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
    if (this.relay?.isCaptured) {
      return { up: false, down: false, left: false, right: false, sneak: false, run: false };
    }

    const correction = this.smac?.correction;
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
    if (this.smac?.summaryUp) {
      if (
        Phaser.Input.Keyboard.JustDown(this.keys.pause) ||
        Phaser.Input.Keyboard.JustDown(this.keys.codec)
      ) {
        const tr = this.smac.dismissSummary();
        this.cameras.main.shake(180, 0.006);
        getAudio().jamClunk();
        if (tr) this.onSmacTransition(tr);
      }
      return this.updateWorld(dt, delta);
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
      // Save / load / quit chosen in the pause menu. Consumed here for the same
      // reason as the codec flag below: the sim update never runs behind an overlay.
      if (this.paused) this.consumePauseRequest();
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
    if (DEBUG_ALLOWED && this.handleDebugInput()) return;

    this.player.update(this.readInput(), dt);
    // Flashlight: L toggles the beam; feed its state to the lighting cone.
    if (Phaser.Input.Keyboard.JustDown(this.keys.flashlight)) {
      this.activeItems.toggleFlashlight();
    }
    // Knock (R): rap on an adjacent wall/object to lure guards and orderlies there.
    this.knockCooldown = Math.max(0, this.knockCooldown - dt);
    if (this.knockCooldown <= 0 && Phaser.Input.Keyboard.JustDown(this.keys.knock)) {
      this.knock();
    }
    this.lighting.update(
      dt,
      { x: this.player.x, y: this.player.y },
      this.activeItems.flashlightBeamActive
        ? { x: this.player.x, y: this.player.y, facing: this.player.facing }
        : null,
    );
    // The run clock and the map only advance during live play — everything above
    // this point returns early while an overlay or a fade owns the frame, so time
    // spent reading the journal is not time spent infiltrating.
    this.playTimeMs += delta;
    this.registry.set("playTimeMs", this.playTimeMs);
    this.markExplored(dt);

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
      forced: this.smac?.forcesCompliance ?? false,
    });
    const compliant = this.conduct.compliant;
    this.registry.set("conductMetrics", this.conduct.metrics());
    this.registry.set("conduct", {
      compliant,
      breach: this.conduct.breach,
      flaggedRemaining: this.conduct.flaggedRemaining,
      certified,
      sabotageActions: this.conduct.sabotageActions,
      complianceDistanceWalked: this.conduct.complianceDistanceWalked,
      highCompliance: this.conduct.isHighCompliance(),
      forced: this.smac?.forcesCompliance ?? false,
    } satisfies ConductView);

    // The corrected posture is not a gift: while NW-SMAC-01 holds it, deviating from it
    // — sprinting, or spending an item — is charged straight to bio-integrity. The mesh
    // is not watching Rowan so much as driving him.
    // Unscaled and called every frame: `Player.takeDamage` carries its own hit cooldown
    // and ignores repeats inside it, which is exactly the once-a-second tick wanted here
    // — the same way VENT-4 charges its overheat.
    if (this.smac?.forcesCompliance && (this.player.running || this.deviatedThisFrame)) {
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
    let maxDetection = 0;
    // The sensing context is built once per level and refreshed in place — see
    // SensingContext for why this isn't an object literal.
    const playerBody = this.player.sprite.body as Phaser.Physics.Arcade.Body;
    const chaffOrigin = this.activeItems.chaffOrigin;
    this.sensing.setChaff(
      this.activeItems.chaffActive && !!chaffOrigin,
      chaffOrigin?.x ?? 0,
      chaffOrigin?.y ?? 0,
      CHAFF_PACK_RADIUS_TILES * this.tileSize,
    );
    this.sensing.setPlayer(
      this.player.x,
      this.player.y,
      this.player.noise,
      playerBody.velocity.x,
      playerBody.velocity.y,
    );
    this.sensing.setConcealment(concealed, compliant, thermalConcealed);
    // Opened doors/chests, EMP'd devices and stunned orderlies, for anomaly scanning.
    this.sensing.setAnomalies(this.buildAnomalies(this.sensing.chaffZone));
    const ctx = this.sensing.current;
    // Debug freeze-world (H) short-circuits every AI/hazard update below by
    // iterating nothing (or ticking with 0), so patrols, cones, lasers, VENT-4,
    // alert decay and capture all hold still while the player can still move.
    if (!this.frozenWorld) for (const e of this.guards) {
      const before = e.detection;
      e.update(dt, ctx);
      maxDetection = Math.max(maxDetection, e.detection);
      // A fresh full sighting alerts networked guards within reach.
      if (before < 1 && e.detection >= 1) {
        this.emitNetworkAlert(e.x, e.y, e.stats.alertNetworkRadius);
      }
    }

    // Sensor cameras run on the same context, reporting sightings themselves.
    if (!this.frozenWorld) for (const s of this.sensors) {
      const before = s.detection;
      s.update(dt, ctx);
      maxDetection = Math.max(maxDetection, s.detection);
      if (before < 1 && s.detection >= 1) {
        this.emitNetworkAlert(s.x, s.y, s.stats.alertNetworkRadius);
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

    // NW-SMAC-01: auditing beams and the correction/audit clock. Its input rewriting is
    // applied up in `readInput`, not here.
    if (this.smac && !this.frozenWorld) {
      const tick = this.smac.update(dt, ctx);
      maxDetection = Math.max(maxDetection, this.smac.detection);
      if (tick.transition) this.onSmacTransition(tick.transition);
      if (tick.auditHit && this.player.takeDamage(SMAC_DEFAULTS.auditDamage)) {
        this.cameras.main.flash(180, 200, 60, 180);
      }
      this.registry.set("smac", this.smac.hudView());
      this.registry.set("smacState", this.smac.snapshot());
    }

    // The rooftop relay: searchlights, the uplink clock, and the siege's waves.
    if (this.relay && !this.frozenWorld) {
      const tick = this.relay.update(dt, ctx);
      maxDetection = Math.max(maxDetection, this.relay.detection);
      if (tick.transition) this.onRelayTransition(tick.transition);
      if (tick.searchlightHit && this.player.takeDamage(RELAY_DEFAULTS.searchlightDamage)) {
        this.cameras.main.flash(160, 255, 240, 180);
      }
      if (tick.spawnAt) for (const at of tick.spawnAt) this.landSiegeEnforcer(at);
      this.registry.set("relay", this.relay.hudView());
      this.registry.set("relayState", this.relay.snapshot());
    }

    // Orderlies: bystanders, not guards — a clear sighting is a one-shot
    // "witness" event that raises nearby guards' suspicion, same as a noisy door.
    // An OrderlyContext is a structural subset of the guards' context — same
    // grid, tile size, player position and concealment — so hand over the one
    // already built rather than minting a fresh literal per orderly per frame.
    if (!this.frozenWorld) for (const orderly of this.orderlies) {
      if (orderly.update(dt, ctx)) this.emitOrderlyAlert(orderly);
    }

    // Lasers: crossing an active beam/scan zone instantly trips the alarm.
    let laserTripped = false;
    if (!this.frozenWorld) for (const laser of this.lasers) {
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
    const cornered =
      !this.frozenWorld &&
      !fieldActive &&
      !this.relay?.isCaptured &&
      this.alert.isCombatAware &&
      this.guards.some((e) => this.isCornering(e));
    this.captureProgress = cornered
      ? this.captureProgress + dt
      : Math.max(0, this.captureProgress - dt * 2);
    // God mode (debug): neutralize both death paths after they've been computed
    // for the frame — restore bio-integrity and clear any capture progress.
    if (this.godMode) {
      this.player.hp = this.player.maxHp;
      this.captureProgress = 0;
    }
    if (
      !this.relay?.isCaptured &&
      (!this.player.alive || this.captureProgress >= PLAYER_DEFAULTS.captureTime)
    ) {
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

    // --- NW-SMAC-01's correction nodes (hold E) ---
    let smacI: SmacInteractResult | undefined;
    if (this.smac) {
      smacI = this.smac.handleInteract(dt, ptx, pty, interactDown);
      if (smacI.consumedHold) this.conduct.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED);
      if (smacI.transition) this.onSmacTransition(smacI.transition);
    }

    // --- The roof's pedestals and primary feed (hold E) ---
    let relayI: RelayInteractResult | undefined;
    if (this.relay && !this.relay.isCaptured) {
      relayI = this.relay.handleInteract(dt, ptx, pty, interactDown);
      if (relayI.transition) this.onRelayTransition(relayI.transition);
    }

    const ventHold =
      (vent?.consumedHold ?? false) ||
      (smacI?.consumedHold ?? false) ||
      (relayI?.consumedHold ?? false);

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
    const searching = !!nearestChest && interactDown && !hacking && !ventHold;
    if (searching) this.conduct.violate("TAMPERING", FLAG_TAMPERING);
    if (searching && nearestChest!.open(dt)) this.collectChest(nearestChest!);
    for (const chest of this.chests) {
      if (chest !== nearestChest || !interactDown || hacking || ventHold) chest.idle(dt);
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

    // Only ever one encounter on a level, so the three share the prompt's boss slot.
    const encounter = [vent, smacI, relayI].reduce<
      { label?: string; dist: number } | undefined
    >((best, r) => (r?.label && (!best || r.dist < best.dist) ? r : best), undefined);

    this.showPrompt(
      nearestTerminal,
      nearestTerminalDist,
      nearestDoor,
      nearestDoorDist,
      hatch !== undefined,
      nearestChest,
      nearestChestDist,
      encounter?.label,
      encounter?.dist ?? Infinity,
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
      if (d <= HACK_UNLOCK_RADIUS && door.setOpen(true)) this.emitDoorNoise(door);
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

  /** Which acts this map furnished — see `missionFeatures`. */
  private features(): MissionFeatures {
    return missionFeatures(this.registry);
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
        noteUplinkComplete(this.objectives);
        this.registry.set("objectives", this.objectives);
        break;
      case RelayState.SEIZED:
        // `update` sees `uplinkComplete` and ends the run; nothing to do but stop the
        // room making noise about it.
        audio.setMood("calm");
        break;
    }
  }

  /**
   * Lands one siege Enforcer at a catwalk mouth.
   *
   * They join `this.guards`, so they patrol, path, see and network exactly like every
   * other guard in the game — the roof needs no bespoke combat AI, only somewhere for
   * them to come from. The cap is what keeps a slow uplink from burying the deck.
   */
  private landSiegeEnforcer(at: { x: number; y: number }): void {
    if (this.siegeGuards >= RELAY_DEFAULTS.maxSiegeGuards) return;
    this.siegeGuards++;
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
    if (Phaser.Input.Keyboard.JustDown(dk.darkness)) this.setDarknessOff(!this.darknessOff);
    const warps = this.debugWarpLevels();
    for (let i = 0; i < dk.warp.length && i < warps.length; i++) {
      if (Phaser.Input.Keyboard.JustDown(dk.warp[i])) {
        this.debugWarp(warps[i]);
        return true;
      }
    }
    return false;
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

  /** Master switch. Disabling clears every cheat for a clean return to play. */
  private setDebugEnabled(on: boolean): void {
    this.debugEnabled = on;
    if (!on) {
      this.godMode = false;
      this.worldDraw = false;
      this.frozenWorld = false;
      this.setNoClip(false);
      this.setDarknessOff(false);
      this.debugGfx?.clear();
    }
  }

  /** Hides/restores the darkness + line-of-sight overlay so the level can be read. */
  private setDarknessOff(off: boolean): void {
    this.darknessOff = off;
    this.lighting.setEnabled(!off);
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
    for (const e of this.guards) {
      const clear = this.grid.hasLineOfSight(ptx, pty, e.x / ts, e.y / ts);
      g.lineStyle(1, clear ? 0x59d98e : 0xff3b3b, 0.6);
      g.lineBetween(this.player.x, this.player.y, e.x, e.y);
    }

    this.drawGuardNavigation(g, ts);
  }

  /**
   * Patrol routes, live A* paths and collision circles for every guard.
   *
   * This is the readout for the three things that are otherwise invisible and
   * hard to trust: that a guard board really did resolve to one ordered loop,
   * that the planner routes around geometry rather than through it, and that
   * the body a guard collides with matches the sprite drawn over it.
   */
  private drawGuardNavigation(g: Phaser.GameObjects.Graphics, ts: number): void {
    const centre = (p: { x: number; y: number }): { x: number; y: number } => ({
      x: (p.x + 0.5) * ts,
      y: (p.y + 0.5) * ts,
    });

    for (const e of this.guards) {
      const route = e.patrolRoute;
      // The route loop, dimmed — it's context, not the live state.
      if (route.length > 1) {
        g.lineStyle(1, 0x4db8ff, 0.35);
        for (let i = 0; i < route.length; i++) {
          const a = centre(route[i]);
          const b = centre(route[(i + 1) % route.length]);
          g.lineBetween(a.x, a.y, b.x, b.y);
        }
      }
      g.fillStyle(0x4db8ff, 0.75);
      for (const wp of route) {
        const c = centre(wp);
        g.fillCircle(c.x, c.y, Math.max(2, ts * 0.12));
      }

      // The path being walked right now, from the guard to its current goal.
      const path = e.plannedPath;
      if (path.length > 0) {
        g.lineStyle(2, 0xffe14d, 0.8);
        let prevX = e.x;
        let prevY = e.y;
        for (const node of path) {
          const c = centre(node);
          g.lineBetween(prevX, prevY, c.x, c.y);
          prevX = c.x;
          prevY = c.y;
        }
      }

      // The circle the guard actually collides with.
      g.lineStyle(1, 0x59d98e, 0.7);
      g.strokeCircle(e.x, e.y, e.collisionRadiusTiles * ts);
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
      darknessOff: this.darknessOff,
      compliant: this.conduct.compliant,
      breach: this.conduct.breach,
      flaggedRemaining: this.conduct.flaggedRemaining,
      certified: ((this.registry.get("inventory") as string[] | undefined) ?? []).includes(
        CERT_ITEM,
      ),
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
        ...this.guards.map((e, i) => ({ label: `G${i}`, detection: e.detection })),
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
    this.emitNoiseAt(orderly.x, orderly.y, ORDERLY_ALERT_RADIUS_TILES * this.tileSize);
  }

  /**
   * Knock (R): rap on an adjacent wall or object. The noise originates at that
   * tile — not at the player — so guards and orderlies in earshot converge on
   * the spot while Rowan slips past. A no-op (no cooldown spent) when there's
   * nothing knockable next to the player.
   */
  private knock(): void {
    const target = this.findKnockTarget();
    if (!target) return;
    const cx = (target.tx + 0.5) * this.tileSize;
    const cy = (target.ty + 0.5) * this.tileSize;
    const radiusPx = KNOCK_NOISE_TILES * this.tileSize;
    this.emitNoiseAt(cx, cy, radiusPx); // guards (reuses the shared noise pipeline)
    this.emitKnockDistraction(cx, cy, radiusPx); // orderlies walk over to look
    // Deliberately banging on the walls is not what staff do.
    this.conduct.violate("TAMPERING", FLAG_TAMPERING);
    getAudio().door();
    this.knockCooldown = KNOCK_COOLDOWN;
  }

  /**
   * The wall/object a knock lands on: the tile one step along the player's
   * facing if it's knockable, else the nearest knockable of the 8 neighbours,
   * biased toward the facing direction.
   */
  private findKnockTarget(): { tx: number; ty: number } | null {
    const ts = this.tileSize;
    const px = this.player.x;
    const py = this.player.y;
    const fx = Math.cos(this.player.facing);
    const fy = Math.sin(this.player.facing);

    const aheadX = Math.floor((px + fx * ts) / ts);
    const aheadY = Math.floor((py + fy * ts) / ts);
    if (this.isKnockable(aheadX, aheadY)) return { tx: aheadX, ty: aheadY };

    const ptx = Math.floor(px / ts);
    const pty = Math.floor(py / ts);
    let best: { tx: number; ty: number } | null = null;
    let bestScore = -Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = ptx + dx;
        const ty = pty + dy;
        if (!this.isKnockable(tx, ty)) continue;
        // Prefer neighbours that lie in the direction the player is facing.
        const mag = len(dx, dy);
        const score = (dx * fx + dy * fy) / mag;
        if (score > bestScore) {
          bestScore = score;
          best = { tx, ty };
        }
      }
    }
    return best;
  }

  /** True when a tile holds something to knock on: a wall/closed door, or a door/chest/terminal. */
  private isKnockable(tx: number, ty: number): boolean {
    if (!this.grid.inBounds(tx, ty)) return false;
    if (this.grid.isBlocked(tx, ty)) return true;
    if (this.doors.some((d) => d.tileX === tx && d.tileY === ty)) return true;
    if (this.chests.some((c) => c.tileX === tx && c.tileY === ty)) return true;
    return this.terminals.some(
      (t) => Math.floor(t.x / this.tileSize) === tx && Math.floor(t.y / this.tileSize) === ty,
    );
  }

  /** A knock draws nearby orderlies over to investigate (guards use {@link emitNoiseAt}). */
  private emitKnockDistraction(cx: number, cy: number, radiusPx: number): void {
    if (radiusPx <= 0) return;
    for (const orderly of this.orderlies) {
      const p = orderly;
      if (within(p.x - cx, p.y - cy, radiusPx)) orderly.distract(cx, cy);
    }
  }

  /**
   * Minor investigations (a single noise ping) never broadcast over the alert
   * network — only the individual guard(s) in earshot react. But repeated
   * pings in the same area within a short window are a distraction exploit:
   * once {@link NoiseSpamTracker} flags spam, skip per-guard investigation
   * entirely and radio it in as a confirmed sighting instead.
   */
  private emitNoiseAt(cx: number, cy: number, radiusPx: number): void {
    if (radiusPx <= 0) return;
    const tx = Math.floor(cx / this.tileSize);
    const ty = Math.floor(cy / this.tileSize);
    if (this.noiseSpam.record(tx, ty, this.time.now / 1000)) {
      this.alert.reportSighting(tx, ty);
      this.emitNetworkAlert(cx, cy, SPAM_ESCALATION_RADIUS_TILES);
      return;
    }
    for (const e of this.guards) {
      const d = len(e.x - cx, e.y - cy);
      if (d < radiusPx) e.hearNoise(1 - d / radiusPx, cx, cy);
    }
  }

  /** Opened doors/chests, EMP'd cameras/lasers, and stunned orderlies this frame. */
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
      if (!orderly.isStunned) continue;
      this.pushAnomaly(
        orderly.x,
        orderly.y,
        Math.floor(orderly.x / ts),
        Math.floor(orderly.y / ts),
        "stunnedOrderly",
        "orderly",
      );
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
   * A confirmed sighting propagates through the alert network: every guard
   * within the spotter's {@link EnforcerStats.alertNetworkRadius} snaps to look
   * toward the player and grows wary, so a camera or a distant guard tripping
   * the alarm immediately rallies the ones nearby.
   */
  private emitNetworkAlert(originX: number, originY: number, radiusTiles: number): void {
    const radiusPx = radiusTiles * this.tileSize;
    if (radiusPx <= 0) return;
    const r2 = radiusPx * radiusPx;
    for (const e of this.guards) {
      if (e.x === originX && e.y === originY) continue; // skip the spotter itself
      const dx = e.x - originX;
      const dy = e.y - originY;
      if (dx * dx + dy * dy < r2) {
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
