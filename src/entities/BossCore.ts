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
import { HoldTarget, HOLD_BAR_CYAN } from "./HoldTarget";
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
 * any range. That is the right rule for a guard reading conduct off a mesh, and exactly
 * the wrong one here: NW-SMAC-01 *is* the mesh. So its auditing beams run their own cone
 * test rather than going through `canSense`, and the forced-compliant posture it holds
 * Rowan in buys him nothing against the thing imposing it. Concealment still works —
 * crouching in cover, or a Shared Field merge — which is what makes the silicate racks
 * around the room the answer to the beams.
 */

/** Beams sweeping out of the core, evenly spaced around it. */
const AUDIT_BEAMS = 3;

/** How fast an audit meter drains once the beam is off you. */
const AUDIT_DECAY = 0.7;

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

/**
 * One correction node: a hold-to-desynchronise fixture that the core repairs on a timer.
 *
 * Distinct from `PressureSubStation` in the one way that matters — a patched substation
 * stays patched, whereas a desynchronised node comes *back*. That round trip is the
 * whole encounter, so the fixture has to be able to un-finish itself.
 */
class CorrectionNode {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  private down = false;
  private readonly hold: HoldTarget;

  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, index: number, holdTime: number) {
    this.index = index;
    this.hold = new HoldTarget(scene, tile, tileSize, holdTime, HOLD_BAR_CYAN);
    this.x = this.hold.x;
    this.y = this.hold.y;
  }

  get isDown(): boolean {
    return this.down;
  }

  /** Advances the hold. True on the exact completion frame, so the core counts it once. */
  desync(dt: number): boolean {
    if (this.down) return false;
    if (!this.hold.advance(dt)) return false;
    this.down = true;
    this.hold.settle(0x5effa0);
    return true;
  }

  idle(dt: number): void {
    if (!this.down) this.hold.decay(dt);
  }

  /** The core got it back. Returns the fixture to untouched. */
  resync(): void {
    if (!this.down) return;
    this.down = false;
    this.hold.reset();
  }

  /** Restores a down state on level re-entry — no bar, no completion event. */
  restoreDown(): void {
    if (this.down) return;
    this.down = true;
    this.hold.settle(0x5effa0);
  }
}

export class BossCore {
  private readonly core: SmacCore;
  private readonly nodes: CorrectionNode[] = [];
  /** Silicate racks — Shared Field witness anchors, in pixel space. */
  readonly racks: { x: number; y: number }[] = [];

  /** Pixel centre of the core itself. */
  readonly x: number;
  readonly y: number;

  /** 0..1, highest of the audit beams — feeds the scene's detection readout. */
  detection = 0;

  private sweep = Phaser.Math.FloatBetween(0, Math.PI * 2);
  private lockout = 0;

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
      const node = new CorrectionNode(scene, tile, tileSize, i, stats.nodeTime);
      if (this.core.nodesDown[i]) node.restoreDown();
      this.nodes.push(node);
    });
    for (const tile of board("vault_racks")) this.racks.push(toPx(tile));

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
    const down = this.core.nodesDown;
    for (const node of this.nodes) {
      if (node.isDown && !down[node.index]) node.resync();
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
    if (this.core.state === SmacState.DEFEATED) {
      for (const node of this.nodes) node.idle(dt);
      return res;
    }

    let nearest: CorrectionNode | undefined;
    let nearestDist = Infinity;
    for (const node of this.nodes) {
      const d = Phaser.Math.Distance.Between(ptx * this.tileSize, pty * this.tileSize, node.x, node.y);
      const tiles = d / this.tileSize;
      if (tiles < nearestDist) {
        nearestDist = tiles;
        nearest = node;
      }
    }
    if (!nearest || nearestDist > 1.4) {
      for (const node of this.nodes) node.idle(dt);
      return res;
    }

    res.dist = nearestDist;
    if (nearest.isDown) {
      const left = Math.ceil(this.core.nextResync);
      res.label = `[NODE ${nearest.index + 1} DESYNCHRONISED — RESYNC ${left}s]`;
    } else {
      res.label = `[E] Desynchronise correction node ${nearest.index + 1}`;
      if (interactDown) {
        res.consumedHold = true;
        if (nearest.desync(dt)) res.transition = this.core.noteNodeDesynced(nearest.index);
      }
    }
    for (const node of this.nodes) if (node !== nearest || !interactDown) node.idle(dt);
    return res;
  }

  /**
   * The auditing beams: the room's own sight, run without going through `canSense`.
   *
   * See the class comment for why. Concealment is still honoured, so cover and the
   * Shared Field both work — the racks exist to make the second one reachable.
   */
  private updateAudit(dt: number, ctx: EnforcerContext, res: SmacTickResult): void {
    const px = ctx.player.x;
    const py = ctx.player.y;
    const rangePx = this.stats.auditRange * this.tileSize;
    const half = (this.stats.auditAngle * Math.PI) / 360;

    let lit = false;
    if (!ctx.playerConcealed && this.lockout <= 0) {
      const dx = px - this.x;
      const dy = py - this.y;
      if (dx * dx + dy * dy <= rangePx * rangePx) {
        const toPlayer = Math.atan2(dy, dx);
        for (let i = 0; i < AUDIT_BEAMS && !lit; i++) {
          const facing = this.beamFacing(i);
          if (Math.abs(Phaser.Math.Angle.Wrap(facing - toPlayer)) > half) continue;
          lit = this.grid.hasLineOfSight(
            this.x / this.tileSize,
            this.y / this.tileSize,
            px / this.tileSize,
            py / this.tileSize,
          );
        }
      }
    }

    if (!lit) {
      this.detection = Math.max(0, this.detection - dt * AUDIT_DECAY);
      return;
    }
    this.detection = Math.min(1, this.detection + dt / this.stats.auditDetectTime);
    if (this.detection < 1) return;

    this.detection = 0;
    this.lockout = AUDIT_LOCKOUT;
    res.auditHit = true;
    ctx.alert.reportSighting(Math.floor(px / this.tileSize), Math.floor(py / this.tileSize));
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
