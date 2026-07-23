import Phaser from "phaser";
import type { GameLevel } from "../map/types";
import type { CollisionGrid } from "../systems/CollisionGrid";
import type { EnforcerContext } from "./Enforcer";
import {
  Vent4Core,
  Vent4State,
  VENT4_MESSAGES,
  type Vent4Msg,
  type Vent4Snapshot,
  type Vent4Transition,
  type Vent4View,
} from "../systems/Vent4Core";
import { Vent4PhysicsSystem, type Vent4Forces } from "../systems/Vent4PhysicsSystem";
import { STAPLER_ITEM, VENT4_DEFAULTS, type Vent4Stats } from "../systems/EntityStats";
import { PressureSubStation } from "./PressureSubStation";
import {
  HUB_CENTER_TILE,
  VENT_CORE_COLUMNS,
  VENT_CORE_DRIPS,
  VENT_CORE_PITONS,
  VENT_CORE_STEAM,
  VENT_CORE_WINCHES,
} from "../map/VentCoreLevel";
import { getAudio } from "../systems/AudioDirector";

/** Matches GameScene's INTERACT_RANGE for the hold-E verbs. */
const INTERACT_RANGE_TILES = 1.4;
/** How close to a piton point the brace hold works. */
const PITON_RANGE_TILES = 1.1;
/** Rays per sweep cone (four cones — same ray budget as two sensors). */
const RAY_COUNT = 10;
/** Seconds the sweeps stand down after a correction burst lands. */
const SWEEP_LOCKOUT = 1.5;
/** Seconds a grate ping biases the nearest sweep toward the player. */
const BIAS_DURATION = 2.0;
/** Seconds between grate-triggered air jets. */
const GRATE_COOLDOWN = 2.5;
/** Steam jets arm only when the player is within this many tiles (Turbulence). */
const STEAM_ARM_TILES = 4;

/** What happened inside the boss this frame, for the scene to apply/dress. */
export interface Vent4TickResult {
  /** A sweep (or the purge's thermal scan) fully spotted the player. */
  burst?: { dirX: number; dirY: number };
  /** An active steam jet caught the player (debounced). */
  steamHit: boolean;
  /** Heat is maxed during the purge — the scene applies periodic damage. */
  overheating: boolean;
  transition: Vent4Transition | null;
}

/** The boss's claim on this frame's interact key, for the scene's dispatcher. */
export interface Vent4InteractResult {
  /** Prompt to show if this is the nearest interactable (undefined = none). */
  label?: string;
  /** Distance to the boss's target, in tiles (for prompt arbitration). */
  dist: number;
  /** True while a boss hold is consuming E — the chest search must not run. */
  consumedHold: boolean;
  transition: Vent4Transition | null;
}

interface SteamJet {
  x: number;
  y: number;
  active: boolean;
  timer: number;
  crossing: boolean;
}

/**
 * VENT-4, "The Environmental Triage Engine" — the vent-core boss. A composite
 * entity in the codebase's plain-class style: it owns the pure FSM/economy
 * ({@link Vent4Core}), the force model ({@link Vent4PhysicsSystem}), the three
 * perimeter {@link PressureSubStation}s, and all of its own rendering (turbine
 * hub, four rotating sweep spotlights, core hatch + capacitors, steam jets,
 * winch/piton/drip markers, and the grip/heat gauges under the player).
 *
 * The scene drives it like every entity: `update(dt, ctx)` in the main loop,
 * `handleInteract(...)` from the interact dispatcher, and `computeForces(...)`
 * whose result is added to the player body's velocity after Player.update.
 */
export class Vent4Boss {
  /** Sweep/thermal exposure meter (0..1) — feeds the scene's detection HUD. */
  detection = 0;

  readonly physics: Vent4PhysicsSystem;
  private readonly core: Vent4Core;
  private readonly subs: PressureSubStation[] = [];
  private readonly grates = new Set<string>();
  private readonly winches: { x: number; y: number }[];
  private readonly winchProgress: number[];
  private readonly jets: SteamJet[];
  private readonly caps: { x: number; y: number }[];
  private readonly capHits: number[];
  private readonly hub: { x: number; y: number };

