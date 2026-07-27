import Phaser from "phaser";
import type { GameLevel, GameTile } from "../map/types";
import type { CollisionGrid } from "../systems/CollisionGrid";
import { RELAY_DEFAULTS, type RelayStats } from "../systems/EntityStats";
import {
  RelayCore,
  RelayState,
  type RelaySnapshot,
  type RelayTransition,
  type RelayView,
} from "../systems/RelayCore";
import {
  DISH_CENTER_TILE,
  ROOF_CATWALKS,
  ROOF_SEARCHLIGHTS,
} from "../map/RoofArrayLevel";
import { drawVisionCone, type ConeStyle } from "../ui/VisionCone";
import { HoldTarget, HOLD_BAR_CYAN } from "./HoldTarget";
import type { EnforcerContext } from "./Enforcer";

/**
 * The rooftop relay — Act IV's Phaser shell around {@link RelayCore}.
 *
 * Structurally a boss (pure core + shell + HUD, same as VENT-4 and NW-SMAC-01) but it
 * is not one: there is nothing to defeat. The dish has to be aimed, the feed has to be
 * opened, and then Rowan has to still be standing when it finishes. The searchlights and
 * the Enforcer waves are pressure on a clock, not a health bar.
 *
 * ### The searchlights are hazards, not cameras
 *
 * They could have been `security`-board `Sensor`s and got the sweeping-cone behaviour
 * for free. They aren't, and the reason is `Sensing.canSense`, which clears the player
 * outright the moment they read as compliant staff — at any range, before any geometry.
 * That is correct for a guard reading conduct and wrong for a searchlight, which is a
 * lamp. A compliant Rowan strolling untouched through a spotlight would gut the phase
 * the calibration walk is built on, so these run their own cone test, exactly as VENT-4's
 * sweeps do.
 *
 * Concealment still counts — cover, and the Shared Field the dish itself charges.
 */

const SEARCHLIGHT_CONE: ConeStyle = {
  color: 0xfff0b0,
  alpha: 0.16,
  hotColor: 0xff3b3b,
  hotAlpha: 0.3,
};

/** How fast a searchlight meter drains once the beam is off you. */
const LIGHT_DECAY = 0.8;

/** Seconds of enforced pause after a beam confirms, so one crossing costs once. */
const LIGHT_LOCKOUT = 1.4;

export interface RelayTickResult {
  transition: RelayTransition | null;
  /** True on the frame a searchlight confirms — the scene charges the damage. */
  searchlightHit: boolean;
  /**
   * Catwalk mouths a wave should land at this frame, or null on the overwhelming
   * majority of frames where none is due. Null rather than an empty array so the common
   * path allocates nothing.
   */
  spawnAt: { x: number; y: number }[] | null;
}

export interface RelayInteractResult {
  label?: string;
  dist: number;
  consumedHold: boolean;
  transition: RelayTransition | null;
}

/** A hold-to-activate roof fixture: the two pedestals and the feed terminal. */
class RoofFixture {
  readonly x: number;
  readonly y: number;
  private done = false;
  private readonly hold: HoldTarget;

  constructor(
    scene: Phaser.Scene,
    tile: GameTile,
    tileSize: number,
    readonly index: number,
    holdTime: number,
  ) {
    this.hold = new HoldTarget(scene, tile, tileSize, holdTime, HOLD_BAR_CYAN);
    this.x = this.hold.x;
    this.y = this.hold.y;
  }

  get isDone(): boolean {
    return this.done;
  }

  advance(dt: number): boolean {
    if (this.done) return false;
    if (!this.hold.advance(dt)) return false;
    this.finish();
    return true;
  }

  idle(dt: number): void {
    if (!this.done) this.hold.decay(dt);
  }

  /** Restores a completed state on level re-entry — no bar, no completion event. */
  restoreDone(): void {
    if (!this.done) this.finish();
  }

  private finish(): void {
    this.done = true;
    this.hold.settle(0x5effa0);
  }
}

export class RoofRelay {
  private readonly core: RelayCore;
  private readonly pedestals: RoofFixture[] = [];
  private readonly feed?: RoofFixture;

  /** Pixel centre of the dish — the Shared Field witness anchor up here. */
  readonly dish: { x: number; y: number };

  /** 0..1, highest of the searchlights — feeds the scene's detection readout. */
  detection = 0;

