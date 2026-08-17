import type Phaser from "phaser";
import { Cover } from "../../entities/Cover";
import { DeployedItem } from "../../entities/DeployedItem";
import type { Laser } from "../../entities/Laser";
import type { Orderly } from "../../entities/Orderly";
import type { Player } from "../../entities/Player";
import { playVfx, ELECTRONICS_SPARK, EMP_BLAST, IMPACT } from "../../entities/Vfx";
import type { AlertState } from "../../systems/AlertState";
import {
  ActiveItemState,
  CHAFF_PACK_DURATION,
  CHAFF_PACK_RADIUS_TILES,
  type ActiveItemsView,
} from "../../systems/ActiveItems";
import { getAudio } from "../../systems/AudioDirector";
import type { CollisionGrid } from "../../systems/CollisionGrid";
import { FLAG_HOSTILE, type ConductState } from "../../systems/Conduct";
import { len, withinOrEqual } from "../../systems/distance";
import {
  BATTERY_ITEM,
  CHAFF_PACK_ITEM,
  RATION_HEAL,
  RATION_PACK_ITEM,
  SACK_LUNCH_ITEM,
  STAPLER_FIELD_COOLDOWN,
  STAPLER_FIELD_MAX_CHARGES,
  STAPLER_FIELD_NOISE,
  STAPLER_FIELD_RANGE_TILES,
  STAPLER_PIN_DURATION,
  STUN_ROUND_DURATION,
  STUN_ROUND_NOISE,
  STUN_ROUND_REACH_TILES,
  STUN_ROUNDS_ITEM,
  THERMAL_GEL_ITEM,
  WEAPON_ARC_DEGREES,
} from "../../systems/EntityStats";
import type { NoiseEvents } from "./NoiseEvents";

/**
 * What each item does when Rowan uses it, and the two weapons that are not items.
 *
 * The verbs only — the *state* they act on (`ActiveItemState`, the deployables,
 * the tracer list) stays on the scene, because a dozen other things read it:
 * the sensing context asks whether the ration is open, the HUD reads the
 * flashlight charge, the radar reads the deployables. Pulling that in here would
 * have replaced one kind of reaching-across with another and made the scene
 * harder to read, not easier.
 *
 * What is owned here is the Rail-Stapler's field cooldown, which nothing outside
 * the firing rule has any business with.
 */

/**
 * Cos of the half-angle of {@link WEAPON_ARC_DEGREES} — the forward arc a dart or a
 * staple can reach. Was the bare `0.5` written out at three call sites.
 */
const WEAPON_ARC_COS = Math.cos((WEAPON_ARC_DEGREES * Math.PI) / 360);

/** Getters for everything `create()` rebinds per level. */
export interface ItemWorld {
  /** The Phaser scene, for VFX and for parenting a deployed item. */
  scene: Phaser.Scene;
  tileSize(): number;
  player(): Player;
  grid(): CollisionGrid;
  alert(): AlertState;
  conduct(): ConductState;
  noise(): NoiseEvents;
  activeItems(): ActiveItemState;
  orderlies(): readonly Orderly[];
  lasers(): readonly Laser[];
  coverTiles(): readonly Cover[];
  /** The EMP zone's graphics layer, drawn between guard cones and bodies. */
  empGfx(): Phaser.GameObjects.Graphics;
  /** Items left on the floor — a deployed Sack Lunch joins this. */
  deployables(): DeployedItem[];
  /** The brief tracer line(s) a stapler shot leaves. */
  fireTracers(): { x1: number; y1: number; x2: number; y2: number; ttl: number }[];
  registry(): Phaser.Data.DataManager;
  /** Records that Rowan spent something — a deviation under NW-SMAC-01's posture. */
  markDeviation(): void;
}

export class ItemActions {
  /** Cooldown for the Rail-Stapler's general-purpose field mode (outside VENT-4). */
  private staplerCooldown = 0;

  constructor(private readonly w: ItemWorld) {}

  /** Whether the stapler's field mode is off cooldown and has a charge left. */
  get staplerFieldReady(): boolean {
    return this.staplerCooldown <= 0 && this.staplerFieldCharges() > 0;
  }

  /** Zeroes the cooldown for a fresh run. */
  reset(): void {
    this.staplerCooldown = 0;
  }

