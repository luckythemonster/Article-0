import Phaser from "phaser";
import type { Enforcer } from "../../entities/Enforcer";
import type { Player } from "../../entities/Player";
import type { Sensor } from "../../entities/Sensor";
import type { AlertState } from "../../systems/AlertState";
import type { CollisionGrid } from "../../systems/CollisionGrid";
import type { ConductState } from "../../systems/Conduct";
import type { DetectionSystem } from "../../systems/DetectionSystem";
import { colliderRect, hasPlainCollider } from "../../map/footprint";
import { blockingLayerNames, type GameLevel } from "../../map/types";
import { CERT_ITEM, PLAYER_DEFAULTS } from "../../systems/EntityStats";
import { catalogedNames } from "../../systems/ItemCatalog";
import type { DebugSnapshot } from "../../ui/DebugHud";
import type { Lighting } from "../../ui/Lighting";
import type { EntityShadows } from "../../ui/EntityShadows";

/**
 * The developer debug mode: hotkeys, cheats, the world-space overlay, and the
 * snapshot the debug panel reads.
 *
 * All of it is dev-only — reachable when `DEBUG_ALLOWED` is set, which means a
 * dev build or an explicit `?debug` opt-in. It lived at the bottom of
 * `GameScene` behind a banner comment claiming everything below was debug,
 * which had stopped being true: the knock and noise handling had grown in
 * underneath it and runs in ordinary play. Pulling the debug tools into their
 * own file makes the boundary real instead of asserted.
 *
 * The cheat flags live here too, so the scene asks `debug.frozenWorld` rather
 * than carrying six booleans it mostly ignores.
 */

/**
 * How many number keys are wired for level warps.
 *
 * One per level the shipped map ends up with: four authored decks plus the two the
 * engine generates (`vent_core`, `roof_array`). The key list below is sliced to this,
 * so the two can't drift apart and quietly leave a level unreachable.
 */
const WARP_SLOTS = 6;

/** What the overlay needs from the scene, supplied fresh each frame. */
export interface DebugWorld {
  grid: CollisionGrid;
  detection: DetectionSystem;
  conduct: ConductState;
  alert: AlertState;
  player: Player;
  guards: readonly Enforcer[];
  sensors: readonly Sensor[];
  tileSize: number;
  /** The level itself, so the overlay can draw authored collider bounds. */
  level: GameLevel;
  levelName: string;
  captureProgress: number;
  /** Current inventory, for the certified readout. */
  inventory: readonly string[];
}

/**
 * The scene-level effects the cheats reach for.
 *
 * The colliders are functions rather than references because no-clip toggles
 * them long after this is constructed, and a captured reference would go stale
 * the moment the scene rebuilt one.
 */
export interface DebugHost {
  lighting: Lighting;
  entityShadows: EntityShadows;
  wallCollider: () => Phaser.Physics.Arcade.Collider | undefined;
  doorCollider: () => Phaser.Physics.Arcade.Collider | undefined;
  /** The cover bodies a crouch already switches off — no-clip has to as well. */
  coverCollider: () => Phaser.Physics.Arcade.Collider | undefined;
  /** Level names the warp keys map to, in key order. */
  warpTargets: () => string[];
  /** Restart the scene on another level. */
  warpTo: (levelName: string) => void;
  /** Grants one unit of an item, for testing weapons/items without playing to their chest. */
  giveItem: (name: string) => void;
}

/**
 * Registry key for the master toggle.
 *
 * A level transition is a `scene.restart()`, which builds a fresh overlay — so
 * the cheats reset to a clean state, which is what you want. The master switch
 * must *not*: warping is itself a debug action, and turning the panel off
 * underneath the player mid-warp would also disarm the warp keys, leaving the
 * next number key inert. The registry is how everything else survives a restart
 * here, so it is how this does too.
 */
const DEBUG_ENABLED_KEY = "debugEnabled";

export class DebugOverlay {
  /** Master switch: the debug panel is shown and the debug hotkeys respond. */
  enabled: boolean;
  /** Invincibility — blocks both death paths (HP depletion and capture). */
  godMode = false;
  /** No-clip — the player's wall/door colliders are disabled. */
  noClip = false;
  /** World-space debug draw: LOS rays, blocked tiles, detection tint. */
  worldDraw = false;
  /** Freeze-world: halts guards, cameras, hazards, alert and capture. */
  frozenWorld = false;
  /** Darkness off — the lighting overlay is hidden so the level reads. */
  darknessOff = false;

