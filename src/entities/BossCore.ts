import Phaser from "phaser";
import type { GameLevel, GameTile } from "../map/types";
import type { CollisionGrid } from "../systems/CollisionGrid";
import { SMAC_DEFAULTS, type SmacStats } from "../systems/EntityStats";
import {
  SmacCore,
  SmacState,
  type SmacSnapshot,
  type SmacTransition,
  type SmacView,
} from "../systems/SmacCore";
import { rayDistance } from "../systems/Visibility";
import { accrueDetection, canSense, type Eye } from "../systems/Sensing";
import { HoldFixture, nearestFixture } from "./HoldFixture";
import type { EnforcerContext } from "./Enforcer";

/**
 * NW-SMAC-01 — the Alignment Core. The Phaser shell around {@link SmacCore}.
 *
 * Same three-layer arrangement as VENT-4 (`Vent4Core` / `Vent4Boss` / `Vent4Hud`): the
 * rules are pure and unit-tested next door, this draws them and turns proximity and a
 * held key into calls on them, and `BossCoreHud` renders the readout. Nothing here
 * decides anything about the fight.
 *
 * Like `Vent4Boss` it has no `destroy()`: every graphics object it makes is on the
 * display list, so `scene.restart()` — which is how the game changes level — reclaims
 * them, and `GameScene` just drops its reference.
 *
 * ### It deliberately ignores compliance
 *
 * `Sensing.canSense` short-circuits the moment the player reads as compliant staff, at
 * any range. That is the right rule for a guard reading conduct off the mesh, and exactly
 * the wrong one here: NW-SMAC-01 *is* the mesh, so the forced-compliant posture it holds
 * Rowan in buys him nothing against the thing imposing it.
 *
 * That exemption is declared as `readsConduct: false` on its {@link Eye} rather than by
 * hand-rolling a private cone test — which is what this used to do, and how it ended up
 * with its own decay constant and no light sensitivity. Concealment still works, crouched
 * in cover or merged into the Shared Field, which is what makes the silicate racks around
 * the room the answer to the beams.
 */

/** Reach (tiles) at which a node's verb is offered — matches GameScene's INTERACT_RANGE. */
const INTERACT_TILES = 1.4;

/** Beams sweeping out of the core, evenly spaced around it. */
const AUDIT_BEAMS = 3;

/** Seconds of enforced pause after a beam confirms, so one crossing costs once. */
const AUDIT_LOCKOUT = 1.6;

const BEAM_COLOR = 0xff5bbd;
const BEAM_HOT = 0xff2b2b;

export interface SmacTickResult {
  transition: SmacTransition | null;
  /** True on the frame an auditing beam confirms — the scene charges the damage. */
  auditHit: boolean;
}

export interface SmacInteractResult {
  label?: string;
  dist: number;
  consumedHold: boolean;
  transition: SmacTransition | null;
}

export class BossCore {
  private readonly core: SmacCore;
  private readonly nodes: HoldFixture[] = [];
  /** Silicate racks — Shared Field witness anchors, in pixel space. */
  readonly racks: { x: number; y: number }[] = [];

  /** Pixel centre of the core itself. */
  readonly x: number;
  readonly y: number;

  /** 0..1, highest of the audit beams — feeds the scene's detection readout. */
  detection = 0;

  private sweep = Phaser.Math.FloatBetween(0, Math.PI * 2);
  private lockout = 0;
  /** Reused across beams and frames — {@link canSense} only reads it. */
  private readonly eye: Eye;