  private readonly coneGfx: Phaser.GameObjects.Graphics;
  private readonly steamGfx: Phaser.GameObjects.Graphics;
  private readonly hubGfx: Phaser.GameObjects.Graphics;
  private readonly coreGfx: Phaser.GameObjects.Graphics;
  private readonly markerGfx: Phaser.GameObjects.Graphics;
  private readonly tracerGfx: Phaser.GameObjects.Graphics;
  private readonly gaugeGfx: Phaser.GameObjects.Graphics;

  private t = 0;
  private sweepBase = 0;
  private sweepDetect = 0;
  private sweepLockout = 0;
  private biasCone = -1;
  private biasAngle = 0;
  private biasLeft = 0;
  private grateSuspicion = 0;
  private grateCooldown = 0;
  private staplerCooldown = 0;
  private tracer?: { x1: number; y1: number; x2: number; y2: number; ttl: number };
  private bladePhase = 0;
  private bladeSpeed = 0;
  private hatch = 0; // 0 closed .. 1 open
  private holdingPiton = false;
  private activeWinch = -1;
  private msgId = 0;
  private lastMsg?: Vent4Msg;

  constructor(
    scene: Phaser.Scene,
    level: GameLevel,
    private readonly tileSize: number,
    private readonly grid: CollisionGrid,
    restore?: Vent4Snapshot,
    private readonly stats: Vent4Stats = VENT4_DEFAULTS,
  ) {
    const ts = tileSize;
    const toPx = (p: { x: number; y: number }): { x: number; y: number } => ({
      x: (p.x + 0.5) * ts,
      y: (p.y + 0.5) * ts,
    });

    this.core = new Vent4Core(stats, restore);
    this.hub = { x: HUB_CENTER_TILE.x * ts, y: HUB_CENTER_TILE.y * ts };
    this.physics = new Vent4PhysicsSystem(
      {
        hub: this.hub,
        columns: VENT_CORE_COLUMNS.map(toPx),
        pitons: VENT_CORE_PITONS.map(toPx),
        drips: VENT_CORE_DRIPS.map(toPx),
      },
      ts,
      stats,
    );

    const subLayer = level.layers.find((l) => l.name === "substations");
    (subLayer?.tiles ?? []).forEach((tile, i) => {
      const sub = new PressureSubStation(scene, tile, ts, i, stats);
      if (restore?.patched[i]) sub.restorePatched();
      this.subs.push(sub);
    });

    const grateLayer = level.layers.find((l) => l.name === "grates");
    for (const tile of grateLayer?.tiles ?? []) this.grates.add(`${tile.x},${tile.y}`);

    this.winches = VENT_CORE_WINCHES.map(toPx);
    this.winchProgress = VENT_CORE_WINCHES.map(() => 0);
    this.jets = VENT_CORE_STEAM.map(toPx).map((p, i) => ({
      x: p.x,
      y: p.y,
      active: false,
      timer: 0.8 + i * 0.45,
      crossing: false,
    }));

    // Core capacitors sit on the hub's corner tiles, exposed while JAMMED.
    const hx = HUB_CENTER_TILE.x;
    const hy = HUB_CENTER_TILE.y;
    this.caps = [
      { x: (hx - 1) * ts, y: (hy - 1) * ts },
      { x: (hx + 1) * ts, y: (hy - 1) * ts },
      { x: (hx - 1) * ts, y: (hy + 1) * ts },
      { x: (hx + 1) * ts, y: (hy + 1) * ts },
    ];
    this.capHits = this.caps.map((_, i) =>
      restore?.capsDown[i] ? stats.capacitorHits : 0,
    );

    this.markerGfx = scene.add.graphics().setDepth(120);
    this.coneGfx = scene.add.graphics().setDepth(400);
    this.steamGfx = scene.add.graphics().setDepth(430);
    this.hubGfx = scene.add.graphics().setDepth(455);
    this.coreGfx = scene.add.graphics().setDepth(456).setBlendMode(Phaser.BlendModes.ADD);
    this.tracerGfx = scene.add.graphics().setDepth(600).setBlendMode(Phaser.BlendModes.ADD);
    this.gaugeGfx = scene.add.graphics().setDepth(1000);

    if (this.core.state === Vent4State.DEFEATED) this.hatch = 1;
    else this.pushMsg(this.core.state); // entering the arena flashes the banner
    this.drawMarkers();
  }

  get state(): Vent4State {
    return this.core.state;
  }

  get canTransmit(): boolean {
    return this.core.state === Vent4State.PHASE_3_PURGE;
  }