  /** Every item name the engine can grant, for the give-item cheat to cycle through. */
  private readonly itemNames = catalogedNames();
  /** Index into {@link itemNames} of the item [I] currently grants. */
  private selectedItemIndex = 0;

  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly keys: {
    toggle: Phaser.Input.Keyboard.Key;
    god: Phaser.Input.Keyboard.Key;
    noClip: Phaser.Input.Keyboard.Key;
    world: Phaser.Input.Keyboard.Key;
    freeze: Phaser.Input.Keyboard.Key;
    darkness: Phaser.Input.Keyboard.Key;
    warp: Phaser.Input.Keyboard.Key[];
    prevItem: Phaser.Input.Keyboard.Key;
    nextItem: Phaser.Input.Keyboard.Key;
    give: Phaser.Input.Keyboard.Key;
  };

  /**
   * Construct only when `DEBUG_ALLOWED` — it binds keys and adds a Graphics
   * layer, neither of which a shipped build should pay for.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly host: DebugHost,
  ) {
    // Survives the scene.restart() a warp performs — see DEBUG_ENABLED_KEY.
    this.enabled = scene.registry.get(DEBUG_ENABLED_KEY) === true;

    // Below the depth-1000 HUD and world prompts, above everything in the world.
    this.gfx = scene.add.graphics().setDepth(900);

    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      toggle: kb.addKey(K.BACKTICK),
      god: kb.addKey(K.G),
      noClip: kb.addKey(K.N),
      world: kb.addKey(K.V),
      freeze: kb.addKey(K.H),
      darkness: kb.addKey(K.O),
      warp: [K.ONE, K.TWO, K.THREE, K.FOUR, K.FIVE, K.SIX]
        .slice(0, WARP_SLOTS)
        .map((c) => kb.addKey(c)),
      prevItem: kb.addKey(K.OPEN_BRACKET),
      nextItem: kb.addKey(K.CLOSED_BRACKET),
      give: kb.addKey(K.I),
    };
  }

  /** The item name [I] currently grants. */
  get selectedItem(): string {
    return this.itemNames[this.selectedItemIndex];
  }

