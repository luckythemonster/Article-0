import Phaser from "phaser";
import type { GameLevel } from "../../map/types";
import type { CollisionGrid } from "../../systems/CollisionGrid";
import type { Player } from "../../entities/Player";
import type { EnforcerContext } from "../../entities/Enforcer";
import { Vent4Boss } from "../../entities/Vent4Boss";
import { Vent4State, type Vent4Snapshot, type Vent4Transition } from "../../systems/Vent4Core";
import { VENT_CORE_LEVEL } from "../../map/VentCoreLevel";
import { BossCore } from "../../entities/BossCore";
import type { SmacSnapshot, SmacTransition } from "../../systems/SmacCore";
import { RoofRelay } from "../../entities/RoofRelay";
import type { RelaySnapshot, RelayTransition } from "../../systems/RelayCore";
import {
  SMAC_DEFAULTS,
  RELAY_DEFAULTS,
  VENT4_DEFAULTS,
} from "../../systems/EntityStats";
import { ROOF_ARRAY_LEVEL } from "../../map/RoofArrayLevel";

/**
 * The three set-piece encounters — VENT-4, the NW-SMAC-01 vault, the rooftop
 * relay — as one collaborator instead of three parallel fields on GameScene.
 *
 * At most one is ever present on a given level (each is gated on a disjoint
 * level condition), but GameScene used to carry all the wiring for all three
 * anyway: a field, a construct block, a tick block, an interact block and a
 * snapshot line, times three, all structurally identical and all bespoke.
 * This is that wiring, once. It owns *whether an encounter fires this frame
 * and what it mechanically does* — running its update, applying its hit
 * reactions, publishing its HUD view, arbitrating the interact key.
 *
 * It deliberately does **not** own what each encounter's state changes *mean*
 * — the audio cue, the camera sting, the objective/journal side effects.
 * Those stay on GameScene as the `onXTransition` methods they already were,
 * passed in here as {@link EncountersCallbacks} the same way `OverlayGate`
 * takes an `onOpen`/`onClose` pair per overlay. That split is what keeps this
 * from becoming a generic `Encounter` interface: the three entities have
 * genuinely different shapes underneath (VENT-4 pushes the player with a
 * force that must land after `Player.update`'s own `setVelocity`; NW-SMAC-01
 * rewrites movement input and can raise a card that does *not* suspend the
 * sim; the roof spawns guards and ends the run) — unifying those would cost
 * more than the three near-identical wiring blocks ever did.
 *
 * Disposable per level, like `NoiseEvents`: `GameScene.create()` builds a
 * fresh one every time rather than carrying it across `scene.restart()`, so
 * there is no stale-reference risk from a level that doesn't reconstruct all
 * three and no explicit reset method to keep in step with that.
 */

export interface EncountersCallbacks {
  onVent4Transition(tr: Vent4Transition): void;
  onSmacTransition(tr: SmacTransition): void;
  onRelayTransition(tr: RelayTransition): void;
  /**
   * A siege Enforcer just landed at a catwalk mouth — dress it into the world
   * (create the entity, push it onto the guard roster, alert, play the cue).
   * The *whether* (the wave, the cap on concurrent siege guards) is decided
   * inside {@link Encounters.tick} before this is ever called.
   */
  onSiegeSpawn(at: { x: number; y: number }): void;
}

/** A fixed point that charges the Shared Field when witnessed — a rack or a dish. */
export interface WitnessAnchor {
  x: number;
  y: number;
  radiusTiles: number;
}

export class Encounters {
  private vent4?: Vent4Boss;
  private smac?: BossCore;
  private relay?: RoofRelay;
  private siegeGuardsLanded = 0;
  /** Racks + dish, resolved once in {@link build} — neither ever moves. */
  private anchors: WitnessAnchor[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly cb: EncountersCallbacks,
  ) {}