  transmitFinisher(): Vent4Transition | null {
    const tr = this.core.noteTransmit();
    return tr ? this.noteTransition(tr) : null;
  }

  snapshot(): Vent4Snapshot {
    return this.core.snapshot();
  }

  hudView(): Vent4View {
    return {
      compliance: this.core.compliance,
      band: this.core.band,
      state: this.core.state,
      jamLeft: this.core.jamLeft,
      msg: this.lastMsg,
    };
  }

  /** Per-frame tick, in the scene's entity loop (after updateInteractions). */
  update(dt: number, ctx: EnforcerContext): Vent4TickResult {
    const res: Vent4TickResult = { steamHit: false, overheating: false, transition: null };
    this.t += dt;
    this.staplerCooldown = Math.max(0, this.staplerCooldown - dt);

    const expired = this.core.update(dt);
    if (expired) res.transition = this.noteTransition(expired);
    const state = this.core.state;

    // Blade spin: a physical tell for every state (stalled while jammed).
    const targetSpeed =
      state === Vent4State.DEFEATED || state === Vent4State.JAMMED
        ? 0
        : state === Vent4State.PHASE_2_VACUUM
          ? 9
          : state === Vent4State.PHASE_3_PURGE
            ? 6
            : 3.5;
    const ease = targetSpeed < this.bladeSpeed ? 1.4 : 0.8;
    this.bladeSpeed += (targetSpeed - this.bladeSpeed) * Math.min(1, dt * ease);
    this.bladePhase += this.bladeSpeed * dt;

    const hatchTarget =
      state === Vent4State.JAMMED || state === Vent4State.DEFEATED ? 1 : 0;
    this.hatch = Phaser.Math.Clamp(
      this.hatch + Math.sign(hatchTarget - this.hatch) * dt * 2.5,
      0,
      1,
    );

    if (state === Vent4State.DEFEATED) {
      this.detection = 0;
      this.coneGfx.clear();
      this.steamGfx.clear();
      this.gaugeGfx.clear();
      this.drawHub();
      this.drawCore();
      this.tickTracer(dt);
      return res;
    }

    this.updateExposure(dt, ctx, res);
    this.updateGrates(dt, ctx, state);
    this.updateSteam(dt, ctx, res, state);

    this.drawHub();
    this.drawCore();
    this.drawGauges(ctx, state);
    this.tickTracer(dt);
    return res;
  }