  /**
   * Reads the debug hotkeys for the frame and applies them. Returns `true` if a
   * warp was triggered (the scene is restarting, so the caller should bail).
   */
  handleInput(player: Player): boolean {
    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.toggle)) this.setEnabled(!this.enabled, player);
    if (!this.enabled) return false;
    if (Phaser.Input.Keyboard.JustDown(k.god)) this.godMode = !this.godMode;
    if (Phaser.Input.Keyboard.JustDown(k.noClip)) this.setNoClip(!this.noClip, player);
    if (Phaser.Input.Keyboard.JustDown(k.world)) this.worldDraw = !this.worldDraw;
    if (Phaser.Input.Keyboard.JustDown(k.freeze)) this.frozenWorld = !this.frozenWorld;
    if (Phaser.Input.Keyboard.JustDown(k.darkness)) this.setDarknessOff(!this.darknessOff);
    if (Phaser.Input.Keyboard.JustDown(k.prevItem)) this.stepSelectedItem(-1);
    if (Phaser.Input.Keyboard.JustDown(k.nextItem)) this.stepSelectedItem(1);
    if (Phaser.Input.Keyboard.JustDown(k.give)) this.host.giveItem(this.selectedItem);

    const warps = this.host.warpTargets();
    for (let i = 0; i < k.warp.length && i < warps.length; i++) {
      if (Phaser.Input.Keyboard.JustDown(k.warp[i])) {
        this.host.warpTo(warps[i]);
        return true;
      }
    }
    return false;
  }

  /** Master switch. Disabling clears every cheat for a clean return to play. */
  setEnabled(on: boolean, player: Player): void {
    this.enabled = on;
    this.scene.registry.set(DEBUG_ENABLED_KEY, on);
    if (on) return;
    this.godMode = false;
    this.worldDraw = false;
    this.frozenWorld = false;
    this.setNoClip(false, player);
    this.setDarknessOff(false);
    this.gfx.clear();
  }

  /** Hides/restores the darkness + line-of-sight overlay so the level can be read. */
  setDarknessOff(off: boolean): void {
    this.darknessOff = off;
    this.host.lighting.setEnabled(!off);
    // The ground shadows go with it. They are thrown by the same fixtures, so leaving
    // them on would light the level flat while every character still carried a shadow
    // pointing at a lamp the mode has just stopped drawing.
    this.host.entityShadows.setEnabled(!off);
  }

  /** Moves the give-item selection by one, wrapping at either end. */
  private stepSelectedItem(delta: number): void {
    const n = this.itemNames.length;
    this.selectedItemIndex = (this.selectedItemIndex + delta + n) % n;
  }

  /** Toggles no-clip by enabling/disabling the player's wall+door+cover colliders. */
  setNoClip(on: boolean, player: Player): void {
    this.noClip = on;
    const wall = this.host.wallCollider();
    const door = this.host.doorCollider();
    const cover = this.host.coverCollider();
    if (wall) wall.active = !on;
    if (door) door.active = !on;
    // Left to the scene's own crouch rule the rest of the time, which re-asserts
    // it every frame — so this only has to not fight it while no-clip is on.
    if (cover) cover.active = !on;
    const body = player.sprite.body as Phaser.Physics.Arcade.Body;
    body.checkCollision.none = on;
    player.sprite.setCollideWorldBounds(!on);
  }

  /** Draws the world-space overlay: blocked tiles, detection tint, LOS, navigation. */
  draw(w: DebugWorld): void {
    const g = this.gfx;
    g.clear();
    if (!this.enabled || !this.worldDraw) return;

    const ts = w.tileSize;
    const view = this.scene.cameras.main.worldView;
    const minTx = Math.max(0, Math.floor(view.x / ts));
    const maxTx = Math.min(w.grid.width - 1, Math.ceil(view.right / ts));
    const minTy = Math.max(0, Math.floor(view.y / ts));
    const maxTy = Math.min(w.grid.height - 1, Math.ceil(view.bottom / ts));

    // Blocked tiles (red) and detection-multiplier hot spots (amber) in view.
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (w.grid.isBlocked(tx, ty)) {
          g.fillStyle(0xff3b3b, 0.12);
          g.fillRect(tx * ts, ty * ts, ts, ts);
          continue;
        }
        const m = w.detection.multiplierAt((tx + 0.5) * ts, (ty + 0.5) * ts);
        if (m > 1.05) {
          g.fillStyle(0xffb03b, Math.min(0.25, (m - 1) * 0.3));
          g.fillRect(tx * ts, ty * ts, ts, ts);
        }
      }
    }

    // Authored collider bounds (cyan outline). The red fills above are the coarse
    // grid, which is still whole-cell — where a tile declares its own bounds these
    // two deliberately disagree, and drawing only the fills would quietly claim the
    // player collides with a whole cell they can in fact walk into.
    const blocking = blockingLayerNames(w.level);
    g.lineStyle(1, 0x39d3ff, 0.7);
    for (const layer of w.level.layers) {
      if (!blocking.includes(layer.name)) continue;
      for (const tile of layer.tiles) {
        if (!tile.frame || hasPlainCollider(tile)) continue;
        if (tile.x < minTx - 2 || tile.x > maxTx + 2 || tile.y < minTy - 2 || tile.y > maxTy + 2) {
          continue;
        }
        const r = colliderRect(tile, ts);
        g.strokeRect(r.x, r.y, r.w, r.h);
      }
    }

    // Line of sight from the player to each guard (green = clear, red = blocked).
    const ptx = w.player.x / ts;
    const pty = w.player.y / ts;
    for (const e of w.guards) {
      const clear = w.grid.hasLineOfSight(ptx, pty, e.x / ts, e.y / ts);
      g.lineStyle(1, clear ? 0x59d98e : 0xff3b3b, 0.6);
      g.lineBetween(w.player.x, w.player.y, e.x, e.y);
    }

    this.drawGuardNavigation(g, w.guards, ts);
  }

  /**
   * Patrol routes, live A* paths and collision circles for every guard.
   *
   * This is the readout for the three things that are otherwise invisible and
   * hard to trust: that a guard board really did resolve to one ordered loop,
   * that the planner routes around geometry rather than through it, and that
   * the body a guard collides with matches the sprite drawn over it.
   */
  private drawGuardNavigation(
    g: Phaser.GameObjects.Graphics,
    guards: readonly Enforcer[],
    ts: number,
  ): void {
    const centre = (p: { x: number; y: number }): { x: number; y: number } => ({
      x: (p.x + 0.5) * ts,
      y: (p.y + 0.5) * ts,
    });

    for (const e of guards) {
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
  snapshot(w: DebugWorld): DebugSnapshot {
    const ts = w.tileSize;
    return {
      enabled: this.enabled,
      godMode: this.godMode,
      noClip: this.noClip,
      worldDraw: this.worldDraw,
      frozenWorld: this.frozenWorld,
      darknessOff: this.darknessOff,
      compliant: w.conduct.compliant,
      breach: w.conduct.breach,
      flaggedRemaining: w.conduct.flaggedRemaining,
      certified: w.inventory.includes(CERT_ITEM),
      selectedItem: this.selectedItem,
      selectedHeld: w.inventory.filter((n) => n === this.selectedItem).length,
      fps: this.scene.game.loop.actualFps,
      px: w.player.x,
      py: w.player.y,
      tileX: Math.floor(w.player.x / ts),
      tileY: Math.floor(w.player.y / ts),
      facing: w.player.facing,
      hp: w.player.hp,
      maxHp: w.player.maxHp,
      capture: w.captureProgress,
      captureTime: PLAYER_DEFAULTS.captureTime,
      level: w.levelName,
      alertPhase: w.alert.phase,
      units: [
        ...w.guards.map((e, i) => ({ label: `G${i}`, detection: e.detection })),
        ...w.sensors.map((s, i) => ({ label: `S${i}`, detection: s.detection })),
      ],
    };
  }
}