  /**
   * Constructs whichever encounter this level carries, restoring mid-fight
   * state from the registry, and publishes the first HUD view.
   *
   * @param coreSilenced whether NW-SMAC-01 has already been beaten this run —
   *   the vault, unlike VENT-4 and the roof, stays down once won rather than
   *   restaging on re-entry.
   */
  build(level: GameLevel, tileSize: number, grid: CollisionGrid, coreSilenced: boolean): void {
    const registry = this.scene.registry;

    if (level.name === VENT_CORE_LEVEL) {
      this.vent4 = new Vent4Boss(
        this.scene,
        level,
        tileSize,
        grid,
        registry.get("vent4State") as Vent4Snapshot | undefined,
      );
    }
    registry.set("vent4", this.vent4 ? this.vent4.hudView() : null);

    if (level.layers.some((l) => l.name === "vault_core") && !coreSilenced) {
      this.smac = new BossCore(
        this.scene,
        level,
        tileSize,
        grid,
        registry.get("smacState") as SmacSnapshot | undefined,
        SMAC_DEFAULTS,
      );
    }
    registry.set("smac", this.smac ? this.smac.hudView() : null);

    if (level.name === ROOF_ARRAY_LEVEL) {
      this.relay = new RoofRelay(
        this.scene,
        level,
        tileSize,
        grid,
        registry.get("relayState") as RelaySnapshot | undefined,
        RELAY_DEFAULTS,
      );
    }
    registry.set("relay", this.relay ? this.relay.hudView() : null);

    this.anchors = [];
    if (this.smac) {
      for (const r of this.smac.racks) {
        this.anchors.push({ x: r.x, y: r.y, radiusTiles: SMAC_DEFAULTS.rackWitnessRadius });
      }
    }
    if (this.relay) {
      this.anchors.push({
        x: this.relay.dish.x,
        y: this.relay.dish.y,
        radiusTiles: RELAY_DEFAULTS.dishWitnessRadius,
      });
    }
  }

  /** VENT-4's own state, for the audio pre-arm right after `build()`. */
  get vent4State(): Vent4State | undefined {
    return this.vent4?.state;
  }

  /** Whether the codec's maintenance band should offer the Q0 transmit finisher. */
  get vent4CanTransmit(): boolean {
    return this.vent4?.canTransmit ?? false;
  }

  /** How movement input is being rewritten this frame, if NW-SMAC-01 is doing so. */
  get correction(): { invertX: boolean; invertY: boolean } | undefined {
    return this.smac?.correction;
  }

  /** True while the false completion card owns the screen (see the class doc). */
  get summaryUp(): boolean {
    return this.smac?.summaryUp ?? false;
  }

  /** True while NW-SMAC-01 is holding Rowan in a forced-compliant posture. */
  get forcesCompliance(): boolean {
    return this.smac?.forcesCompliance ?? false;
  }

  /** True once the roof's discharge has fired: input locked, lights dead. */
  get inputLocked(): boolean {
    return this.relay?.isCaptured ?? false;
  }

  /** Fixed points that charge the Shared Field when witnessed — racks, the dish. */
  witnessAnchors(): readonly WitnessAnchor[] {
    return this.anchors;
  }

  /** Player broke the false completion card (Esc or C). Dismiss only — no dressing. */
  dismissSmacSummary(): void {
    const tr = this.smac?.dismissSummary();
    if (tr) this.cb.onSmacTransition(tr);
  }

  /** The codec's 140.85 transmit finisher. */
  transmitVent4(): void {
    const tr = this.vent4?.transmitFinisher();
    if (tr) this.cb.onVent4Transition(tr);
  }