  /**
   * The boss's slice of the interact dispatcher. Picks its nearest eligible
   * target (sub-station / winch / piton / stapler shot) and acts on it; the
   * scene arbitrates the returned label/distance against doors/chests/hatch.
   */
  handleInteract(
    dt: number,
    ptx: number,
    pty: number,
    interactDown: boolean,
    interactJust: boolean,
    inventory: string[],
  ): Vent4InteractResult {
    const res: Vent4InteractResult = { dist: Infinity, consumedHold: false, transition: null };
    this.holdingPiton = false;
    this.activeWinch = -1;
    const state = this.core.state;
    const ts = this.tileSize;

    if (state === Vent4State.DEFEATED) {
      for (const sub of this.subs) sub.idle(dt);
      this.decayWinches(dt, -1);
      return res;
    }

    // -- Gather this frame's candidates, nearest one wins. --
    type Kind = "sub" | "subLocked" | "winch" | "piton" | "stapler";
    let kind: Kind | undefined;
    let index = -1;
    let best = Infinity;
    const consider = (k: Kind, i: number, d: number, range: number): void => {
      if (d <= range && d < best) {
        kind = k;
        index = i;
        best = d;
      }
    };

    for (const sub of this.subs) {
      if (sub.isPatched) continue;
      sub.setLocked(!this.core.canPatch(sub.index));
      const d = Math.hypot(sub.x / ts - ptx, sub.y / ts - pty);
      consider(sub.isLocked ? "subLocked" : "sub", sub.index, d, INTERACT_RANGE_TILES);
    }
    if (state === Vent4State.PHASE_2_VACUUM) {
      this.winches.forEach((w, i) => {
        if (!this.core.canWinch(i)) return;
        consider("winch", i, Math.hypot(w.x / ts - ptx, w.y / ts - pty), INTERACT_RANGE_TILES);
      });
      const piton = this.physics.nearestPiton(ptx * ts, pty * ts, PITON_RANGE_TILES);
      if (piton !== null) {
        const p = VENT_CORE_PITONS[piton];
        consider("piton", piton, Math.hypot(p.x + 0.5 - ptx, p.y + 0.5 - pty), PITON_RANGE_TILES);
      }
    }
    if (state === Vent4State.JAMMED && inventory.includes(STAPLER_ITEM)) {
      const cap = this.staplerTarget(ptx * ts, pty * ts);
      if (cap !== -1) {
        const c = this.caps[cap];
        consider("stapler", cap, Math.hypot(c.x / ts - ptx, c.y / ts - pty), this.stats.staplerRange);
      }
    }

    // -- Act on the winner; everything else decays. --
    let patchingSub = -1;
    if (kind === "sub") {
      res.label = "[E] Patch relief valve";
      res.dist = best;
      if (interactDown) {
        res.consumedHold = true;
        patchingSub = index;
        const sub = this.subs[index];
        if (sub.patch(dt)) {
          const tr = this.core.notePatched(index);
          if (tr) res.transition = this.noteTransition(tr);
          getAudio().hack();
        }
      }
    } else if (kind === "subLocked") {
      res.label = "[PRESSURE HELD — SYSTEM RESISTING]";
      res.dist = best;
    } else if (kind === "winch") {
      res.label = "[E] Winch scrap into intake";
      res.dist = best;
      if (interactDown) {
        res.consumedHold = true;
        this.activeWinch = index;
        this.winchProgress[index] = Math.min(
          this.stats.winchTime,
          this.winchProgress[index] + dt,
        );
        if (this.winchProgress[index] >= this.stats.winchTime) {
          const tr = this.core.noteWinched(index);
          if (tr) res.transition = this.noteTransition(tr);
          this.drawMarkers();
        }
      }
    } else if (kind === "piton") {
      res.label = "[E] Brace on piton";
      res.dist = best;
      if (interactDown) {
        res.consumedHold = true;
        this.holdingPiton = true;
      }
    } else if (kind === "stapler") {
      res.label = "[E] Fire rail-stapler";
      res.dist = best;
      if (interactJust && this.staplerCooldown <= 0) {
        this.fireStapler(index, ptx * ts, pty * ts);
      }
    }

    for (const sub of this.subs) {
      if (sub.index !== patchingSub) sub.idle(dt);
    }
    this.decayWinches(dt, this.activeWinch);
    return res;
  }

  /** The frame's environmental force on the player (scene adds it to the body). */
  computeForces(dt: number, px: number, py: number): Vent4Forces {
    const state = this.core.state;
    return this.physics.update(dt, px, py, {
      suction: state === Vent4State.PHASE_2_VACUUM,
      purge: state === Vent4State.PHASE_3_PURGE,
      holdingPiton: this.holdingPiton,
    });
  }

  // --- per-frame internals ---

  /** Sweep spotlights (Phase 1) and the purge's arena-wide thermal scan. */
  private updateExposure(dt: number, ctx: EnforcerContext, res: Vent4TickResult): void {
    const s = this.stats;
    const ts = this.tileSize;
    this.sweepLockout = Math.max(0, this.sweepLockout - dt);
    this.biasLeft = Math.max(0, this.biasLeft - dt);
    const state = this.core.state;

    let seen = false;
    if (state === Vent4State.PHASE_1_SWEEP) {
      const speed =
        this.core.band === "LAMINAR" ? s.sweepSpeedLaminar : s.sweepSpeedTurbulent;
      this.sweepBase += speed * dt;

      if (this.sweepLockout <= 0 && !ctx.playerConcealed) {
        const dx = ctx.player.x - this.hub.x;
        const dy = ctx.player.y - this.hub.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= s.hubRadius * ts * 0.9 && dist <= s.sweepRange * ts) {
          const angTo = Math.atan2(dy, dx);
          const half = Phaser.Math.DegToRad(s.sweepAngle) / 2;
          for (let i = 0; i < s.sweepCount; i++) {
            if (Math.abs(angleDiff(this.coneFacing(i), angTo)) > half) continue;
            const o = this.coneOrigin(i);
            if (
              ctx.grid.hasLineOfSight(o.x / ts, o.y / ts, ctx.player.x / ts, ctx.player.y / ts)
            ) {
              seen = true;
              break;
            }
          }
        }
      }
      this.drawCones();
    } else {
      this.coneGfx.clear();
      // Critical Blockage: the purge scans the whole arena thermally — only a
      // cooled signature (condensate drip) hides the player.
      if (state === Vent4State.PHASE_3_PURGE) {
        seen = this.sweepLockout <= 0 && this.physics.thermalVisible;
      }
    }