  private readonly beamGfx: Phaser.GameObjects.Graphics;
  private readonly coreGfx: Phaser.GameObjects.Graphics;
  private readonly markerGfx: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    level: GameLevel,
    private readonly tileSize: number,
    private readonly grid: CollisionGrid,
    restore?: SmacSnapshot,
    private readonly stats: SmacStats = SMAC_DEFAULTS,
  ) {
    this.core = new SmacCore(stats, restore);

    const board = (name: string): GameTile[] =>
      level.layers.find((l) => l.name === name)?.tiles ?? [];
    const toPx = (t: { x: number; y: number }): { x: number; y: number } => ({
      x: (t.x + 0.5) * tileSize,
      y: (t.y + 0.5) * tileSize,
    });

    const coreTile = board("vault_core")[0];
    const centre = toPx(coreTile ?? { x: level.width / 2, y: level.height / 2 });
    this.x = centre.x;
    this.y = centre.y;

    board("vault_nodes").forEach((tile, i) => {
      const node = new HoldFixture(scene, tile, tileSize, i, stats.nodeTime);
      if (this.core.isNodeDown(i)) node.restoreDone();
      this.nodes.push(node);
    });
    for (const tile of board("vault_racks")) this.racks.push(toPx(tile));

    this.eye = {
      x: this.x,
      y: this.y,
      facing: 0,
      rangeTiles: stats.auditRange,
      coneDegrees: stats.auditAngle,
      // The core has no heat sense; it is looking, not feeling.
      thermalTiles: 0,
      // It *is* the Alignment mesh, so being read as compliant by it buys nothing.
      readsConduct: false,
    };

    this.markerGfx = scene.add.graphics().setDepth(120);
    this.beamGfx = scene.add.graphics().setDepth(400);
    this.coreGfx = scene.add.graphics().setDepth(456).setBlendMode(Phaser.BlendModes.ADD);
    this.drawMarkers();
  }

  get state(): SmacState {
    return this.core.state;
  }

  /** True while the mesh holds Rowan in a corrected posture (see `SmacCore`). */
  get forcesCompliance(): boolean {
    return this.core.forcesCompliance;
  }

  /** How movement input is being rewritten this frame. */
  get correction(): { invertX: boolean; invertY: boolean } {
    return this.core.correction;
  }

  /** True while the fake completion card should own the screen. */
  get summaryUp(): boolean {
    return this.core.summaryUp;
  }

  get isDefeated(): boolean {
    return this.core.state === SmacState.DEFEATED;
  }

  /** Player broke the fake completion card (Esc or C). */
  dismissSummary(): SmacTransition | null {
    return this.core.dismissSummary();
  }

  snapshot(): SmacSnapshot {
    return this.core.snapshot();
  }

  hudView(): SmacView {
    return this.core.view();
  }

  update(dt: number, ctx: EnforcerContext): SmacTickResult {
    const res: SmacTickResult = { transition: this.core.update(dt), auditHit: false };

    // Keep the fixtures honest with the state machine: a node the core repaired has to
    // visibly come back, or the room would lie about how the fight is going.
    for (const node of this.nodes) {
      if (node.isDone && !this.core.isNodeDown(node.index)) node.reset();
    }

    if (this.core.state === SmacState.DEFEATED) {
      this.beamGfx.clear();
      this.detection = 0;
      this.drawCore();
      return res;
    }

    // The card is opaque and total, but the room is not paused behind it — that is the
    // point of it. Beams keep sweeping and keep landing.
    this.sweep += dt * this.stats.auditSpeed;
    this.lockout = Math.max(0, this.lockout - dt);
    this.updateAudit(dt, ctx, res);
    this.drawBeams();
    this.drawCore();
    return res;
  }

  /**
   * Nearest correction node, and the verb for it.
   *
   * Mirrors `Vent4Boss.handleInteract`: returns a label and a distance for `GameScene`'s
   * nearest-wins prompt arbitration, and claims the held key when it is actually using
   * it, so a terminal and a node can't both consume the same hold.
   */
  handleInteract(
    dt: number,
    ptx: number,
    pty: number,
    interactDown: boolean,
  ): SmacInteractResult {
    const res: SmacInteractResult = { dist: Infinity, consumedHold: false, transition: null };
    const idleAll = (except?: HoldFixture): void => {
      for (const node of this.nodes) if (node !== except) node.idle(dt);
    };

    if (this.core.state === SmacState.DEFEATED) {
      idleAll();
      return res;
    }

    const near = nearestFixture(this.nodes, ptx * this.tileSize, pty * this.tileSize, this.tileSize);
    if (!near || near.tiles > INTERACT_TILES) {
      idleAll();
      return res;
    }
    const nearest = near.item;

    res.dist = near.tiles;
    if (nearest.isDone) {
      const left = Math.ceil(this.core.nextResync);
      res.label = `[NODE ${nearest.index + 1} DESYNCHRONISED — RESYNC ${left}s]`;
    } else {
      res.label = `[E] Desynchronise correction node ${nearest.index + 1}`;
      if (interactDown) {
        res.consumedHold = true;
        if (nearest.advance(dt)) res.transition = this.core.noteNodeDesynced(nearest.index);
      }
    }
    idleAll(interactDown ? nearest : undefined);
    return res;
  }

  /**
   * The auditing beams.
   *
   * Runs through the shared {@link canSense} / {@link accrueDetection} pair like every
   * other eye in the game. The one thing that makes this eye different is declared as
   * data — `readsConduct: false` on {@link eye} — rather than as a hand-rolled copy of
   * the cone test, which is what it used to be. Concealment still counts, so cover and
   * the Shared Field both work; the racks exist to make the second one reachable.
   *
   * One `Eye` is reused across the beams and across frames: only the facing differs.
   */
  private updateAudit(dt: number, ctx: EnforcerContext, res: SmacTickResult): void {
    let lit = false;
    if (this.lockout <= 0) {
      for (let i = 0; i < AUDIT_BEAMS && !lit; i++) {
        this.eye.facing = this.beamFacing(i);
        lit = canSense(this.eye, ctx);
      }
    }
    this.detection = accrueDetection(this.detection, lit, dt, this.stats.auditDetectTime, ctx);
    if (this.detection < 1) return;

    // accrueDetection has already reported the sighting; the lockout is what keeps one
    // crossing from being charged every frame it lasts.
    this.detection = 0;
    this.lockout = AUDIT_LOCKOUT;
    res.auditHit = true;
  }

  private beamFacing(i: number): number {
    return this.sweep + (i * Math.PI * 2) / AUDIT_BEAMS;
  }

  private drawBeams(): void {
    const g = this.beamGfx;
    const hot = this.detection > 0.6;
    g.clear();
    g.fillStyle(hot ? BEAM_HOT : BEAM_COLOR, hot ? 0.24 : 0.13);
    const half = (this.stats.auditAngle * Math.PI) / 360;
    const originX = this.x / this.tileSize;
    const originY = this.y / this.tileSize;
    for (let i = 0; i < AUDIT_BEAMS; i++) {
      const facing = this.beamFacing(i);
      g.beginPath();
      g.moveTo(this.x, this.y);
      for (let r = 0; r <= 10; r++) {
        const a = facing - half + (2 * half * r) / 10;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const hit =
          rayDistance(this.grid, originX, originY, cos, sin, this.stats.auditRange, 0) *
          this.tileSize;
        g.lineTo(this.x + cos * hit, this.y + sin * hit);
      }
      g.closePath();
      g.fillPath();
    }
  }

  /** The core's own glow, breathing faster as its integrity falls. */
  private drawCore(): void {
    const g = this.coreGfx;
    g.clear();
    if (this.core.state === SmacState.DEFEATED) {
      g.fillStyle(0x203040, 0.5);
      g.fillCircle(this.x, this.y, this.tileSize * 0.7);
      return;
    }
    const frac = this.core.integrity / this.stats.integrityStart;
    const pulse = 0.5 + 0.5 * Math.sin(this.sweep * (2.5 + (1 - frac) * 4));
    const color = this.core.state === SmacState.EXPOSED ? 0xff3b3b : 0x9a6bff;
    g.fillStyle(color, 0.18 + 0.16 * pulse);
    g.fillCircle(this.x, this.y, this.tileSize * (1.0 + 0.35 * pulse));
    g.fillStyle(color, 0.5);
    g.fillCircle(this.x, this.y, this.tileSize * 0.45);
  }

  /** Static rings under the racks, so their role reads without a legend. */
  private drawMarkers(): void {
    const g = this.markerGfx;
    g.clear();
    g.lineStyle(2, 0x39d3ff, 0.5);
    for (const r of this.racks) g.strokeCircle(r.x, r.y, this.tileSize * 0.55);
  }
}