  /**
   * Ticks whichever encounter is present, applies its hit reactions, and
   * publishes its HUD view. Returns the highest detection it reached, for the
   * scene to fold into its own per-frame maximum alongside guards and sensors.
   *
   * No `frozen` flag: `GameScene.tickWorld` already returns before this is
   * ever called while frozen, so there is nothing here to gate a second time.
   */
  tick(dt: number, ctx: EnforcerContext): number {
    let maxDetection = 0;
    const player = this.player;
    const registry = this.scene.registry;

    if (this.vent4) {
      const tick = this.vent4.update(dt, ctx);
      maxDetection = Math.max(maxDetection, this.vent4.detection);
      if (tick.transition) this.cb.onVent4Transition(tick.transition);
      if (tick.burst) {
        this.scene.cameras.main.flash(220, 150, 40, 10);
        player.takeDamage(VENT4_DEFAULTS.burstDamage);
      }
      if (tick.steamHit && player.takeDamage(VENT4_DEFAULTS.steamDamage)) {
        this.scene.cameras.main.shake(120, 0.004);
      }
      if (tick.overheating && player.takeDamage(VENT4_DEFAULTS.overheatDamage)) {
        this.scene.cameras.main.flash(160, 120, 30, 10);
      }
      // Added to the body's velocity, not set — and this must run after
      // Player.update's own setVelocity has already run for the frame, which
      // it has, because tick() is called from the same point in tickWorld
      // this force-application always occupied.
      const forces = this.vent4.computeForces(dt, player.x, player.y);
      const body = player.sprite.body as Phaser.Physics.Arcade.Body;
      body.velocity.x += forces.vx;
      body.velocity.y += forces.vy;
      if (forces.inIntake) player.takeDamage(VENT4_DEFAULTS.intakeDamage);
      registry.set("vent4", this.vent4.hudView());
    }

    if (this.smac) {
      const tick = this.smac.update(dt, ctx);
      maxDetection = Math.max(maxDetection, this.smac.detection);
      if (tick.transition) this.cb.onSmacTransition(tick.transition);
      if (tick.auditHit && player.takeDamage(SMAC_DEFAULTS.auditDamage)) {
        this.scene.cameras.main.flash(180, 200, 60, 180);
      }
      registry.set("smac", this.smac.hudView());
    }

    if (this.relay) {
      const tick = this.relay.update(dt, ctx);
      maxDetection = Math.max(maxDetection, this.relay.detection);
      if (tick.transition) this.cb.onRelayTransition(tick.transition);
      if (tick.searchlightHit && player.takeDamage(RELAY_DEFAULTS.searchlightDamage)) {
        this.scene.cameras.main.flash(160, 255, 240, 180);
      }
      if (tick.spawnAt) {
        for (const at of tick.spawnAt) {
          if (this.siegeGuardsLanded >= RELAY_DEFAULTS.maxSiegeGuards) continue;
          this.siegeGuardsLanded++;
          this.cb.onSiegeSpawn(at);
        }
      }
      registry.set("relay", this.relay.hudView());
    }

    return maxDetection;
  }

  /**
   * Unified interact-key dispatch. At most one encounter is ever live per
   * level, so this is a pick between whichever exists, not an arbitration
   * between three live candidates.
   *
   * `unauthorized` is deliberately derived from the NW-SMAC-01 branch only —
   * today only its correction-node desync is a conduct violation; patching a
   * VENT-4 sub-station and setting a roof pedestal never were. A generic fold
   * over all three `consumedHold`s would happen to read the same at runtime
   * (the three never coexist), but would silently start flagging the other
   * two the moment that stopped being true.
   */
  handleInteract(
    dt: number,
    ptx: number,
    pty: number,
    interactDown: boolean,
    interactJust: boolean,
    inventory: string[],
  ): { label?: string; dist: number; consumedHold: boolean; unauthorized: boolean } {
    if (this.vent4) {
      const r = this.vent4.handleInteract(dt, ptx, pty, interactDown, interactJust, inventory);
      if (r.transition) this.cb.onVent4Transition(r.transition);
      return { label: r.label, dist: r.dist, consumedHold: r.consumedHold, unauthorized: false };
    }
    if (this.smac) {
      const r = this.smac.handleInteract(dt, ptx, pty, interactDown);
      if (r.transition) this.cb.onSmacTransition(r.transition);
      return {
        label: r.label,
        dist: r.dist,
        consumedHold: r.consumedHold,
        unauthorized: r.consumedHold,
      };
    }
    if (this.relay && !this.relay.isCaptured) {
      const r = this.relay.handleInteract(dt, ptx, pty, interactDown);
      if (r.transition) this.cb.onRelayTransition(r.transition);
      return { label: r.label, dist: r.dist, consumedHold: r.consumedHold, unauthorized: false };
    }
    return { dist: Infinity, consumedHold: false, unauthorized: false };
  }

  /** Snapshots whichever encounter is present, for the run's SHUTDOWN persist. */
  persist(): void {
    const registry = this.scene.registry;
    if (this.vent4) registry.set("vent4State", this.vent4.snapshot());
    if (this.smac) registry.set("smacState", this.smac.snapshot());
    if (this.relay) registry.set("relayState", this.relay.snapshot());
  }
}