    if (seen) {
      const light = ctx.lightMultiplierAt(ctx.player.x, ctx.player.y);
      this.sweepDetect = Math.min(1, this.sweepDetect + (light / s.sweepDetectTime) * dt);
      if (this.sweepDetect >= 1) {
        ctx.alert.reportSighting(
          Math.floor(ctx.player.x / ts),
          Math.floor(ctx.player.y / ts),
        );
        this.core.noteCorrectionBurst();
        const dx = ctx.player.x - this.hub.x;
        const dy = ctx.player.y - this.hub.y;
        const d = Math.hypot(dx, dy) || 1;
        res.burst = { dirX: dx / d, dirY: dy / d };
        this.physics.addImpulse(
          (dx / d) * this.stats.burstImpulse * ts,
          (dy / d) * this.stats.burstImpulse * ts,
        );
        this.sweepDetect = 0;
        this.sweepLockout = SWEEP_LOCKOUT;
        getAudio().steamHiss();
      }
    } else {
      this.sweepDetect = Math.max(0, this.sweepDetect - dt * 0.6);
    }
    this.detection = this.sweepDetect;
  }

  /** Acoustic triggers: loud footsteps on grates ping the machine. */
  private updateGrates(dt: number, ctx: EnforcerContext, state: Vent4State): void {
    this.grateCooldown = Math.max(0, this.grateCooldown - dt);
    const ts = this.tileSize;
    const onGrate = this.grates.has(
      `${Math.floor(ctx.player.x / ts)},${Math.floor(ctx.player.y / ts)}`,
    );
    if (onGrate && ctx.playerNoise > this.stats.grateNoiseThreshold) {
      this.grateSuspicion = Math.min(1, this.grateSuspicion + dt * 1.6);
    } else {
      this.grateSuspicion = Math.max(0, this.grateSuspicion - dt);
    }
    if (this.grateSuspicion < 1 || this.grateCooldown > 0) return;

    this.grateSuspicion = 0;
    this.grateCooldown = GRATE_COOLDOWN;
    getAudio().steamHiss();
    // A localized air jet kicks the player back off the grate line.
    const dx = ctx.player.x - this.hub.x;
    const dy = ctx.player.y - this.hub.y;
    const d = Math.hypot(dx, dy) || 1;
    this.physics.addImpulse(
      (dx / d) * this.stats.burstImpulse * 0.7 * ts,
      (dy / d) * this.stats.burstImpulse * 0.7 * ts,
    );
    // And the nearest sweep leans toward the sound for a moment.
    if (state === Vent4State.PHASE_1_SWEEP) {
      const angTo = Math.atan2(dy, dx);
      let bestCone = 0;
      let bestOff = Infinity;
      for (let i = 0; i < this.stats.sweepCount; i++) {
        const off = Math.abs(angleDiff(this.sweepBase + (i * Math.PI * 2) / this.stats.sweepCount, angTo));
        if (off < bestOff) {
          bestOff = off;
          bestCone = i;
        }
      }
      this.biasCone = bestCone;
      this.biasAngle = angTo;
      this.biasLeft = BIAS_DURATION;
    }
  }

  /** Floor steam valves: cadence hazards, armed by band/proximity. */
  private updateSteam(
    dt: number,
    ctx: EnforcerContext,
    res: Vent4TickResult,
    state: Vent4State,
  ): void {
    const ts = this.tileSize;
    const band = this.core.band;
    this.steamGfx.clear();
    for (const jet of this.jets) {
      const near =
        Math.hypot(ctx.player.x - jet.x, ctx.player.y - jet.y) <= STEAM_ARM_TILES * ts;
      const armed = band === "CRITICAL" || (band === "TURBULENT" && near);
      if (!armed) {
        jet.active = false;
        jet.crossing = false;
        continue;
      }
      jet.timer -= dt;
      if (jet.timer <= 0) {
        jet.active = !jet.active;
        jet.timer = jet.active ? 1.2 : 1.0;
        if (jet.active && near) getAudio().steamHiss();
      }
      if (!jet.active) {
        jet.crossing = false;
        continue;
      }
      this.drawJet(jet);
      const halfExtent = ts * 0.8;
      const inside =
        Math.abs(ctx.player.x - jet.x) <= halfExtent &&
        Math.abs(ctx.player.y - jet.y) <= halfExtent;
      if (inside && !jet.crossing) {
        jet.crossing = true;
        res.steamHit = true;
        if (state === Vent4State.PHASE_3_PURGE) {
          this.physics.heat = Math.min(1, this.physics.heat + 0.15);
        }
      } else if (!inside) {
        jet.crossing = false;
      }
    }
    res.overheating = state === Vent4State.PHASE_3_PURGE && this.physics.heat >= 1;
  }

  // --- stapler ---

  /** The nearest live capacitor in range with line of sight, or -1. */
  private staplerTarget(px: number, py: number): number {
    const ts = this.tileSize;
    let best = -1;
    let bestDist = this.stats.staplerRange * ts;
    this.caps.forEach((c, i) => {
      if (this.capHits[i] >= this.stats.capacitorHits) return;
      const d = Math.hypot(c.x - px, c.y - py);
      if (d > bestDist) return;
      if (!this.grid.hasLineOfSight(px / ts, py / ts, c.x / ts, c.y / ts)) return;
      bestDist = d;
      best = i;
    });
    return best;
  }

  private fireStapler(cap: number, px: number, py: number): void {
    this.staplerCooldown = this.stats.staplerCooldown;
    const c = this.caps[cap];
    this.tracer = { x1: px, y1: py, x2: c.x, y2: c.y, ttl: 0.08 };
    getAudio().railStapler();
    this.capHits[cap]++;
    if (this.capHits[cap] >= this.stats.capacitorHits) {
      this.core.noteCapacitorDestroyed(cap);
      getAudio().jamClunk();
    }
  }

  // --- transitions / HUD ---

  private noteTransition(tr: Vent4Transition): Vent4Transition {
    this.pushMsg(tr.to);
    return tr;
  }

  private pushMsg(state: Vent4State): void {
    this.msgId++;
    this.lastMsg = { id: this.msgId, text: VENT4_MESSAGES[state] };
  }

  // --- geometry ---

  private coneFacing(i: number): number {
    const base = this.sweepBase + (i * Math.PI * 2) / this.stats.sweepCount;
    if (this.biasLeft > 0 && i === this.biasCone) {
      return base + angleDiff(base, this.biasAngle) * 0.65;
    }
    return base;
  }

  private coneOrigin(i: number): { x: number; y: number } {
    const a = this.coneFacing(i);
    const r = this.stats.hubRadius * this.tileSize;
    return { x: this.hub.x + Math.cos(a) * r, y: this.hub.y + Math.sin(a) * r };
  }

  /**
   * Wall-clipped ray from a sweep origin. Cells inside the hub's own footprint
   * are ignored — the origins sit on the hub ring, whose corner tiles would
   * otherwise swallow diagonal rays at distance zero.
   */
  private castRay(ox: number, oy: number, angle: number, maxDist: number): number {
    const ts = this.tileSize;
    const step = ts * 0.25;
    const hubClear = (this.stats.hubRadius + 0.9) * ts;
    const cx = Math.cos(angle);
    const cy = Math.sin(angle);
    for (let d = step; d <= maxDist; d += step) {
      const x = ox + cx * d;
      const y = oy + cy * d;
      if (Math.hypot(x - this.hub.x, y - this.hub.y) <= hubClear) continue;
      if (this.grid.isBlocked(Math.floor(x / ts), Math.floor(y / ts))) return d - step;
    }
    return maxDist;
  }

  // --- drawing ---

  private drawCones(): void {
    const s = this.stats;
    const ts = this.tileSize;
    const half = Phaser.Math.DegToRad(s.sweepAngle) / 2;
    const range = (s.sweepRange - s.hubRadius) * ts;
    const hot = this.sweepDetect > 0.66;
    this.coneGfx.clear();
    this.coneGfx.fillStyle(hot ? 0xff3b3b : 0xffe14d, hot ? 0.28 : 0.12);
    for (let i = 0; i < s.sweepCount; i++) {
      const facing = this.coneFacing(i);
      const o = this.coneOrigin(i);
      this.coneGfx.beginPath();
      this.coneGfx.moveTo(o.x, o.y);
      for (let r = 0; r <= RAY_COUNT; r++) {
        const a = facing - half + (2 * half * r) / RAY_COUNT;
        const hit = this.castRay(o.x, o.y, a, range);
        this.coneGfx.lineTo(o.x + Math.cos(a) * hit, o.y + Math.sin(a) * hit);
      }
      this.coneGfx.closePath();
      this.coneGfx.fillPath();
    }
  }

  private bandColor(): number {
    if (this.core.state === Vent4State.DEFEATED) return 0x3a4654;
    const band = this.core.band;
    return band === "LAMINAR" ? 0x39d3ff : band === "TURBULENT" ? 0xffb03b : 0xff3b3b;
  }

  private drawHub(): void {
    const ts = this.tileSize;
    const g = this.hubGfx;
    const r = this.stats.hubRadius * ts;
    g.clear();
    // Housing plate + band-colored trim ring.
    g.fillStyle(0x10161f, 1);
    g.fillCircle(this.hub.x, this.hub.y, r + 6);
    g.lineStyle(3, this.bandColor(), 0.9);
    g.strokeCircle(this.hub.x, this.hub.y, r + 6);
    // Intake mouth.
    g.fillStyle(0x05070a, 1);
    g.fillCircle(this.hub.x, this.hub.y, r * 0.82);
    // Turbine blades.
    g.lineStyle(5, 0x4a5a6a, 1);
    for (let i = 0; i < 4; i++) {
      const a = this.bladePhase + (i * Math.PI) / 2;
      g.lineBetween(
        this.hub.x + Math.cos(a) * r * 0.14,
        this.hub.y + Math.sin(a) * r * 0.14,
        this.hub.x + Math.cos(a) * r * 0.74,
        this.hub.y + Math.sin(a) * r * 0.74,
      );
    }
    g.fillStyle(0x2b4356, 1);
    g.fillCircle(this.hub.x, this.hub.y, r * 0.16);
    // Jammed: scrap wedged across the mouth.
    if (this.core.state === Vent4State.JAMMED) {
      g.fillStyle(0xffb03b, 0.9);
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 + 0.6;
        g.fillRect(
          this.hub.x + Math.cos(a) * r * 0.4 - 4,
          this.hub.y + Math.sin(a) * r * 0.4 - 2,
          8,
          4,
        );
      }
    }
  }

  /** The exposed core: glowing capacitors while the hatch is open. */
  private drawCore(): void {
    const g = this.coreGfx;
    g.clear();
    if (this.hatch <= 0.02) return;
    const ts = this.tileSize;
    const defeated = this.core.state === Vent4State.DEFEATED;
    const pulse = defeated ? 0.15 : 0.5 + 0.4 * Math.sin(this.t * 7);
    this.caps.forEach((c, i) => {
      if (this.capHits[i] >= this.stats.capacitorHits) return; // destroyed = dark
      const radius = ts * 0.26 * this.hatch;
      g.fillStyle(defeated ? 0x39536b : 0xffe14d, pulse);
      g.fillCircle(c.x, c.y, radius);
      g.lineStyle(2, defeated ? 0x2b4356 : 0xff8a3b, Math.min(1, pulse + 0.25));
      g.strokeCircle(c.x, c.y, radius + 2);
    });
  }

  /** Static-ish arena furniture: winches, pitons, drips, steam valve bases. */
  private drawMarkers(): void {
    const ts = this.tileSize;
    const g = this.markerGfx;
    g.clear();
    this.winches.forEach((w, i) => {
      const used = this.core.isWinchUsed(i);
      g.fillStyle(used ? 0x1a2330 : 0x2b3a4a, 1);
      g.fillRect(w.x - ts * 0.35, w.y - ts * 0.3, ts * 0.7, ts * 0.6);
      g.lineStyle(2, used ? 0x3a4654 : 0xffb03b, 1);
      g.strokeRect(w.x - ts * 0.35, w.y - ts * 0.3, ts * 0.7, ts * 0.6);
      g.lineStyle(2, used ? 0x3a4654 : 0xcfe0f0, 1);
      g.strokeCircle(w.x, w.y + ts * 0.05, ts * 0.14);
    });
    for (const p of VENT_CORE_PITONS) {
      const x = (p.x + 0.5) * ts;
      const y = (p.y + 0.5) * ts;
      g.fillStyle(0x39d3ff, 0.9);
      g.fillTriangle(x, y - ts * 0.18, x - ts * 0.14, y + ts * 0.14, x + ts * 0.14, y + ts * 0.14);
      g.lineStyle(1, 0x2b4356, 1);
      g.strokeCircle(x, y, ts * 0.3);
    }
    for (const d of VENT_CORE_DRIPS) {
      const x = (d.x + 0.5) * ts;
      const y = (d.y + 0.5) * ts;
      g.fillStyle(0x4fd8ff, 0.35);
      g.fillCircle(x, y, ts * 0.3);
      g.fillStyle(0x9fe9ff, 0.9);
      g.fillCircle(x, y - ts * 0.08, ts * 0.08);
    }
    this.jets.forEach((j) => {
      g.fillStyle(0x1a2330, 1);
      g.fillCircle(j.x, j.y, ts * 0.22);
      g.lineStyle(2, 0xff8a3b, 0.8);
      g.strokeCircle(j.x, j.y, ts * 0.22);
    });
  }

  private drawJet(jet: SteamJet): void {
    const ts = this.tileSize;
    const g = this.steamGfx;
    const flick = 0.5 + 0.3 * Math.sin(this.t * 23 + jet.x);
    g.fillStyle(0xcfe8ff, 0.22 * flick + 0.12);
    g.fillCircle(jet.x, jet.y, ts * 0.75);
    g.fillStyle(0xffffff, 0.18 * flick + 0.1);
    g.fillCircle(jet.x, jet.y - ts * 0.2, ts * 0.45);
  }

  /** Grip (vacuum) / heat (purge) gauges floated under the player sprite. */
  private drawGauges(ctx: EnforcerContext, state: Vent4State): void {
    const g = this.gaugeGfx;
    const ts = this.tileSize;
    g.clear();

    const bar = (frac: number, color: number, y: number): void => {
      const w = ts * 0.9;
      const x = ctx.player.x - w / 2;
      g.fillStyle(0x0a0f16, 0.85);
      g.fillRect(x - 1, y - 1, w + 2, 6);
      g.fillStyle(color, 1);
      g.fillRect(x, y, w * Phaser.Math.Clamp(frac, 0, 1), 4);
    };

    if (state === Vent4State.PHASE_2_VACUUM || state === Vent4State.JAMMED) {
      const grip = this.physics.grip;
      bar(grip, grip > 0.5 ? 0x39d3ff : grip > 0.25 ? 0xffb03b : 0xff3b3b, ctx.player.y + ts * 0.62);
    } else if (state === Vent4State.PHASE_3_PURGE) {
      const heat = this.physics.heat;
      bar(heat, heat < 0.5 ? 0x39d3ff : heat < 0.8 ? 0xffb03b : 0xff3b3b, ctx.player.y + ts * 0.62);
      if (this.physics.thermalNullLeft > 0) {
        g.lineStyle(1, 0x9fe9ff, 0.9);
        g.strokeCircle(ctx.player.x, ctx.player.y, ts * 0.55);
      }
    }

    if (this.activeWinch >= 0 && this.winchProgress[this.activeWinch] > 0) {
      const w = this.winches[this.activeWinch];
      const frac = this.winchProgress[this.activeWinch] / this.stats.winchTime;
      const width = ts * 0.9;
      const x = w.x - width / 2;
      const y = w.y - ts * 0.8;
      g.fillStyle(0x0a0f16, 0.85);
      g.fillRect(x - 1, y - 1, width + 2, 7);
      g.fillStyle(0x39d3ff, 1);
      g.fillRect(x, y, width * frac, 5);
    }
  }

  private tickTracer(dt: number): void {
    if (!this.tracer) return;
    this.tracer.ttl -= dt;
    if (this.tracer.ttl <= 0) {
      this.tracer = undefined;
      this.tracerGfx.clear();
      return;
    }
    this.tracerGfx.clear();
    this.tracerGfx.lineStyle(2, 0xffe14d, 0.9);
    this.tracerGfx.lineBetween(this.tracer.x1, this.tracer.y1, this.tracer.x2, this.tracer.y2);
  }

  private decayWinches(dt: number, active: number): void {
    for (let i = 0; i < this.winchProgress.length; i++) {
      if (i !== active && this.winchProgress[i] > 0) {
        this.winchProgress[i] = Math.max(0, this.winchProgress[i] - dt * 1.5);
      }
    }
  }
}

/** Smallest signed angle from a to b, in (-pi, pi]. */
function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
