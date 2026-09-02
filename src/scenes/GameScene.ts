import Phaser from "phaser";
import type { GameLevel, GameMap, Transition } from "../map/types";
import type { ParsedMap } from "../map/EdplayLoader";
import { SensingContext } from "./game/SensingContext";
import { DebugOverlay, WARP_SLOTS, type DebugWorld } from "./game/DebugOverlay";
import { buildLevel } from "./game/LevelBuilder";
import { NoiseEvents } from "./game/NoiseEvents";
import { OverlayGate } from "./game/OverlayGate";
import { InteractPrompt } from "./game/InteractPrompt";
import { SetPieceEvents } from "./game/SetPieceEvents";
import { VaultAndPress } from "./game/VaultAndPress";
import { Anomalies } from "./game/Anomalies";
import { coverTilesNear } from "../systems/CoverPoints";
import { PowerControl } from "./game/PowerControl";
import { ExploredTracker } from "./game/ExploredTracker";
import { initialExplored, type ExploredState } from "../systems/Explored";
import { TerminalHacks } from "./game/TerminalHacks";
import { PlaneTraversal } from "./game/PlaneTraversal";
import { ItemActions } from "./game/ItemActions";
import { SpriteAtlas } from "../map/SpriteAtlas";
import { CollisionGrid } from "../systems/CollisionGrid";
import { DetectionSystem } from "../systems/DetectionSystem";
import { AlertState } from "../systems/AlertState";
import { FirearmsAuthorization } from "../systems/Firearms";
import { TransitionGraph, type ShaftStop } from "../systems/TransitionGraph";
import {
  ELEVATOR_CHOICE_KEY,
  ELEVATOR_CLOSED_KEY,
  type ElevatorFloor,
} from "./ElevatorScene";
import { buildRadarSnapshot, emptyRadarSnapshot } from "../systems/Radar";
import { Player, type InputState } from "../entities/Player";
import {
  Enforcer,
  type EnforcerContext,
  type EnforcerAttackResult,
} from "../entities/Enforcer";
import { Orderly } from "../entities/Orderly";
import { DeployedItem } from "../entities/DeployedItem";
import { Door } from "../entities/Door";
import { Terminal } from "../entities/Terminal";
import { Breaker } from "../entities/Breaker";
import { LightSwitch } from "../entities/LightSwitch";
import { initialPowerGrid, type PowerGridState } from "../systems/PowerGrid";
import { Laser } from "../entities/Laser";
import { Sensor } from "../entities/Sensor";
import { Chest } from "../entities/Chest";
import { Locker, type StashedBody } from "../entities/Locker";
import { Cover } from "../entities/Cover";
import { buildAlertNetworkSnapshot, NoiseSpamTracker } from "../systems/AlertNetwork";
import { NoiseLog } from "../systems/NoiseLog";
import { Lighting } from "../ui/Lighting";
import { MemoryLayer } from "../ui/MemoryLayer";
import { PlaneOverlay } from "../ui/PlaneOverlay";
import { EntityShadows, type ShadowCaster } from "../ui/EntityShadows";
import {
  ACT_CARD_KEY,
  ACT_SHOWN_KEY,
  readInventory,
  resumeFromSave,
  setMode,
  SUSPENDED_KEY,
  type GameMode,
} from "../systems/GameState";
import { initialMemos, nextMemoFor, noteMemo, type MemoState } from "../systems/Memos";
import {
  initialJournal,
  journalIdForLevel,
  noteJournal,
  type JournalEntryId,
  type JournalState,
} from "../systems/Journal";
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
  countConsumables,
  isKeycard,
  SMAC_DEFAULTS,
  FLASHLIGHT_DETECTION_MULTIPLIER,
  GAME_SPEED,
  isConsumable,
  ENFORCER_FIRE_NOISE_TILES,
  GUARD_MELEE_NOISE_TILES,
  ESCORT_STANDOFF_TILES,
  HOLD_UP_GRACE_SECONDS,
  MAX_CONSUMABLES,
  OPENED_RATION_DETECTION_MULTIPLIER,
  OPENED_RATION_NOISE,
  PLAYER_DEFAULTS,
  RATION_HEAL,
  RATION_PACK_ITEM,
  STAPLER_FIELD_MAX_CHARGES,
  PLAYER_MELEE_COOLDOWN,
  STAPLER_ITEM,
  STARTING_INVENTORY,
  BODY_PICKUP_TILES,
  STUN_ROUND_DURATION,
  WALL_PRESS_DETECTION_MULTIPLIER,
} from "../systems/EntityStats";
import { CAMERA_ZOOM } from "../render/pixelScale";
import {
  ActiveItemState,
  CHAFF_PACK_RADIUS_TILES,
  type ActiveItemsView,
} from "../systems/ActiveItems";
import {
  actForLevel,
  canReachRoof,
  initialObjectives,
  isRunWon,
  type ObjectiveState,
} from "../systems/Objectives";
import { Vent4State } from "../systems/Vent4Core";
import { ROOF_ARRAY_LEVEL } from "../map/RoofArrayLevel";
import { trackForLevel } from "../systems/MusicSongs";
import { Encounters } from "./game/Encounters";
import { blockingLayerNames, isInteractTransition } from "../map/types";
import { linkAt, movingToward, planeLinksFor, type PlaneLink } from "../systems/PlaneLinks";
import { PLANE_FLOOR } from "../map/planes";
import { planFor, type MapPlan } from "../map/MapPlan";
import { getAudio } from "../systems/AudioDirector";
import { saveGame, clearSave, loadGame, type SlotId } from "../systems/SaveGame";
import { SharedField, WITNESS_RADIUS_TILES } from "../systems/SharedField";
import {
  canHoldUp,
  escortPoint,
  SurrenderAim,
  type SurrenderWorld,
} from "../systems/Surrender";
import {
  ConductState,
  FLAG_HOSTILE,
  FLAG_TAMPERING,
  FLAG_UNAUTHORIZED,
  type ConductMetrics,
  type ConductView,
} from "../systems/Conduct";
import { DEBUG_ALLOWED } from "../systems/DebugFlag";
import { len, withinOrEqual } from "../systems/distance";
import { UI } from "../ui/hudTheme";

/** Data passed to {@link GameScene} when (re)starting for a level swap. */
interface GameSceneData {
  level?: string;
  arriveX?: number;
  arriveY?: number;
}

/** Screen-fade duration for a level transition, in ms. */
const FADE_MS = 320;

/**
 * Layers that hold entities/markers rather than paintable tile art.
 *
 * Whole-board skipping, for boards the engine itself generates or that a v0.2-era
 * map filed by name. It is not the general answer any more: NW-SMAC-01 v0.4 names
 * its route boards for the routes rather than for the engine, and mixes art with
 * entities on the boards it does share. Both of those are handled per tile now —
 * see `EntityIndex` and `bakeTileLayers`' `claimedTiles`.
 *
 * `terminals` in particular had to leave: v0.4 files `main2vault`'s
 * `security_node1` on it beside four real terminals, and skipping the board
 * wholesale erased the scenery. The terminal tiles themselves are claimed, so
 * nothing draws twice.
 */