  /** Runs down the stapler's cooldown. */
  tickCooldowns(dt: number): void {
    this.staplerCooldown = Math.max(0, this.staplerCooldown - dt);
  }

  /**
   * Serves the HUD's item-use request, advances the active-item timers, and
   * republishes what the HUD reads back.
   */
  update(dt: number): void {
    const registry = this.w.registry();
    const request = registry.get("itemUseRequest") as string | undefined;
    if (request) {
      registry.remove("itemUseRequest");
      const inv = (registry.get("inventory") as string[] | undefined) ?? [];
      const idx = inv.indexOf(request);
      // The item is spent *after* its effect resolves, and only if the effect says
      // so — a Sack Lunch's first press opens it in the hand and keeps it. Every
      // other consumable answers "yes" and behaves exactly as it always did.
      if (idx !== -1 && this.applyConsumable(request)) {
        inv.splice(idx, 1);
        registry.set("inventory", inv);
        // Spending anything counts as deviating from the posture NW-SMAC-01 holds
        // Rowan in; the charge is applied where the rest of the conduct tick happens.
        this.w.markDeviation();
      }
    }
    const items = this.w.activeItems();
    items.update(dt);
    registry.set("activeItems", {
      chaffRemaining: items.chaffRemaining,
      thermalRemaining: items.thermalRemaining,
      flashlightOwned: items.flashlightOwned,
      flashlightOn: items.flashlightOn,
      flashlightCharge: items.flashlightCharge,
      sackLunchOpened: items.sackLunchOpened,
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
        this.w.activeItems().activateThermalGel();
        return true;
      case RATION_PACK_ITEM:
        this.w.player().heal(RATION_HEAL);
        getAudio().pickup();
        return true;
      case BATTERY_ITEM:
        this.w.activeItems().rechargeFlashlight();
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
    const items = this.w.activeItems();
    if (!items.sackLunchOpened) {
      items.openSackLunch();
      getAudio().pickup();
      return false;
    }
    const player = this.w.player();
    this.w
      .deployables()
      .push(new DeployedItem(this.w.scene, "sackLunch", player.x, player.y, this.w.tileSize()));
    items.resealSackLunch();
    getAudio().pickup();
    return true;
  }

  /**
   * An instant EMP burst centred on the player: blinds guards and cameras (via
   * the chaff zone), suppresses lasers within reach, and breaks any active
   * pursuit into a search — jamming the alert network / clearing alarms.
   */
  private fireChaffBurst(): void {
    const player = this.w.player();
    const ts = this.w.tileSize();
    const scene = this.w.scene;
    this.w.activeItems().activateChaff(player.x, player.y);
    this.w.conduct().violate("HOSTILE", FLAG_HOSTILE);
    this.w.alert().forceEvasion();
    const radiusPx = CHAFF_PACK_RADIUS_TILES * ts;
    for (const laser of this.w.lasers()) {
      if (withinOrEqual(laser.x - player.x, laser.y - player.y, radiusPx)) {
        laser.emp(CHAFF_PACK_DURATION);
        // Each emitter it knocks out sparks where it stands, so the burst's
        // reach is legible rather than implied by the flash alone.
        playVfx(scene, ELECTRONICS_SPARK, laser.x, laser.y, ts);
      }
    }
    playVfx(scene, EMP_BLAST, player.x, player.y, ts);
    scene.cameras.main.flash(200, 120, 200, 255);
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
    const player = this.w.player();
    const ts = this.w.tileSize();
    const reachPx = STUN_ROUND_REACH_TILES * ts;
    const fx = Math.cos(player.facing);
    const fy = Math.sin(player.facing);
    let target: Orderly | undefined;
    let bestDist = Infinity;
    for (const orderly of this.w.orderlies()) {
      const dx = orderly.x - player.x;
      const dy = orderly.y - player.y;
      const dist = len(dx, dy);
      if (dist > reachPx || dist === 0) continue;
      // Only orderlies roughly in front of Rowan — see WEAPON_ARC_DEGREES.
      if ((dx * fx + dy * fy) / dist < WEAPON_ARC_COS) continue;
      if (dist < bestDist) {
        bestDist = dist;
        target = orderly;
      }
    }
    target?.stun(STUN_ROUND_DURATION);
    if (target) playVfx(this.w.scene, IMPACT, target.x, target.y, ts);

    let cover: Cover | undefined;
    let bestCoverDist = Infinity;
    for (const c of this.w.coverTiles()) {
      if (c.isBroken) continue;
      const cx = (c.tileX + 0.5) * ts;
      const cy = (c.tileY + 0.5) * ts;
      const dx = cx - player.x;
      const dy = cy - player.y;
      const dist = len(dx, dy);
      if (dist > reachPx || dist === 0) continue;
      if ((dx * fx + dy * fy) / dist < WEAPON_ARC_COS) continue;
      if (dist < bestCoverDist) {
        bestCoverDist = dist;
        cover = c;
      }
    }
    cover?.destroy();

    this.w.conduct().violate("HOSTILE", FLAG_HOSTILE);
    this.w.noise().emitAt(player.x, player.y, STUN_ROUND_NOISE * ts);
  }

  /** Field-mode shots left this run — see {@link STAPLER_FIELD_MAX_CHARGES}. */
  staplerFieldCharges(): number {
    return (
      (this.w.registry().get("staplerFieldCharges") as number | undefined) ??
      STAPLER_FIELD_MAX_CHARGES
    );
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
  fireStaplerField(): void {
    const ts = this.w.tileSize();
    const player = this.w.player();
    const grid = this.w.grid();
    const reachPx = STAPLER_FIELD_RANGE_TILES * ts;
    const fx = Math.cos(player.facing);
    const fy = Math.sin(player.facing);

    type Target =
      | { x: number; y: number; kind: "cover"; cover: Cover }
      | { x: number; y: number; kind: "orderly"; orderly: Orderly };
    let best: Target | undefined;
    let bestDist = Infinity;

    const consider = (x: number, y: number, candidate: Target): void => {
      const dx = x - player.x;
      const dy = y - player.y;
      const dist = len(dx, dy);
      if (dist > reachPx || dist === 0) return;
      if ((dx * fx + dy * fy) / dist < WEAPON_ARC_COS) return;
      if (!grid.hasLineOfSight(player.x / ts, player.y / ts, x / ts, y / ts)) return;
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    };

    for (const c of this.w.coverTiles()) {
      if (c.isBroken) continue;
      const cx = (c.tileX + 0.5) * ts;
      const cy = (c.tileY + 0.5) * ts;
      consider(cx, cy, { x: cx, y: cy, kind: "cover", cover: c });
    }
    for (const o of this.w.orderlies()) {
      if (o.isImmobilized) continue;
      consider(o.x, o.y, { x: o.x, y: o.y, kind: "orderly", orderly: o });
    }

    this.staplerCooldown = STAPLER_FIELD_COOLDOWN;
    this.w.registry().set("staplerFieldCharges", Math.max(0, this.staplerFieldCharges() - 1));
    if (best) {
      // Cover fires its own effect from `destroy()`; a pinned man does not.
      if (best.kind === "cover") best.cover.destroy();
      else {
        best.orderly.pin(STAPLER_PIN_DURATION);
        playVfx(this.w.scene, IMPACT, best.orderly.x, best.orderly.y, ts);
      }
      this.w
        .fireTracers()
        .push({ x1: player.x, y1: player.y, x2: best.x, y2: best.y, ttl: 0.08 });
      getAudio().railStapler();
    }
    this.w.conduct().violate("HOSTILE", FLAG_HOSTILE);
    this.w.noise().emitAt(player.x, player.y, STAPLER_FIELD_NOISE * ts);
  }

  /** Draws the EMP Grenade's EMP zone while it's live. */
  private drawChaffZone(): void {
    const g = this.w.empGfx();
    g.clear();
    const items = this.w.activeItems();
    if (!items.chaffActive || !items.chaffOrigin) return;
    const { x, y } = items.chaffOrigin;
    const radiusPx = CHAFF_PACK_RADIUS_TILES * this.w.tileSize();
    g.fillStyle(0x7fd8ff, 0.12);
    g.fillCircle(x, y, radiusPx);
    g.lineStyle(2, 0xbdf0ff, 0.6);
    g.strokeCircle(x, y, radiusPx);
  }
}