  private sweep = 0;
  private lockout = 0;
  private readonly lights: { x: number; y: number; gfx: Phaser.GameObjects.Graphics }[] = [];
  private readonly dishGfx: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    level: GameLevel,
    private readonly tileSize: number,
    private readonly grid: CollisionGrid,
    restore?: RelaySnapshot,
    private readonly stats: RelayStats = RELAY_DEFAULTS,
  ) {
    this.core = new RelayCore(stats, restore);

    const board = (name: string): GameTile[] =>
      level.layers.find((l) => l.name === name)?.tiles ?? [];
    const px = (t: { x: number; y: number }): { x: number; y: number } => ({
      x: (t.x + 0.5) * tileSize,
      y: (t.y + 0.5) * tileSize,
    });

    board("relay_pedestals").forEach((tile, i) => {
      const fixture = new RoofFixture(scene, tile, tileSize, i, stats.pedestalTime);
      if (this.core.pedestalsSet[i]) fixture.restoreDone();
      this.pedestals.push(fixture);
    });
    const feedTile = board("relay_feed")[0];
    if (feedTile) {
      this.feed = new RoofFixture(scene, feedTile, tileSize, 0, stats.pedestalTime);
      if (this.core.state !== RelayState.CALIBRATE && this.core.state !== RelayState.ARMED) {
        this.feed.restoreDone();
      }
    }

    this.dish = px(DISH_CENTER_TILE);
    for (const mount of ROOF_SEARCHLIGHTS.slice(0, stats.searchlightCount)) {
      this.lights.push({ ...px(mount), gfx: scene.add.graphics().setDepth(400) });
    }
    this.dishGfx = scene.add.graphics().setDepth(456).setBlendMode(Phaser.BlendModes.ADD);
  }

  get state(): RelayState {
    return this.core.state;
  }

  /** True once the discharge has fired: input locked, searchlights dead. */
  get isCaptured(): boolean {
    return this.core.isCaptured;
  }

  /** True once the capture sequence has played out and the tribunal should take over. */
  get isSeized(): boolean {
    return this.core.state === RelayState.SEIZED;
  }

  get progress(): number {
    return this.core.progress;
  }

  snapshot(): RelaySnapshot {
    return this.core.snapshot();
  }

  hudView(): RelayView {
    return this.core.view();
  }

  update(dt: number, ctx: EnforcerContext): RelayTickResult {
    const res: RelayTickResult = {
      transition: this.core.update(dt),
      searchlightHit: false,
      spawnAt: null,
    };

    // Waves land at the catwalks in rotation, so the roof is pressured from a different
    // corner each time rather than becoming a one-sided firing line.
    while (this.core.takeWave()) {
      const at: { x: number; y: number }[] = [];
      for (let i = 0; i < this.stats.waveSize; i++) {
        at.push(ROOF_CATWALKS[(this.waveIndex + i) % ROOF_CATWALKS.length]);
      }
      this.waveIndex += this.stats.waveSize;
      res.spawnAt = [...(res.spawnAt ?? []), ...at];
    }

    if (this.core.isCaptured) {
      // The discharge killed the lamps. Nothing sweeps, nothing accrues.
      for (const l of this.lights) l.gfx.clear();
      this.detection = 0;
      this.drawDish();
      return res;
    }

    this.sweep += dt * this.stats.searchlightSpeed;
    this.lockout = Math.max(0, this.lockout - dt);
    this.updateSearchlights(dt, ctx, res);
    this.drawSearchlights();
    this.drawDish();
    return res;
  }

  private waveIndex = 0;

  /**
   * Pedestals while calibrating, the feed once armed.
   *
   * Returns a label and a distance for `GameScene`'s nearest-wins prompt arbitration and
   * claims the held key only when it is actually using it, so a roof fixture and a
   * terminal can't consume the same hold.
   */
  handleInteract(
    dt: number,
    ptx: number,
    pty: number,
    interactDown: boolean,
  ): RelayInteractResult {
    const res: RelayInteractResult = { dist: Infinity, consumedHold: false, transition: null };
    const px = ptx * this.tileSize;
    const py = pty * this.tileSize;

    const idleAll = (except?: RoofFixture): void => {
      for (const p of this.pedestals) if (p !== except) p.idle(dt);
      if (this.feed && this.feed !== except) this.feed.idle(dt);
    };

    // Only one verb is live at a time, which keeps the roof's two phases legible.
    const live: RoofFixture[] =
      this.core.state === RelayState.CALIBRATE
        ? this.pedestals.filter((p) => !p.isDone)
        : this.core.isArmed && this.feed
          ? [this.feed]
          : [];

    let nearest: RoofFixture | undefined;
    let nearestDist = Infinity;
    for (const f of live) {
      const tiles = Phaser.Math.Distance.Between(px, py, f.x, f.y) / this.tileSize;
      if (tiles < nearestDist) {
        nearestDist = tiles;
        nearest = f;
      }
    }
    if (!nearest || nearestDist > 1.4) {
      idleAll();
      return res;
    }

    res.dist = nearestDist;
    const calibrating = this.core.state === RelayState.CALIBRATE;
    res.label = calibrating
      ? `[E] Set ${nearest.index === 0 ? "azimuth" : "elevation"} pedestal`
      : "[E] Jack EIRA-7 into the primary feed";
    if (interactDown) {
      res.consumedHold = true;
      if (nearest.advance(dt)) {
        res.transition = calibrating
          ? this.core.notePedestalSet(nearest.index)
          : this.core.noteFeedJacked();
      }
    }
    idleAll(interactDown ? nearest : undefined);
    return res;
  }

  /** The lamps' own sight — see the class comment for why it isn't `canSense`. */
  private updateSearchlights(dt: number, ctx: EnforcerContext, res: RelayTickResult): void {
    const px = ctx.player.x;
    const py = ctx.player.y;
    const rangePx = this.stats.searchlightRange * this.tileSize;
    const half = (this.stats.searchlightAngle * Math.PI) / 360;

    let lit = false;
    if (!ctx.playerConcealed && this.lockout <= 0) {
      for (let i = 0; i < this.lights.length && !lit; i++) {
        const l = this.lights[i];
        const dx = px - l.x;
        const dy = py - l.y;
        if (dx * dx + dy * dy > rangePx * rangePx) continue;
        if (Math.abs(Phaser.Math.Angle.Wrap(this.lightFacing(i) - Math.atan2(dy, dx))) > half) {
          continue;
        }
        lit = this.grid.hasLineOfSight(
          l.x / this.tileSize,
          l.y / this.tileSize,
          px / this.tileSize,
          py / this.tileSize,
        );
      }
    }

    if (!lit) {
      this.detection = Math.max(0, this.detection - dt * LIGHT_DECAY);
      return;
    }
    this.detection = Math.min(1, this.detection + dt / this.stats.searchlightDetectTime);
    if (this.detection < 1) return;

    this.detection = 0;
    this.lockout = LIGHT_LOCKOUT;
    res.searchlightHit = true;
    ctx.alert.reportSighting(Math.floor(px / this.tileSize), Math.floor(py / this.tileSize));
  }

  /** Staggered so the three lamps never sweep as one wall with no gap to cross. */
  private lightFacing(i: number): number {
    return this.sweep + (i * Math.PI * 2) / Math.max(1, this.lights.length);
  }

  private drawSearchlights(): void {
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      drawVisionCone(
        l.gfx,
        this.grid,
        l.x,
        l.y,
        this.lightFacing(i),
        this.stats.searchlightAngle,
        this.stats.searchlightRange,
        this.tileSize,
        this.detection,
        SEARCHLIGHT_CONE,
        16,
      );
    }
  }

  /** The dish's silicate pulse field: brighter and faster as the uplink runs. */
  private drawDish(): void {
    const g = this.dishGfx;
    g.clear();
    if (this.core.state === RelayState.CALIBRATE) {
      g.fillStyle(0x39d3ff, 0.1);
      g.fillCircle(this.dish.x, this.dish.y, this.tileSize * 1.4);
      return;
    }
    const p = this.core.progress;
    const pulse = 0.5 + 0.5 * Math.sin(this.sweep * (3 + p * 6));
    const color = this.core.isCaptured ? 0xff3b3b : 0x8effc0;
    g.fillStyle(color, 0.14 + 0.2 * pulse * (0.4 + p));
    g.fillCircle(this.dish.x, this.dish.y, this.tileSize * (1.5 + 1.2 * p * pulse));
    g.fillStyle(color, 0.45);
    g.fillCircle(this.dish.x, this.dish.y, this.tileSize * 0.6);
  }
}