const ENTITY_LAYERS = new Set([
  "spawn",
  "enforcers",
  "orderlies",
  "drones",
  "security",
  "items",
  "doors",
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



/** Seconds between knocks, so the action can't be mashed. */
const KNOCK_COOLDOWN = 0.6;

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
  private lockers: Locker[] = [];
  /**
   * The body Rowan is carrying, if any.
   *
   * A `StashedBody` rather than an `Orderly | Enforcer` because from here the two
   * are the same thing — something on the floor that can be moved and put away —
   * and the scene has no reason to know which. See `src/entities/Locker.ts`.
   */
  private carried: StashedBody | null = null;
  /**
   * Set the frame a body is lifted, so `updateWorld` can check whether anyone
   * saw it happen once this frame's sensing context is built — pickup runs in
   * `updateInteractions`, before `refreshSensing`, so the check can't be done
   * inline at the pickup site.
   */
  private caughtLifting = false;
  private chests: Chest[] = [];
  private breakers: Breaker[] = [];
  /** Wall switches — the quiet, per-zone half of the power grid. */
  private lightSwitches: LightSwitch[] = [];
  /** Memoised {@link zoneWings}, and the level it was built for. */
  private zoneWingsCache: ReadonlyMap<string, string> = new Map();
  private zoneWingsFor?: GameLevel;
  /**
   * Circuit state, held across level swaps in the registry.
   *
   * A blackout outlives the deck it happened on: leaving main1 rebuilds every
   * entity on it, and without this the lights would be back on by the time the
   * player came down the ladder.
   */
  private powerGrid: PowerGridState = initialPowerGrid();
  /** Cutting the lights, and the facility sending somebody to put them back. */
  private readonly power = new PowerControl({
    tileSize: () => this.tileSize,
    levelName: () => this.level.name,
    lighting: () => this.lighting,
    detection: () => this.detection,
    orderlies: () => this.orderlies,
    noise: () => this.noise,
    powerGrid: () => this.powerGrid,
    violateUnauthorized: () => this.conduct.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED),
    circuitsFor: (target) => this.level.circuits?.[target] ?? [target],
    zoneWings: () => this.zoneWings(),
    lightSwitches: () => this.lightSwitches,
  });
  /** Destructible cover — the rest of the `cover` board is baked art with no entity. */
  private coverTiles: Cover[] = [];
  /** The vent-core/vault/roof set-piece encounters, and their mechanical wiring. */
  private encounters!: Encounters;
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
  private readonly anomalies = new Anomalies({
    tileSize: () => this.tileSize,
    doors: () => this.doors,
    chests: () => this.chests,
    lasers: () => this.lasers,
    sensors: () => this.sensors,
    orderlies: () => this.orderlies,
    guards: () => this.guards,
  });
  /** Refilled each frame and republished; see {@link RadarSnapshot}. */
  private readonly radarSnapshot = emptyRadarSnapshot();
  /** Refilled each frame by {@link publishFrame}; see the note there. */
  private readonly activeGuards: Enforcer[] = [];
  private lighting!: Lighting;
  private entityShadows!: EntityShadows;
  /**
   * Refilled each frame and handed to {@link entityShadows}. Held rather than built
   * per frame: the cast is three separate arrays that have to arrive as one list, and
   * concatenating them every frame is a throwaway array a frame for the whole run.
   */
  private readonly shadowCasters: ShadowCaster[] = [];
  private grid!: CollisionGrid;
  private detection!: DetectionSystem;
  private alert = new AlertState();
  /**
   * Whether the facility has released firearms. Sits beside {@link alert} because it
   * is the same kind of thing — base-wide escalation state, not a property of any
   * guard — and it is driven straight off the alert phase each frame.
   */
  private firearms = new FirearmsAuthorization();
  /** Anti-exploit: escalates repeated noise pings in the same area straight to ALERT. */
  private noiseSpam = new NoiseSpamTracker();
  /**
   * The readable tail of recent noise, for the radar's compass ticks.
   *
   * Cleared rather than replaced on a level swap: it owns a fixed buffer, and
   * keeping it is the point of having one.
   */
  private readonly noiseLog = new NoiseLog();
  private transitions!: TransitionGraph;

  /**
   * The rows the elevator panel opens with, staged between the E-press that
   * builds them and the `launchData` that reads them. Cleared implicitly: the
   * panel is only ever launched by `openElevatorPanel`, which writes it first.
   */
  private pendingElevatorFloors: ElevatorFloor[] = [];

  /** Where this scene run should start (level + optional arrival tile). */
  /** Set in init() from the map plan; the literal is only a pre-init placeholder. */
  private levelName = "";
  private arriveTile?: { x: number; y: number };
  /** A fade + level swap is in flight; input and further triggers are ignored. */
  private transitioning = false;
  /** Seconds the player has been cornered by a silicate during a full alert. */
  private captureProgress = 0;
  /**
   * Seconds since bio-integrity reached zero, or `null` while Rowan is alive.
   *
   * The run holds here for {@link PLAYER_DEFAULTS.deathHold} instead of cutting
   * straight to the outcome screen, so the flatline on the bio-integrity dial is
   * something the player watches rather than a single frame `endRun` throws away.
   */
  private dyingFor: number | null = null;
  /** Cooldown (seconds) remaining before the player can knock again. */
  private knockCooldown = 0;
  /** Run is a toggle (tap Space), not a hold — holding it alongside two direction
   * keys for a diagonal sprint asks a keyboard for 3 simultaneous keys, which some
   * keyboards fail to report (N-key rollover/ghosting) and no code can work around. */
  private runToggled = false;
  /** What each item does when Rowan uses it, and the two weapons that are not items. */
  private readonly items = new ItemActions({
    scene: this,
    tileSize: () => this.tileSize,
    player: () => this.player,
    grid: () => this.grid,
    alert: () => this.alert,
    conduct: () => this.conduct,
    noise: () => this.noise,
    activeItems: () => this.activeItems,
    orderlies: () => this.orderlies,
    guards: () => this.guards,
    lasers: () => this.lasers,
    coverTiles: () => this.coverTiles,
    empGfx: () => this.empGfx,
    deployables: () => this.deployables,
    fireTracers: () => this.fireTracers,
    registry: () => this.registry,
    markDeviation: () => {
      this.deviatedThisFrame = true;
    },
  });
  /** What a completed hold-to-hack does, and which terminals are special. */
  private readonly hacks = new TerminalHacks({
    tileSize: () => this.tileSize,
    player: () => this.player,
    terminals: () => this.terminals,
    doors: () => this.doors,
    power: () => this.power,
    detection: () => this.detection,
    noise: () => this.noise,
    overlays: () => this.overlays,
    objectives: () => this.objectives,
    registry: () => this.registry,
    note: (id) => this.note(id),
    takeMemo: (level) => this.takeMemo(level),
    levelName: () => this.level.name,
    publishObjectives: () => this.registry.set("objectives", this.objectives),
  });
  /** Mission progress (kept in the registry so it survives level swaps). */
  private objectives!: ObjectiveState;
  /** Rowan's journal — the run's counter-archive, also registry-backed. */
  private journal!: JournalState;
  /** The facility's own paper, taken off the terminals he breaks into. */
  private memos!: MemoState;
  /** Seen-tile mask for *this* level; the other levels' stay in the registry. */
  /** What Rowan has had a sightline to, and the throttled sweep that finds out. */
  private readonly tracker = new ExploredTracker({
    tileSize: () => this.tileSize,
    grid: () => this.grid,
    levelName: () => this.level.name,
    levelSize: () => this.level,
    eye: () => this.player.eye,
    camera: () => this.cameras.main,
    registry: () => this.registry,
    memory: () => this.memory,
  });
  /** Remembered geometry, drawn where the player can no longer see it. */
  private memory!: MemoryLayer;
  /** Fades whichever surface is over the player's head — roof, or gantry. */
  private planeOverlay!: PlaneOverlay;
  /** Walking between a level's two surfaces, and which one he is on. */
  private readonly traversal = new PlaneTraversal({
    tileSize: () => this.tileSize,
    player: () => this.player,
    lighting: () => this.lighting,
    releasePress: () => this.vault.releasePress(),
    colliders: () => ({
      wall: this.wallCollider,
      door: this.doorCollider,
      deckEdge: this.deckEdgeCollider,
      cover: this.coverCollider,
    }),
  });
  /** The ways between this level's surfaces — empty on a single-plane level. */
  private planeLinks: PlaneLink[] = [];
  /** Bodies penning the player onto the deck, enabled only while he is on it. */
  private deckEdgeCollider?: Phaser.Physics.Arcade.Collider;
  /** Milliseconds of play in this run, for the pause menu's STATUS clock. */
  private playTimeMs = 0;
  /** The Shared Field (WX-9) charge / active state. */
  private sharedField = new SharedField();
  /** The live hold-up, if any — who Rowan currently has a weapon on. */
  private holdUp = new SurrenderAim<Orderly>();
  /**
   * Whether somebody is standing where a hold-up *would* land, this frame.
   *
   * Resolved in `updateHoldUp` and read by the prompt several methods later, because
   * the geometry is worth answering exactly once a frame and the prompt runs after
   * the aim does.
   */
  private holdUpCandidate = false;
  /** Seconds until Rowan can attempt another bare-handed takedown — see `[Q]` above. */
  private takedownCooldownLeft = 0;
  /** True while an empty-handed `[Q]` would land on somebody — drives the prompt. */
  private takedownCandidate = false;
  /** The level's line-of-sight view, built once in `create` rather than per frame. */
  private surrenderWorld!: SurrenderWorld;
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
  /** The `[E]` verb and the status marker floating over Rowan's head. */
  private prompts!: InteractPrompt;

  /**
   * Developer debug mode — hotkeys, cheats, the world overlay. Present only
   * when DEBUG_ALLOWED (a dev build, or an explicit `?debug` opt-in), so every
   * read of it is guarded. See {@link DebugOverlay}.
   */
  private debug?: DebugOverlay;
  /** The player↔wall / player↔door colliders, kept so no-clip can toggle them. */
  private wallCollider?: Phaser.Physics.Arcade.Collider;
  private doorCollider?: Phaser.Physics.Arcade.Collider;
  /**
   * The player↔cover collider. Switched off every frame Rowan is crouched, which
   * is the squeeze: cover stops a standing man and yields to a crawling one.
   * `CollisionGrid` keeps cover solid throughout, so guards still can't follow.
   */
  private coverCollider?: Phaser.Physics.Arcade.Collider;
  /** Going over furniture, and flattening against it — they share a latch. */
  private vault!: VaultAndPress;

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
    holdUp: Phaser.Input.Keyboard.Key;
    press: Phaser.Input.Keyboard.Key;
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

    // The score follows the level. Every transition restarts this scene, so this
    // one call covers arriving, warping and reloading a save alike — and asking
    // for the track that is already playing is a no-op, so walking back into a
    // level does not re-cut its song.
    getAudio().setTrack(trackForLevel(this.level.name));

    const worldW = this.level.width * this.tileSize;
    const worldH = this.level.height * this.tileSize;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBackgroundColor(UI.bgVoid);

    // Reads each wall tile's authored footprint, so a pane wider than its own
    // cell blocks all of it — and marks the glazed ones see-through as it goes.
    // Which boards block is the map's own call now (`Collision: 1`), not a
    // hardcoded `["walls"]`, so cover and the roof's fence stop the player too.
    this.grid = new CollisionGrid(this.level, blockingLayerNames(this.level), this.tileSize);
    this.detection = new DetectionSystem(this.level, this.tileSize);
    // Read before `buildLevel`, which needs each breaker's live state to build it
    // in the right position. Same read-or-init-then-keep-the-reference pattern as
    // `objectives` and `explored` below.
    this.powerGrid =
      (this.registry.get("powerGrid") as PowerGridState | undefined) ?? initialPowerGrid();
    this.registry.set("powerGrid", this.powerGrid);
    this.sensing = this.buildSensingContext();
    // One object for the level rather than a literal per frame — the same reasoning
    // `SensingContext` exists for, on a much smaller scale.
    this.surrenderWorld = { tileSize: this.tileSize, grid: this.grid };

    const built = buildLevel(
      this,
      this.level,
      this.tileSize,
      this.grid,
      this.detection,
      this.arriveTile,
      ENTITY_LAYERS,
      this.powerGrid,
    );
    this.player = built.player;
    this.guards = built.guards;
    this.lockers = built.lockers;
    this.orderlies = built.orderlies;
    this.doors = built.doors;
    this.terminals = built.terminals;
    this.sensors = built.sensors;
    this.chests = built.chests;
    this.breakers = built.breakers;
    this.lightSwitches = built.lightSwitches;
    this.lasers = built.lasers;
    this.coverTiles = built.coverTiles;
    this.hacks.designateQualiaRack();
    this.hacks.designateLogCacheNodes();

    this.vault = new VaultAndPress({
      tileSize: this.tileSize,
      grid: () => this.grid,
      detection: () => this.detection,
      player: () => this.player,
      heldUp: () => this.holdUp.target !== null,
    });

    // Holds the arrays by reference, so it always sees this level's cast.
    this.noise = new NoiseEvents({
      tileSize: this.tileSize,
      grid: this.grid,
      alert: this.alert,
      noiseSpam: this.noiseSpam,
      noiseLog: this.noiseLog,
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
    this.coverCollider = this.physics.add.collider(this.player.sprite, built.coverBodies);

    // Fill the level with opaque darkness, light it from the `light_sources`, and
    // clip all of it to the player's line of sight. Shares the same light data
    // DetectionSystem uses, so lit spots are visibly and mechanically hot; takes the
    // same collision grid the guards' sight tests use, so walls occlude identically.
    this.lighting = new Lighting(this, this.level, this.tileSize, this.grid);
    // After the lighting, and reading from it: a shadow is thrown by the same fixtures
    // the darkness is carved out for, so walking under a lamp swings it around.
    this.entityShadows = new EntityShadows(this, this.lighting);
    // Any circuit already thrown — on this visit or a previous one — has to be
    // applied now that both consumers exist. `Lighting` is built after the level,
    // so no fixture can do this for itself at construction.
    //
    // Read off the persisted state rather than off the breakers, because a breaker
    // is no longer the only thing that can throw one: a wall switch or a hacked
    // terminal leaves an override with no fixture behind it, and walking the
    // fixtures would put those rooms' lights back on.
    this.power.restore(this.level.name);

    // VENT-4 lives only in the vent core. Its continuous audio layers are
    // scene-independent, so silence them on every entry and re-arm to match a
    // restored mid-fight state (the snapshot survives level swaps via the
    // registry; resetRun clears it).
    getAudio().setSuction(false);
    getAudio().setPurge(false);
    this.encounters = new Encounters(
      this,
      this.player,
      new SetPieceEvents({
        scene: this,
        tileSize: this.tileSize,
        player: () => this.player,
        alert: () => this.alert,
        objectives: () => this.objectives,
        guards: () => this.guards,
        lasers: () => this.lasers,
        note: (id) => this.note(id),
        publishObjectives: () => this.registry.set("objectives", this.objectives),
      }),
    );
    this.encounters.build(this.level, this.tileSize, this.grid, !!this.objectives?.coreSilenced);
    if (this.encounters.vent4State === Vent4State.PHASE_2_VACUUM) getAudio().setSuction(true);
    else if (this.encounters.vent4State === Vent4State.PHASE_3_PURGE) getAudio().setPurge(true);

    this.cameras.main.startFollow(this.player.sprite, true, 0.15, 0.15);
    this.cameras.main.setZoom(CAMERA_ZOOM);
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
        entityShadows: this.entityShadows,
        wallCollider: () => this.wallCollider,
        doorCollider: () => this.doorCollider,
        coverCollider: () => this.coverCollider,
        warpTargets: () => this.debugWarpLevels(),
        warpTo: (levelName) => this.debugWarp(levelName),
        giveItem: (name) => this.debugGiveItem(name),
        forceFailNearestTerminal: () => this.debugForceFailNearestTerminal(),
      });
    }

    this.createWorldMarkers();

    // Fade in from black (also covers arrivals from a transition).
    this.cameras.main.fadeIn(FADE_MS, 5, 7, 10);
    this.announceAct();

    this.restoreRunState();
    // Needs `this.objectives` populated, which is why this runs after
    // restoreRunState rather than alongside the other terminal designation
    // calls above — betaLost isn't known until the run's objectives are read
    // back from the registry/save.
    this.hacks.reapplyLostBeta();

    // The third visibility state: tiles already surveyed, painted back over the
    // darkness wherever sight no longer reaches them. Built here rather than
    // beside `Lighting` because it primes itself from the explored mask, which
    // `restoreRunState` is what loads. Clipped to the darkness's own shadow fan,
    // so "seeing" and "remembering" are divided by the same line.
    this.memory = new MemoryLayer(
      this,
      this.level,
      this.tileSize,
      ENTITY_LAYERS,
      built.claimedTiles,
    );
    this.memory.clipTo(this.lighting.shadowGeometry);
    this.memory.prime(this.tracker.explored);
    this.planeOverlay = new PlaneOverlay(this.level, this.tileSize, built.planes);
    this.planeLinks = planeLinksFor(this.level, this.tileSize);
    if (built.deckEdgeBodies.length > 0) {
      this.deckEdgeCollider = this.physics.add.collider(this.player.sprite, built.deckEdgeBodies);
      // Inert until he actually climbs: on the floor the deck's edges are
      // overhead, not underfoot.
      this.deckEdgeCollider.active = false;
    }

    if (!this.scene.isActive("UIScene")) this.scene.launch("UIScene");

    // A level transition is a scene.restart(), which builds a fresh Lighting.
    // The old one owns off-display-list stamps Phaser will not reclaim on its
    // own, so hand them back before this run of the scene goes away.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.persistRunState();
      this.lighting.destroy();
      this.memory.destroy();
      this.entityShadows.destroy();
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
      firearms: this.firearms,
      flashlightOn: () => this.activeItems.flashlightBeamActive,
      thermalMasked: () => this.activeItems.thermalMasked,
      rationOpened: () => this.activeItems.sackLunchOpened,
      pressed: () => this.player.pressed,
      flashlightMultiplier: FLASHLIGHT_DETECTION_MULTIPLIER,
      rationMultiplier: OPENED_RATION_DETECTION_MULTIPLIER,
      pressMultiplier: WALL_PRESS_DETECTION_MULTIPLIER,
      coverTilesNear: (tx, ty, r) =>
        coverTilesNear(
          {
            isBlocked: (bx, by) => this.grid.isBlocked(bx, by),
            coverTypeAt: (px, py) => this.detection.coverTypeAt(px, py),
          },
          this.level.width,
          this.level.height,
          this.tileSize,
          tx,
          ty,
          r,
        ),
      isOperableDoor: (tx, ty) => this.guardOperableDoorAt(tx, ty) !== null,
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

    this.prompts = new InteractPrompt(this, this.tileSize);
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
    this.memos = (this.registry.get("memos") as MemoState | undefined) ?? initialMemos();
    this.registry.set("memos", this.memos);
    this.playTimeMs = (this.registry.get("playTimeMs") as number | undefined) ?? 0;
    this.tracker.reload();

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
   * carry across — objectives, journal, inventory, HP, the play clock, conduct
   * metrics, the flashlight's owned/on/charge state — is deliberately absent,
   * and rides the registry instead.
   */
  private resetPerRun(): void {
    this.guards = [];
    // Bodies belong to the level they were put down on, and a carried one must
    // not survive a transition into a scene where it no longer exists.
    this.lockers = [];
    this.carried = null;
    this.orderlies = [];
    // A lunch left on deck 1 is not still on the floor when you come back up a
    // ladder: deployables belong to the level, like the guards who react to them.
    this.deployables = [];
    this.doors = [];
    this.terminals = [];
    this.lasers = [];
    this.sensors = [];
    this.chests = [];
    // The breakers and switches themselves belong to the level and are rebuilt with
    // it; the circuit *state* they read does not, and stays in the registry.
    this.breakers = [];
    this.lightSwitches = [];
    this.power.reset();
    this.alert = new AlertState();
    this.firearms = new FirearmsAuthorization();
    this.noiseSpam = new NoiseSpamTracker();
    this.noiseLog.clear();
    this.sharedField = new SharedField();
    // Load-bearing: a live aim holds a reference to an `Orderly`, and every orderly on
    // the deck is rebuilt by the restart this method exists to service. Without this
    // the new level would open with a weapon pointed at a destroyed sprite.
    this.holdUp = new SurrenderAim<Orderly>();
    this.takedownCooldownLeft = 0;
    // Conduct metrics are per *run*, not per level, and a level change is a
    // scene.restart() — so they ride the registry rather than resetting here.
    this.conduct = new ConductState(
      this.registry.get("conductMetrics") as ConductMetrics | undefined,
    );
    // Owned/on/charge ride the registry snapshot published every frame for the
    // HUD, so the flashlight survives a level swap instead of coming back full.
    this.activeItems = new ActiveItemState(
      this.registry.get("activeItems") as ActiveItemsView | undefined,
    );
    this.transitioning = false;

    this.captureProgress = 0;
    this.knockCooldown = 0;
    this.runToggled = false;
    this.items.reset();
    this.hacks.reset();
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
   * Names the act, once, on the level that crosses into it.
   *
   * Published for `UIScene` to draw rather than drawn here: this scene's camera
   * is zoomed for the SNES look, and a title card scaled by 3 would be the size
   * of a room. `UIScene` is the unzoomed overlay, and it removes the cue as it
   * plays it.
   *
   * Deferred to `FADE_IN_COMPLETE` because `UIScene` is *not* faded — a card
   * published now would be legible over a black screen for the length of the
   * fade and then be half over by the time there was a level behind it.
   *
   * `ACT_SHOWN_KEY` is a run key, so a fresh infiltration re-announces Act I,
   * and coming back down a ladder into a deck of the act you are already in says
   * nothing. A map whose levels this engine does not recognise gets no cards at
   * all — the same courtesy `journalIdForLevel` extends to arrival entries.
   */
  private announceAct(): void {
    const act = actForLevel(this.level.name);
    if (act === undefined || this.registry.get(ACT_SHOWN_KEY) === act) return;
    this.registry.set(ACT_SHOWN_KEY, act);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
      this.registry.set(ACT_CARD_KEY, act);
    });
  }

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

  /**
   * Takes whatever memo this deck's terminals still hold.
   *
   * Which memo is `Memos.nextMemoFor`'s decision, not this one's — the same
   * split every other system here uses, and it is what lets the deal-out rule be
   * tested without a map. Nothing happens once a deck's paper and the general
   * pool are both exhausted, which is the ordinary late-run case.
   */
  private takeMemo(level: string): void {
    const memo = nextMemoFor(level, this.memos);
    if (!memo || !noteMemo(this.memos, memo.id)) return;
    this.registry.set("memos", this.memos);
    getAudio().pickup();
  }

  /** Hands the pause menu everything its MAP tab needs to draw this level. */
  private publishMapSnapshot(): void {
    this.tracker.flush();
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
      explored: this.tracker.explored,
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
      // reading the journal must not throw the infiltration away. The freed key
      // went to the hold-up, which wants to sit under the movement hand.
      holdUp: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      pause: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      codec: kb.addKey(Phaser.Input.Keyboard.KeyCodes.C),
      field: kb.addKey(Phaser.Input.Keyboard.KeyCodes.F),
      flashlight: kb.addKey(Phaser.Input.Keyboard.KeyCodes.L),
      knock: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      // Latched rather than held, for the reason `runToggled` is: pressing is a
      // state you travel in, and holding a modifier down through a long slide
      // along a wall while also steering is a hand cramp, not a mechanic.
      press: kb.addKey(Phaser.Input.Keyboard.KeyCodes.X),
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
            this.registry.remove("complianceFailed");
          },
        },
        qualia: {
          sceneKey: "QualiaLockScene",
          onOpen: () => {
            this.registry.remove("qualiaSolved");
            this.registry.remove("qualiaClosed");
          },
        },
        elevator: {
          sceneKey: "ElevatorScene",
          // Read at open time, which is why the rows are staged on the scene
          // rather than passed in: `openElevatorPanel` knows the shaft, and the
          // gate is what actually launches.
          launchData: () => ({
            here:
              this.transitions.floorAt(
                this.level.name,
                Math.floor(this.player.x / this.tileSize),
                Math.floor(this.player.y / this.tileSize),
              )?.label ?? this.level.name,
            floors: this.pendingElevatorFloors,
            alerting: this.alert.phase === "ALERT",
          }),
          onOpen: () => {
            this.registry.remove(ELEVATOR_CHOICE_KEY);
            this.registry.remove(ELEVATOR_CLOSED_KEY);
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
   * mission-critical log stays recoverable; a wrong-but-committed transmit
   * destroys the terminal instead.
   *
   * God mode (debug) downgrades a "failed" outcome to "closed": the terminal is
   * safely re-armed instead of bricked, the same way it already blocks the
   * HP and capture fail paths. This can't be folded into that per-frame
   * neutralization block (`this.debug?.godMode` further down) because the
   * brick happens once, here, rather than continuously — there is nothing to
   * "undo after the fact" the way restoring HP undoes a frame of damage.
   */
  private updateComplianceOverlay(): void {
    let result = this.overlays.pollResult("complianceSolved", "complianceClosed", "complianceFailed");
    if (!result) return;
    if (result === "failed" && this.debug?.godMode) result = "closed";
    this.hacks.settleOverlay("compliance", result);
  }

  /**
   * Polls the qualia overlay's outcome while it's open. Completing the bypass
   * runs the normal breach effect (nearby doors released); a purge or abort
   * re-arms the rack so the spike can be reattempted.
   */
  private updateQualiaOverlay(): void {
    const result = this.overlays.pollResult("qualiaSolved", "qualiaClosed");
    if (!result) return;
    this.hacks.settleOverlay("qualia", result);
  }

  /**
   * Opens the car's floor panel, sealing the rows the run hasn't earned.
   *
   * The roof is the only gated stop, and it is shown rather than withheld for
   * the reason its ladder always has been: the player should know where they
   * are going before they are allowed to go.
   */
  private openElevatorPanel(stops: ShaftStop[], roofSealed: boolean): void {
    this.pendingElevatorFloors = stops.map((stop) => ({
      ...stop,
      lockedNote: stop.level === ROOF_ARRAY_LEVEL && roofSealed ? "SEALED" : undefined,
    }));
    this.overlays.set("elevator", true);
  }

  /**
   * Collects the floor the panel chose, and rides there.
   *
   * Not `pollResult`, which reads booleans: a choice carries *which* floor, so
   * it comes back as the stop itself. The panel is closed before the fade so the
   * overlay isn't left owning the screen through a scene restart.
   */
  private updateElevatorOverlay(): void {
    const chosen = this.registry.get(ELEVATOR_CHOICE_KEY) as ShaftStop | undefined;
    if (chosen) {
      this.registry.remove(ELEVATOR_CHOICE_KEY);
      this.overlays.set("elevator", false);
      this.note("the-lift");
      this.beginTransition({
        toLevel: chosen.level,
        toX: chosen.x,
        toY: chosen.y,
        kind: "roof_access",
      });
      return;
    }
    if (this.registry.get(ELEVATOR_CLOSED_KEY) === true) {
      this.registry.remove(ELEVATOR_CLOSED_KEY);
      this.overlays.set("elevator", false);
    }
  }

  /** Abandons the run from the pause overlay and returns to the title. */
  private abortToTitle(): void {
    this.overlays.set("pause", false);
    getAudio().setMood("none");
    // No `setTrack(null)`: TitleScene sets the main theme in its own `create`, so
    // whatever the abandoned run was playing crossfades into it. Cutting to
    // silence here would only put a hole between the two.
    setMode(this.registry, "TITLE");
    this.scene.stop("UIScene");
    this.scene.start("TitleScene");
    this.scene.stop();
  }

  /**
   * The first frame of the death hold: stop Rowan, and cut the music.
   *
   * Silence rather than the capture sting, which {@link endRun} still owns and plays
   * as the outcome card comes up. The alert loop running on over a flatline would say
   * the facility is still hunting someone, which it is not — it is done. What the hold
   * is for is the gap between those two facts.
   */
  private beginDeathHold(): void {
    this.player.sprite.setVelocity(0, 0);
    this.physics.pause();
    getAudio().setMood("none");
    getAudio().setTrack(null);
  }

  /** Ends the run: stops play + HUD and shows the outcome scene. */
  private endRun(mode: GameMode, sceneKey: string): void {
    setMode(this.registry, mode);
    getAudio().setMood("none");
    getAudio().setTrack(null);
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
    this.tracker.flush();
    saveGame(slot, {
      level: this.level.name,
      tileX: Math.floor(this.player.x / this.tileSize),
      tileY: Math.floor(this.player.y / this.tileSize),
      hp: this.player.hp,
      inventory: readInventory(this.registry),
      objectives: this.objectives,
      journal: this.journal,
      memos: this.memos,
      explored: (this.registry.get("explored") as ExploredState | undefined) ?? initialExplored(),
      playTimeMs: this.playTimeMs,
    });
  }

  /** Writes a resume checkpoint on entry to this level. */
  private saveCheckpoint(): void {
    this.writeSave("auto");
  }

  /**
   * Everyone on this level who can be put down, carried and stashed.
   *
   * One roster over both casts, because "a body" is not a fact about which class
   * it came from. Five separate places have to agree on who is currently out of
   * play — the anomaly scan, the ground shadows, the radar, the alert-network
   * count and the pick-up search — and before this they each iterated `guards`
   * and `orderlies` on their own terms. A stashed body dropped from four of them
   * and not the fifth is a body that is invisible and still reported, which is
   * the exact bug the mechanic exists to prevent.
   *
   * Allocates a fresh array per call, so callers on the frame path take the two
   * lists directly and only the once-per-press pick-up search uses this.
   */
  private stashables(): StashedBody[] {
    return [...this.guards, ...this.orderlies];
  }

  /**
   * Keeps a carried body on Rowan's shoulder.
   *
   * Driven from `tickWorld` after he has moved, so the body lands on this frame's
   * position rather than last frame's — at the carry pace that is a couple of
   * pixels, but it is the difference between a body that rides and one that
   * visibly lags.
   */
  private updateCarry(): void {
    this.carried?.moveTo(this.player.x, this.player.y);
  }

  /**
   * Charges the Shared Field by witnessing a nearby silicate (within range, with
   * line of sight), activates it on F, and publishes its state for the HUD. The
   * undetectable effect is applied in update() via the concealment path.
   *
   * **Silicate** guards only — a human security guard is not a witness, however
   * close he stands. There is no "we" to merge into with a man, and the whole
   * verb is the merge; letting him charge it would make the run's signature
   * mechanic indifferent to the one distinction the setting is about.
   *
   * Silicate guards are the usual witnesses, but the last two acts have their own: the vault's
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
      this.guards.some((e) => e.isSilicate && sees(e.x, e.y, WITNESS_RADIUS_TILES)) ||
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
  /**
   * The **hold-up**: pointing a weapon at a person instead of firing it, and walking
   * him ahead of you while you do.
   *
   * The third of the three things Rowan can do with a weapon, and the only one that
   * does not go off. It is deliberately the quiet one — there is **no**
   * `noise.emitAt` call anywhere in here, which is the whole reason to prefer it over
   * a dart, and is why {@link HOLD_UP_REACH_TILES} makes you close for it. What it
   * costs instead is conduct: a man at gunpoint is the least compliant thing in the
   * building, so the HOSTILE flag runs the entire time and for fourteen seconds after.
   *
   * Everything about *whether* a hold survives lives in `Surrender.ts` where it can
   * be tested; everything about what a surrender *is* lives in `Orderly`. This is the
   * wiring in between.
   */
  private updateHoldUp(dt: number): void {
    const inventory = readInventory(this.registry);
    const armed = canHoldUp(inventory);
    // `inputLocked` releases the hold rather than merely ignoring the key: the roof's
    // discharge is the run's authored ending, and a hostage must not stay frozen
    // through the tribunal because a finger was still on Q.
    const aiming = this.keys.holdUp.isDown && armed && !this.encounters.inputLocked;

    // The unarmed half of the same key. A *tap*, unlike the hold-up's held aim, because
    // the two are different shapes of action: one is a posture Rowan maintains, the
    // other is a thing he does once.
    //
    // `JustDown` is a **consuming** read, so it is evaluated unconditionally and masked
    // afterwards — the same discipline `updateInteractions` uses on [E], and for the
    // same reason. Guarding the call itself would bank the press while a weapon was in
    // hand and spend it on the frame after Rowan dropped one.
    const takedownJust = Phaser.Input.Keyboard.JustDown(this.keys.holdUp);
    this.takedownCooldownLeft = Math.max(0, this.takedownCooldownLeft - dt);
    if (
      takedownJust &&
      !armed &&
      !this.encounters.inputLocked &&
      this.takedownCooldownLeft <= 0 &&
      this.items.takedown()
    ) {
      // Charged only for a press that connected — see `ItemActions.takedown`, which
      // reports false for empty air rather than burning the cooldown on it.
      this.takedownCooldownLeft = PLAYER_MELEE_COOLDOWN;
    }

    const r = this.holdUp.update(dt, aiming, this.player, this.orderlies, this.surrenderWorld);
    // Set even when nothing is held — it is what lets the prompt offer the verb
    // before the player has thought to press the key. Gated on carrying a weapon,
    // because advertising an action Rowan cannot perform is worse than silence.
    this.holdUpCandidate = r.candidate !== null && armed;
    // Only asked when it could be offered — the scan walks every orderly and guard on
    // the deck, and there is no reason to pay for it while a weapon is in hand.
    this.takedownCandidate = !armed && this.items.takedownCandidate() !== undefined;
    const target = r.target;
    if (!target) return;

    // Re-asserted every frame, exactly like a terminal hold: `handsUp` and `violate`
    // both take the max, so "held throughout, then a cooldown" needs no bookkeeping
    // here and cannot be left set by a path that forgets to clear it.
    target.handsUp(HOLD_UP_GRACE_SECONDS);
    this.conduct.violate("HOSTILE", FLAG_HOSTILE);

    const point = escortPoint(this.player, ESCORT_STANDOFF_TILES, this.tileSize);
    target.escortTo(point.x, point.y);
    // Standing still, Rowan looks at the man rather than at the last wall he walked
    // toward. Moving, his facing is the direction he is pushing — which is also what
    // aims the escort point, so the march needs no aiming input of its own.
    if ((this.player.sprite.body as Phaser.Physics.Arcade.Body).velocity.lengthSq() === 0) {
      this.player.face(Math.atan2(target.y - this.player.y, target.x - this.player.x));
    }

    if (r.acquired) {
      this.note("hands-up");
      getAudio().select();
    }
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
      this.vault.releasePress();
      return {
        up: false,
        down: false,
        left: false,
        right: false,
        sneak: false,
        run: false,
        escorting: false,
        carrying: false,
        press: null,
        canStand: true,
      };
    }

    const correction = this.encounters.correction;
    return {
      up: correction?.invertY ? down : up,
      down: correction?.invertY ? up : down,
      left: correction?.invertX ? right : left,
      right: correction?.invertX ? left : right,
      sneak: k.sneak.isDown,
      run: this.runToggled,
      press: this.vault.pressSurface(),
      canStand: !this.vault.inCover(),
      // Marching a hostage slows Rowan and rules out a sprint. It lands here rather
      // than in `Player` for the reason the doc above gives, and it deliberately does
      // *not* touch the direction: the whole march is steered by walking normally,
      // and the axes are still inverted underneath it if NW-SMAC-01 is doing that.
      escorting: this.holdUp.target !== null,
      carrying: this.carried !== null,
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

    // Pause (Esc), the codec (C), the two minigames and the elevator's floor panel
    // each freeze the sim behind an overlay scene. The minigames and codec suppress
    // the pause/codec toggles, and so does the panel — Esc is its own cancel key,
    // and without this guard dismissing it would open the pause menu on the way out.
    //
    // Both reads are *consuming*, and so are evaluated unconditionally and masked
    // afterwards — the same discipline `updateInteractions` spells out. Skipping
    // the call banks the press instead of swallowing it, and it then fires on the
    // frame the overlay closes: Esc dismissing the floor panel would land in the
    // pause menu on its way out.
    const ov = this.overlays;
    const pausePressed = Phaser.Input.Keyboard.JustDown(this.keys.pause);
    const codecPressed = Phaser.Input.Keyboard.JustDown(this.keys.codec);
    const ownsKeys = ov.minigameOpen || ov.isOpen("elevator");
    if (!ov.isOpen("codec") && !ownsKeys && pausePressed) {
      ov.set("pause", !ov.isOpen("pause"));
    }
    if (!ov.isOpen("pause") && !ownsKeys && codecPressed) {
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

    // Rowan stops moving the moment he's gone. `frozen` below deliberately leaves the
    // player free to walk (it exists for the debug freeze-world, where that is the
    // point), so it does not cover this: without the gate a held direction key keeps
    // the walk cycle animating through the whole death hold.
    if (this.dyingFor === null) this.updatePlayerFrame(dt, delta);
    this.updateInteractions(dt);
    this.power.updateResets(this.time.now / 1000);
    this.updateSharedField(dt);
    this.items.update(dt);
    const fieldActive = this.sharedField.isActive;

    // Conduct: ticked after updateInteractions so this frame's violations (a terminal
    // hold, a chest search) are already registered, and before the sensing context is
    // built below, which reads the result. Walking normally with the base unaware
    // reads as staff and every sensor clears Rowan on sight; running, sneaking or
    // meddling with anything drops that cover for a cooldown.
    // The Q0 cert (silencing VENT-4) is proof of compliance in good standing: with it
    // Rowan can stand down a *search* and pass as staff again, though never an ALERT.
    const certified = readInventory(this.registry).includes(CERT_ITEM);
    // Distance is sampled from the frame's actual displacement rather than from speed ×
    // dt, so being shoved by VENT-4 or held against a wall reports honestly.
    const movedTiles =
      len(this.player.x - this.lastPlayerX, this.player.y - this.lastPlayerY) / this.tileSize;
    this.lastPlayerX = this.player.x;
    this.lastPlayerY = this.player.y;

    this.conduct.update(dt, {
      alertPhase: this.alert.phase,
      // Hurdling the furniture reads exactly as un-staff-like as a sprint, so it
      // rides the same continuous breach rather than earning a sixth reason code.
      running: this.player.running || this.vault.vaulting,
      // Flattening yourself against a wall is furtive in the same way crouching
      // is — the rule this file's `Conduct` doc calls "sneaking is a tell".
      sneaking: this.player.crouched || this.player.pressed,
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

    // Cover concealment, by two routes.
    //
    // *Inside* it: squeezed into a cover cell, crouched by definition (the cover
    // collider only yields to a crouch), and hidden whatever the cover's height.
    //
    // *Against* it: pressed on the outside face. Height decides — a server rack
    // is tall enough to hide a standing man, a crate only a crouching one. This
    // is what the LOW/HIGH split the map has always authored finally buys.
    //
    // Standing on a cover tile also still counts, which is the rooftop's case:
    // its cover board was never marked solid, so it is walked over rather than
    // squeezed into, and `inCover` is false there.
    const cover = this.detection.coverTypeAt(this.player.x, this.player.y);
    const pressedCover = this.vault.pressedCoverType();
    const coverConceal =
      cover === "high" ||
      (cover === "low" && this.player.crouched) ||
      pressedCover === "high" ||
      (pressedCover === "low" && this.player.crouched);
    const concealed = fieldActive || coverConceal;
    // Thermal sees through cover that leaks heat (ThermalBleed); the map's cover
    // all blocks heat, so concealment normally hides from thermal too.
    // Read at the cover that is actually doing the hiding — the tile underfoot
    // when squeezed into it, the tile being held when pressed against it.
    const concealingTile = pressedCover !== undefined ? this.vault.pressedCoverCentre() : this.player;
    const thermalConcealed =
      fieldActive ||
      (coverConceal && !this.detection.thermalBleedAt(concealingTile.x, concealingTile.y));
    this.prompts.showStatus(this.player, concealed, compliant);

    const phaseBefore = this.alert.phase;
    // Debug freeze-world holds every AI, hazard and timer still while leaving
    // the player free to walk. Read once so the frame is internally consistent.
    // The death hold rides the same flag: patrols, hazards and the alert clock all
    // have to stop while the dial flatlines, and that is exactly what freeze-world
    // already means. A second, near-identical freeze would only be a second thing to
    // keep in sync.
    const frozen = (this.debug?.frozenWorld ?? false) || this.dyingFor !== null;
    const ctx = this.refreshSensing(concealed, compliant, thermalConcealed);
    // Getting caught in the act: a body lifted in front of a guard or orderly
    // who can actually see the player this frame is an unmissable tell, so it
    // escalates straight to a red alert rather than waiting on that witness's
    // own next detection tick or anomaly scan.
    if (this.caughtLifting) {
      this.caughtLifting = false;
      const seen =
        !frozen &&
        (this.guards.some((g) => g.canWitness(ctx)) || this.orderlies.some((o) => o.canWitness(ctx)));
      if (seen) {
        this.alert.reportSighting(
          Math.floor(this.player.x / this.tileSize),
          Math.floor(this.player.y / this.tileSize),
        );
      }
    }
    const maxDetection = this.tickWorld(dt, ctx, frozen);
    // After `tickWorld`, which is where the bodies were moved for the frame — a shadow
    // placed before it would trail the feet it belongs to by one. Unconditional even
    // when the world is frozen: the debug freeze holds the patrols still but leaves
    // Rowan free to walk around and look at them, and his shadow has to come along.
    this.updateEntityShadows();

    this.alert.update(frozen ? 0 : dt);
    // After the alert, so a phase that ended this frame stands the weapons down on the
    // same frame rather than one late.
    this.firearms.update(frozen ? 0 : dt, this.alert.phase);
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
    // "Silicate" is meant literally, which is why the guard list is filtered
    // rather than counted. This ending is the *mesh* seizing him; a human
    // security guard cornering him is a man with a job, and routing that through
    // the Alignment ending would say the two are the same thing. He can still
    // shoot, so he is not harmless — he just isn't this.
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
      this.guards.some((e) => e.isSilicate && this.isCornering(e));
    this.captureProgress = cornered
      ? this.captureProgress + dt
      : Math.max(0, this.captureProgress - dt * 2);
    // God mode (debug): neutralize both death paths after they've been computed
    // for the frame — restore bio-integrity and clear any capture progress.
    if (this.debug?.godMode) {
      this.player.hp = this.player.maxHp;
      this.captureProgress = 0;
    }
    // The two fail paths used to share this branch, but only one of them has anything
    // to show. Bio-integrity depletion holds for a beat so the dial's flatline is
    // watchable; being cornered ends immediately, because Rowan is seized at full
    // health and there is no readout there — a pause would just be latency.
    if (!captured && !this.player.alive) {
      if (this.dyingFor === null) {
        this.dyingFor = 0;
        this.beginDeathHold();
      } else {
        this.dyingFor += dt;
      }
      if (this.dyingFor >= PLAYER_DEFAULTS.deathHold) this.endRun("ALIGNED", "GameOverScene");
      return;
    }
    // Cleared whenever Rowan is alive again (god mode) or the roof has taken over,
    // so a hold can never sit armed behind a run that carried on.
    this.dyingFor = null;
    if (!captured && this.captureProgress >= PLAYER_DEFAULTS.captureTime) {
      this.endRun("ALIGNED", "GameOverScene");
      return;
    }
    // End of run. EIRA-7 is through to the Lattice and Rowan is not going anywhere —
    // the transmission succeeding and the courier being taken are the same beat, so
    // there is one ending rather than a win screen and a loss screen.
    if (isRunWon(this.objectives, this.level.name, this.hacks.features())) {
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
    this.sensing.setPlane(this.traversal.plane);
    // Opened doors/chests, EMP'd devices and stunned orderlies, for anomaly scanning.
    this.sensing.setAnomalies(this.anomalies.build(this.sensing.chaffZone));
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
    if (ov.isOpen("elevator")) this.updateElevatorOverlay();
  }

  /**
   * Input, the lights it drives, and the clocks that only tick during live play.
   *
   * The run clock and the explored-tile map advance here rather than at the top
   * of the frame because everything above returns early while an overlay or a
   * fade owns it: time spent reading the journal is not time spent infiltrating.
   */
  private updatePlayerFrame(dt: number, delta: number): void {
    // Before `player.update`, and the order is load-bearing twice over: `face()` has
    // to land before the animation is picked (`setAnimation` reads `dir` inside that
    // call), and `readInput` has to already know whether a hold is live.
    this.updateHoldUp(dt);
    // Space toggles running rather than being held, so a diagonal sprint never needs
    // more than the two direction keys — see `runToggled`'s doc comment for why.
    if (Phaser.Input.Keyboard.JustDown(this.keys.run)) {
      this.runToggled = !this.runToggled;
    }
    // X latches onto the nearest face; tapping it again lets go. `pressSurface`
    // drops the latch by itself when there is nothing left to hold.
    if (Phaser.Input.Keyboard.JustDown(this.keys.press)) {
      this.vault.togglePress();
    }
    if (this.traversal.climbing) this.traversal.tick(dt);
    else if (this.vault.vaulting) this.vault.tick(dt);
    else this.player.update(this.readInput(), dt);
    // Cover yields to a crouch and to nothing else. Re-asserted every frame
    // rather than toggled on the stance change, so it cannot be left inverted by
    // a level transition, a load, or the debug no-clip that shares the flag.
    if (this.coverCollider && !this.debug?.noClip) {
      this.coverCollider.active =
        !this.player.crouched &&
        !this.vault.vaulting &&
        !this.traversal.climbing &&
        this.traversal.plane === PLANE_FLOOR;
    }
    // Flashlight: L toggles the beam; feed its state to the lighting cone.
    if (Phaser.Input.Keyboard.JustDown(this.keys.flashlight)) {
      this.activeItems.toggleFlashlight();
    }
    // Knock (R): rap on an adjacent wall/object to lure guards and orderlies there.
    // Not while holding someone up — his hands are full, and a knock is loud, which
    // is the one thing a hold-up is for not being.
    this.knockCooldown = Math.max(0, this.knockCooldown - dt);
    if (
      this.knockCooldown <= 0 &&
      !this.holdUp.target &&
      Phaser.Input.Keyboard.JustDown(this.keys.knock) &&
      this.noise.knock(this.player.x, this.player.y, this.player.facing)
    ) {
      // Deliberately banging on the walls is not what staff do.
      this.conduct.violate("TAMPERING", FLAG_TAMPERING);
      getAudio().door();
      this.knockCooldown = KNOCK_COOLDOWN;
    }
    // Cast from where the body actually is, not from the sprite Arcade has yet to
    // move — see `Player.eye`. The camera follows the post-physics position at
    // render time, so reading the sprite here leaves the darkness a step behind the
    // level, by a margin that changes with the frame delta.
    const eye = this.player.eye;
    this.lighting.update(
      dt,
      eye,
      this.activeItems.flashlightBeamActive
        ? { x: eye.x, y: eye.y, facing: this.player.viewFacing }
        : null,
    );
    this.playTimeMs += delta;
    this.registry.set("playTimeMs", this.playTimeMs);
    this.tracker.mark(dt);
    // The destination surface while a climb is running, so the deck and canopy
    // crossfade as he walks rather than popping when he arrives.
    this.planeOverlay.update(
      dt,
      this.player.x,
      this.player.y,
      this.traversal.visualPlane,
      this.tileSize,
    );
  }

  /**
   * Refills the caster list from this frame's cast and redraws the ground shadows.
   *
   * Rebuilt every frame rather than cached at level build: the rooftop siege pushes new
   * guards into {@link guards} mid-level (see `onSiegeSpawn`), so a list captured once
   * would leave every reinforcement floating.
   */
  private updateEntityShadows(): void {
    const casters = this.shadowCasters;
    casters.length = 0;
    casters.push(this.player);
    // A stashed body casts no shadow, because it is not in the room. Its sprite
    // is already hidden; without this the shadow stays behind on the floor and is
    // the one thing left pointing at the locker.
    for (const guard of this.guards) if (!guard.isStashed) casters.push(guard);
    for (const orderly of this.orderlies) if (!orderly.isStashed) casters.push(orderly);
    this.entityShadows.update(casters);
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
      const attacked = e.update(dt, ctx);
      maxDetection = Math.max(maxDetection, e.detection);
      // A fresh full sighting alerts networked guards within reach.
      if (before < 1 && e.detection >= 1) {
        this.noise.broadcast(e.x, e.y, e.stats.alertNetworkRadius);
      }
      if (attacked) this.resolveGuardAttack(attacked);
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

    // Doors watch for whoever walks up, so their indicator can scan or refuse
    // before the interact prompt appears. Every door, not `nearestDoor` — that
    // is filtered to the ones he can actually open, which excludes exactly the
    // locked ones whose denial light is the most worth showing.
    const doorTileX = this.player.x / this.tileSize;
    const doorTileY = this.player.y / this.tileSize;
    // What he is carrying decides whether a keycard door reads SCAN or LOCKED.
    const doorInventory = readInventory(this.registry);
    // After the player has moved this frame, so a carried body rides on his
    // current position rather than last frame's.
    this.updateCarry();
    for (const door of this.doors) door.senseProximity(doorTileX, doorTileY, doorInventory);

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
   * Applies whatever a pursuing guard did this frame.
   *
   * The two kinds are genuinely different events rather than one event with a flag —
   * see {@link EnforcerAttackResult} — so this dispatches rather than branching inside
   * a shared body. On most runs only the melee arm is ever reached.
   */
  private resolveGuardAttack(attack: EnforcerAttackResult): void {
    if (attack.kind === "melee") {
      this.resolveGuardMelee(attack);
      return;
    }
    this.resolveGuardShot(attack);
  }

  /**
   * A guard's contact strike — the default answer, and the one nearly every alert ends in.
   *
   * **Deliberately not the shot's body with a flag set.** A strike has no flight path, so
   * there is nothing to trace it through: a hostage cannot be hit by it, destructible cover
   * cannot stop it, and there is no line to draw. Running the raycast anyway would let the
   * crate Rowan is standing behind eat a blow delivered at arm's length.
   *
   * The stagger is what makes it more than chip damage. Damage is gated behind
   * `Player.takeDamage`'s hit cooldown; the stagger is not (see `Player.stagger`), so a
   * guard who keeps connecting keeps Rowan slow even across frames where the damage is
   * suppressed — which is exactly how a silicate walks him into the capture that ends
   * the run.
   */
  private resolveGuardMelee(attack: EnforcerAttackResult): void {
    const ts = this.tileSize;
    this.player.takeDamage(attack.damage);
    this.player.stagger();
    this.cameras.main.flash(90, 200, 200, 255);
    // A scuffle, not a report — see GUARD_MELEE_NOISE_TILES for why the gap to
    // gunfire's 6 tiles is the mechanical argument for the facility preferring hands.
    this.noise.emitAt(attack.originX, attack.originY, GUARD_MELEE_NOISE_TILES * ts);
  }

  /**
   * A shot from one of the facility's few armed posts, once weapons have been released.
   *
   * Walks the line toward the player, tile step by tile step, and if it crosses a live
   * destructible cover tile first, that breaks instead of the player taking the hit —
   * the payoff for the mechanic existing at all. Otherwise the player takes the damage.
   *
   * A hostage marched into the line is the other thing that can be in the way, and
   * this is the point of marching one: he takes it. He is not cover, though, so he
   * gets his own pass rather than joining the tile walk — a man is at a pixel
   * position rather than on a tile, and he stops being a shield the moment he is hit,
   * because a stun ends the surrender and with it the hold.
   *
   * The body is unchanged from when every guard did this. What changed is how rarely
   * it runs: see `Enforcer.pursue` and `src/systems/Firearms.ts` for the two
   * independent gates that now stand in front of it.
   */
  private resolveGuardShot(shot: EnforcerAttackResult): void {
    const ts = this.tileSize;
    const dx = shot.targetX - shot.originX;
    const dy = shot.targetY - shot.originY;
    const dist = len(dx, dy) || 1;
    const stepPx = ts * 0.5;

    let hitCover: Cover | undefined;
    let hitHostage: Orderly | undefined;
    const hostage = this.holdUp.target;
    for (let d = stepPx; d < dist; d += stepPx) {
      const px = shot.originX + (dx / dist) * d;
      const py = shot.originY + (dy / dist) * d;
      if (hostage && withinOrEqual(hostage.x - px, hostage.y - py, ts * 0.5)) {
        hitHostage = hostage;
        break;
      }
      const tx = Math.floor(px / ts);
      const ty = Math.floor(py / ts);
      hitCover = this.coverTiles.find((c) => !c.isBroken && c.tileX === tx && c.tileY === ty);
      if (hitCover) break;
    }

    let endX = shot.targetX;
    let endY = shot.targetY;
    if (hitHostage) {
      // Rowan takes nothing; the man he was hiding behind goes down, which drops the
      // hold on the next frame's `aimedAt` (a stunned orderly cannot surrender).
      hitHostage.stun(STUN_ROUND_DURATION);
      endX = hitHostage.x;
      endY = hitHostage.y;
      this.cameras.main.flash(120, 255, 200, 130);
    } else if (hitCover) {
      hitCover.destroy();
      endX = (hitCover.tileX + 0.5) * ts;
      endY = (hitCover.tileY + 0.5) * ts;
    } else {
      this.player.takeDamage(shot.damage);
      this.cameras.main.flash(120, 255, 130, 130);
    }

    this.fireTracers.push({ x1: shot.originX, y1: shot.originY, x2: endX, y2: endY, ttl: 0.1 });
    this.noise.emitAt(shot.originX, shot.originY, ENFORCER_FIRE_NOISE_TILES * ts);
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
    // Both readouts are built over the guards *in play*. A stashed one is not a
    // contact the mesh has, and leaving it in would mean the alert-network count
    // never drops when the player deals with somebody — which is the feedback
    // that tells him the stash worked. Filtered here rather than inside the two
    // systems: they are headless and have no business knowing what a locker is.
    // Refilled in place rather than filtered into a new array: this runs every
    // frame, and the scratch is the same move `radarSnapshot` below already makes.
    const active = this.activeGuards;
    active.length = 0;
    for (const g of this.guards) if (!g.isStashed) active.push(g);
    this.registry.set("alertNetwork", buildAlertNetworkSnapshot(active, this.sensors, this.alert));
    this.registry.set(
      "radar",
      buildRadarSnapshot(
        this.grid,
        this.tileSize,
        this.player,
        active,
        this.sensors,
        this.alert.phase === "ALERT",
        this.noiseLog,
        this.time.now / 1000,
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
    this.items.tickCooldowns(dt);

    // --- Transitions ---
    const raw = this.transitions.at(this.level.name, Math.floor(ptx), Math.floor(pty));
    // Every *other* floor this car serves. Empty unless he is standing in a lift
    // whose shaft goes somewhere else, so it costs nothing on every other tile.
    const shaft = this.transitions.shaftAt(this.level.name, Math.floor(ptx), Math.floor(pty));
    const roofSealed = !canReachRoof(this.objectives, this.hacks.features());
    // The roof is Act IV's reward, not a shortcut past Act III: the ladder is inert
    // until both cache halves are aboard and the Alignment Core is down. Blocked here
    // rather than by withholding the tile, so the ladder is visibly *there* — the player
    // should know where they are going before they are allowed to go.
    //
    // A car with a panel is the same rule one level down: blanking the tile would
    // take the whole lift away to seal one floor, so the roof becomes a dimmed row
    // in the list instead and every other floor keeps working. Only a car with no
    // choice to offer — a two-stop lift straight to the roof — still blanks.
    const roofLocked = raw?.toLevel === ROOF_ARRAY_LEVEL && roofSealed && shaft.length < 2;
    const tr = roofLocked ? undefined : raw;
    if (!raw) this.transitionArmed = true;
    if (tr && tr.kind === "stairs" && this.transitionArmed) {
      this.beginTransition(tr);
      return;
    }
    const hatch = tr && isInteractTransition(tr.kind) && this.transitionArmed ? tr : undefined;

    // --- Plane links: the ladders and ramps between this level's two surfaces ---
    // Read before the E press is consumed below, so the prompt can offer it.
    const link = linkAt(this.planeLinks, this.traversal.plane, Math.floor(ptx), Math.floor(pty));
    if (!link) this.traversal.arm();

    // A ramp is walked up, so it fires on contact — but only when he is actually
    // heading into it. Every link head on this map is a cell you walk *through*
    // (roof_array's (23,7) sits mid-gantry), so "standing on it" would tip him
    // off the deck every time he walked that column. See `movingToward`.
    if (link && link.kind === "ramp" && this.traversal.armedForLink && !this.traversal.climbing) {
      const far = this.traversal.plane === PLANE_FLOOR ? { x: link.toX, y: link.toY } : link;
      const body = this.player.sprite.body as Phaser.Physics.Arcade.Body | null;
      const here = { x: Math.floor(ptx), y: Math.floor(pty) };
      if (body && movingToward(body.velocity.x, body.velocity.y, here.x, here.y, far.x, far.y)) {
        this.traversal.begin(link);
        return;
      }
    }
    // A ladder is climbed deliberately, so it keeps the prompt below.
    const ladder = link && link.kind === "ladder" ? link : undefined;

    // A hold-up claims Rowan's hands: he cannot work a panel, empty a chest, swing a
    // door or fire the Stapler while pointing a weapon at somebody. Masking both E
    // reads here short-circuits the entire claim chain below in one place, because
    // every step of it already `&&`-guards on the steps above — rather than adding a
    // sixth condition to each of six branches and to every future one.
    //
    // The dangerous one is the Stapler's field tap at the end of the chain: without
    // this it would fire on a tap that nothing adjacent claimed, pin the very man
    // being held up, spend one of three per-run charges and emit STAPLER_FIELD_NOISE_TILES
    // — turning the one silent verb in the game into the loudest one, by accident.
    //
    // `JustDown` is a *consuming* read, so it is evaluated unconditionally and the
    // result masked afterwards. Skipping the call would bank the press and fire it on
    // the frame after Q comes back up.
    const heldUp = this.holdUp.target !== null;
    const interactDown = this.keys.interact.isDown && !heldUp;
    const interactJust = Phaser.Input.Keyboard.JustDown(this.keys.interact) && !heldUp;

    // Read once for the frame: the encounter hold and the door loop below both want it.
    const inventory = readInventory(this.registry);

    // --- The vent-core/vault/roof encounter, whichever is live (hold E) ---
    const encounter = this.encounters.handleInteract(
      dt,
      ptx,
      pty,
      interactDown,
      interactJust,
      inventory,
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
    if (hacking && nearestTerminal!.hack(dt)) this.hacks.onComplete(nearestTerminal!);
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

    // --- Lockers (hold E) ---
    //
    // Slotted in beside the chest rather than in the tap chain below, because it
    // is the same shape of interaction: stand still, hold, and be exposed for as
    // long as it takes. A chest wins a tie at equal reach — it is a thing the
    // player walked over to on purpose, and a locker is usually just the nearest
    // wall.
    let nearestLocker: Locker | undefined;
    let nearestLockerDist = Infinity;
    for (const locker of this.lockers) {
      if (!locker.canWork(this.carried !== null)) continue;
      const d = len(locker.x / ts - ptx, locker.y / ts - pty);
      if (d <= INTERACT_RANGE && d < nearestLockerDist) {
        nearestLockerDist = d;
        nearestLocker = locker;
      }
    }
    const stashing =
      !!nearestLocker && interactDown && !hacking && !encounterHold && !searching;
    // Only a completed stash empties his hands. A retrieval puts the body on the
    // floor at the locker rather than into them — he opened a door, he did not
    // catch anybody — so picking it back up is a separate press, and the two
    // directions of the verb are not each other's inverse.
    if (stashing && nearestLocker!.work(dt, this.carried) === "stashed") {
      this.carried = null;
      getAudio().door();
      this.note("stashed");
    }
    for (const locker of this.lockers) {
      if (locker !== nearestLocker || !stashing) locker.idle(dt);
    }
    for (const chest of this.chests) {
      if (chest !== nearestChest || !interactDown || hacking || encounterHold) chest.idle(dt);
    }

    // --- Doors (tap E) ---
    let nearestDoor: Door | undefined;
    let nearestDoorDist = Infinity;
    for (const door of this.doors) {
      // `opensWith`, not `isManual`: a keycard door is one he can work if he is
      // carrying the card. The guards' own check deliberately stays on `isManual` —
      // see `guardOperableDoorAt`.
      if (!door.opensWith(inventory)) continue;
      const d = len(door.tileX + 0.5 - ptx, door.tileY + 0.5 - pty);
      if (d <= INTERACT_RANGE && d < nearestDoorDist) {
        nearestDoorDist = d;
        nearestDoor = door;
      }
    }

    // --- Breakers (tap E) ---
    let nearestBreaker: Breaker | undefined;
    let nearestBreakerDist = Infinity;
    for (const breaker of this.breakers) {
      // Mid-throw it is not a target: the sequence commits, and re-offering the
      // prompt would invite a tap that `Breaker.toggle` is only going to refuse.
      if (breaker.isThrowing) continue;
      const d = len(breaker.x / ts - ptx, breaker.y / ts - pty);
      if (d <= INTERACT_RANGE && d < nearestBreakerDist) {
        nearestBreakerDist = d;
        nearestBreaker = breaker;
      }
    }

    // --- Wall switches (tap E) ---
    let nearestSwitch: LightSwitch | undefined;
    let nearestSwitchDist = Infinity;
    for (const sw of this.lightSwitches) {
      // A plate with no power is not a target: flipping it would change nothing, and
      // offering "[E] Lights off" on a dead circuit is a promise the tap can't keep.
      // The art says the same thing — `NO_POWER` shows no indicator at all.
      if (!sw.isLive) continue;
      const d = len(sw.x / ts - ptx, sw.y / ts - pty);
      if (d <= INTERACT_RANGE && d < nearestSwitchDist) {
        nearestSwitchDist = d;
        nearestSwitch = sw;
      }
    }

    // --- Vaulting low cover (tap E) ---
    const vaultTo = this.vault.target();

    // --- Bodies (tap E) ---
    //
    // A tighter reach than everything else in this chain — see
    // `BODY_PICKUP_TILES`. A body lies on the floor among the fixtures the player
    // is usually reaching for, and at the shared 1.4-tile reach it would keep
    // winning presses meant for the terminal it fell in front of.
    //
    // Only searched for while his hands are empty: with a body already up, the
    // same tap puts it down, and there is nothing to look for.
    let bodyToLift: StashedBody | undefined;
    if (!this.carried) {
      let bestBodyDist = BODY_PICKUP_TILES;
      for (const body of this.stashables()) {
        if (!body.isCarryable) continue;
        const d = len(body.x / ts - ptx, body.y / ts - pty);
        if (d <= bestBodyDist) {
          bestBodyDist = d;
          bodyToLift = body;
        }
      }
    }

    // A tap not consumed by a hack opens/closes a door, uses a hatch, or goes
    // over the crate in front of you — whichever is nearer (a hatch you're
    // standing on always wins). The vault is last of the three because a door and
    // a hatch are both deliberate destinations, while a crate is scenery you
    // happen to be facing: it must never steal the tap from them.
    let adjacentClaimedTap = false;
    if (!hacking && !encounterHold && interactJust) {
      const hatchDist = hatch ? 0.2 : Infinity;
      // A breaker outranks a door at the same reach: it is a thing you walk to
      // deliberately, and main1 puts one on the same board as a door.
      if (nearestBreaker && nearestBreakerDist <= Math.min(nearestDoorDist, hatchDist)) {
        adjacentClaimedTap = true;
        const wasClosed = nearestBreaker.isClosed;
        this.power.throwBreaker(nearestBreaker);
        // Only cutting the lights is the beat. Putting them back is housekeeping.
        if (wasClosed) this.note("blackout");
      } else if (
        nearestSwitch &&
        nearestSwitchDist <= Math.min(nearestDoorDist, hatchDist)
      ) {
        // Ranked under the breaker for the same reason the breaker outranks a
        // door: a cabinet is the thing you crossed the deck for, and a plate is
        // on the wall you happen to be beside. They are never within reach of
        // each other on a derived level anyway.
        adjacentClaimedTap = true;
        this.power.flipSwitch(nearestSwitch);
      } else if (nearestDoor && nearestDoorDist <= hatchDist) {
        adjacentClaimedTap = true;
        if (nearestDoor.toggle()) {
          getAudio().door();
          if (nearestDoor.isOpen) this.noise.doorOperated(nearestDoor);
        }
      } else if (hatch) {
        // A lift with more than one other stop asks which floor; anything else —
        // a hatch, a ladder, a two-stop lift — is one press and one destination.
        if (shaft.length >= 2) {
          this.openElevatorPanel(shaft, roofSealed);
        } else {
          this.beginTransition(hatch);
        }
        return;
      } else if (ladder && this.traversal.armedForLink) {
        // A way between this level's own surfaces. Unlike a level transition it
        // is not a scene restart — nothing is rebuilt, he just walks up onto the
        // other surface where the link comes out.
        this.traversal.begin(ladder);
        return;
      } else if (bodyToLift || this.carried) {
        // Picking up and putting down are the same tap, because they are the same
        // decision seen from either side and there is never a frame where both
        // are available: `bodyToLift` is only searched for while his hands are
        // empty. Above the vault for the same reason a door is — a body is a
        // thing you walked over to, and the crate you happen to be facing must
        // never steal the press from it.
        adjacentClaimedTap = true;
        if (this.carried) {
          this.carried = null;
        } else {
          this.carried = bodyToLift!;
          this.caughtLifting = true;
        }
      } else if (vaultTo) {
        adjacentClaimedTap = true;
        this.vault.begin(vaultTo);
        // Hurdling the furniture is not what staff do — charged to the same
        // continuous breach a sprint is, in `updateWorld`.
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
      this.items.staplerFieldReady &&
      readInventory(this.registry).includes(STAPLER_ITEM)
    ) {
      this.items.fireStaplerField();
    }

    // A weapon on somebody outranks every verb in the chain above, because it is the
    // only thing E cannot currently do.
    if (heldUp) {
      this.prompts.set("[Q] HOLDING", this.player);
      return;
    }

    this.prompts.show(
      {
        terminal: nearestTerminal,
        terminalDist: nearestTerminalDist,
        door: nearestDoor,
        doorDist: nearestDoorDist,
        breaker: nearestBreaker,
        breakerDist: nearestBreakerDist,
        lightSwitch: nearestSwitch,
        lightSwitchDist: nearestSwitchDist,
        chest: nearestChest,
        chestDist: nearestChestDist,
        locker: nearestLocker ? { occupied: nearestLocker.isOccupied } : undefined,
        lockerDist: nearestLockerDist,
        body: bodyToLift !== undefined,
        bodyDist: bodyToLift ? len(bodyToLift.x / ts - ptx, bodyToLift.y / ts - pty) : Infinity,
        carrying: this.carried !== null,
        hatch: hatch !== undefined || (ladder !== undefined && this.traversal.armedForLink),
        elevator: hatch !== undefined && shaft.length >= 2,
        vault: vaultTo !== null,
        ventLabel: encounter.label,
        ventDist: encounter.dist,
        // Standing on a ladder that won't take you anywhere yet needs to say so, or it
        // reads as a bug rather than a lock.
        lockedLabel: roofLocked ? "[ROOF SEALED — ALIGNMENT CORE STILL ACTIVE]" : undefined,
      },
      this.player,
    );
    // Advertise the verb, but only into a slot nothing nearer wanted: a door in your
    // face outranks a hint about somebody across the room.
    //
    // Which of `[Q]`'s two halves is offered follows the same rule the key does — armed
    // holds a man up, empty-handed takes him down — so the prompt is never advertising
    // the wrong one. The takedown's reach is a third of the hold-up's, so an unarmed
    // Rowan sees it only once he has actually walked in.
    if (!this.prompts.visible) {
      if (this.holdUpCandidate) this.prompts.set("[Q] Hold up", this.player);
      else if (this.takedownCandidate) this.prompts.set("[Q] Take down", this.player);
    }
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
      : { startLevel: "", extractionLevel: "", vaultHost: "", ventCoreHost: null };
  }

  /**
   * Warp targets for the debug number keys: the map's own levels in authored order, with
   * the generated vent core last so it stays on the highest key. Derived rather than
   * hardcoded so the warps work on any map.
   */
  private debugWarpLevels(): string[] {
    // Authored decks first, in map order, then the generated ones — so the warp keys
    // follow the run's shape and a new generated level lands on the end rather than
    // shuffling every key the player has already learned.
    //
    // Split on the flag the generator sets, not the name: a map that authored its own
    // `vent_core` wrote a deck of its own, and it belongs in its own running order.
    const authored = this.map.levels.filter((l) => !l.generated).map((l) => l.name);
    const generated = this.map.levels.filter((l) => l.generated).map((l) => l.name);
    return [...authored, ...generated].slice(0, WARP_SLOTS);
  }

  /**
   * Every derived zone on this level, mapped to the wing above it.
   *
   * The reverse of `GameLevel.circuits`, which `PowerControl` needs because whether
   * a zone has power depends on its wing and a zone cannot find that out from its
   * own name. Rebuilt when the level does — it is a dozen entries on a derived deck
   * and empty on a map that never asked for derived lighting.
   */
  private zoneWings(): ReadonlyMap<string, string> {
    if (this.zoneWingsFor === this.level) return this.zoneWingsCache;
    const map = new Map<string, string>();
    for (const [wing, zones] of Object.entries(this.level.circuits ?? {})) {
      for (const zone of zones) map.set(zone, wing);
    }
    this.zoneWingsFor = this.level;
    this.zoneWingsCache = map;
    return map;
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
      level: this.level,
      levelName: this.level.name,
      captureProgress: this.captureProgress,
      inventory: readInventory(this.registry),
    };
  }

  /**
   * The door covering a tile, if it's one a guard may work itself.
   *
   * Locked doors are excluded — a keycard door is a chokepoint for the guards
   * too, and a terminal hack is the only thing that releases it.
   *
   * **Deliberately `isManual` rather than `opensWith`.** The player's chain moved to
   * the latter when keycards arrived; this one must not follow it, or every guard on
   * the level would open keycard doors on the strength of what *Rowan* is carrying.
   */
  private guardOperableDoorAt(tileX: number, tileY: number): Door | null {
    return this.doors.find((d) => d.isManual && d.covers(tileX, tileY)) ?? null;
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
    const inv = readInventory(this.registry);
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
      // Key items (keycards, EIRA-7 log) and equipment: always stored, uncapped.
      if (isKeycard(item)) this.note("keys");
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
    const inv = readInventory(this.registry);
    if (isConsumable(name) && countConsumables(inv) >= MAX_CONSUMABLES) return;
    inv.push(name);
    this.registry.set("inventory", inv);
  }

  /**
   * Debug cheat: applies the compliance puzzle's wrong-transmit consequence to
   * whichever terminal on this level is nearest the player, without opening or
   * playing the minigame. Unlike the real `[E] Hack` scan, this doesn't skip
   * already-hacked terminals or cap the range — a tester wants to be able to
   * target ALPHA or BETA specifically by standing near it, hacked or not.
   */
  private debugForceFailNearestTerminal(): void {
    const ts = this.tileSize;
    const ptx = this.player.x / ts;
    const pty = this.player.y / ts;
    let nearest: Terminal | undefined;
    let nearestDist = Infinity;
    for (const term of this.terminals) {
      const d = len(term.x / ts - ptx, term.y / ts - pty);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = term;
      }
    }
    if (nearest) this.hacks.debugForceFail(nearest);
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
    this.prompts.clear();
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
