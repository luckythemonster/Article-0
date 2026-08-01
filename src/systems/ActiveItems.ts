/**
 * Active-item state: the EMP Grenade (EMP burst) and Thermal Gel (thermal mask)
 * consumable timers, the flashlight equipment (owned / on / battery charge), and
 * whether the held Sack Lunch is open. Pure dt-driven state — GameScene owns the
 * instance, ticks it every frame, and applies the effects through the detection
 * context / lighting.
 *
 * The Sack Lunch's SEALED/OPENED flag lives here for the same reason the
 * flashlight's charge does: the inventory is a flat list of *names*, so anything
 * an item does over time has to be held beside it rather than inside it. And like
 * the flashlight's charge it is deliberately not part of `SaveData` — a fresh run,
 * a loaded save or a level change all hand the bag back sealed.
 */

import {
  CHAFF_EMP_DURATION,
  CHAFF_EMP_RADIUS_TILES,
  FLASHLIGHT_DRAIN_SECONDS,
  THERMAL_GEL_SECONDS,
} from "./EntityStats";

/** Seconds an EMP Grenade's EMP burst blinds guards / disables electronics. */
export const CHAFF_PACK_DURATION = CHAFF_EMP_DURATION;
/** Radius (tiles) of an EMP Grenade's EMP burst, centred on the player. */
export const CHAFF_PACK_RADIUS_TILES = CHAFF_EMP_RADIUS_TILES;
/** Seconds a Thermal Gel dose zeroes thermal detection. */
export const THERMAL_GEL_DURATION = THERMAL_GEL_SECONDS;

export class ActiveItemState {
  private chaffTimer = 0;
  /** World position the EMP Grenade was used at; null while inactive. */
  chaffOrigin: { x: number; y: number } | null = null;
  private thermalTimer = 0;

  /** Rowan starts equipped with a full flashlight. */
  private flashlightOwnedFlag = true;
  private flashlightOnFlag = false;
  /** Battery level, 0..1. */
  private flashlightChargeLevel = 1;
  /** True while a held Sack Lunch is OPENED rather than SEALED. */
  private sackLunchOpenedFlag = false;

  get chaffActive(): boolean {
    return this.chaffTimer > 0;
  }

  get chaffRemaining(): number {
    return this.chaffTimer;
  }

  get thermalMasked(): boolean {
    return this.thermalTimer > 0;
  }

  get thermalRemaining(): number {
    return this.thermalTimer;
  }

  get flashlightOwned(): boolean {
    return this.flashlightOwnedFlag;
  }

  get flashlightOn(): boolean {
    return this.flashlightOnFlag;
  }

  get flashlightCharge(): number {
    return this.flashlightChargeLevel;
  }

  /** True while the flashlight is actually emitting a beam (on and not dead). */
  get flashlightBeamActive(): boolean {
    return this.flashlightOnFlag && this.flashlightChargeLevel > 0;
  }

  activateChaff(x: number, y: number): void {
    this.chaffTimer = CHAFF_PACK_DURATION;
    this.chaffOrigin = { x, y };
  }

  activateThermalGel(): void {
    this.thermalTimer = THERMAL_GEL_DURATION;
  }

  /** Toggles the flashlight; a no-op when it isn't owned or the battery is dead. */
  toggleFlashlight(): void {
    if (!this.flashlightOwnedFlag) return;
    if (!this.flashlightOnFlag && this.flashlightChargeLevel <= 0) return;
    this.flashlightOnFlag = !this.flashlightOnFlag;
  }

  /** Restores the flashlight battery to 100% (Battery consumable). */
  rechargeFlashlight(): void {
    this.flashlightChargeLevel = 1;
  }

  /** True while Rowan is holding an opened ration — the penalty *and* the buffer. */
  get sackLunchOpened(): boolean {
    return this.sackLunchOpenedFlag;
  }

  /** SEALED → OPENED. The lunch stays in the inventory; only its state changes. */
  openSackLunch(): void {
    this.sackLunchOpenedFlag = true;
  }

  /**
   * OPENED → (deployed, or gone). Called when the open lunch leaves Rowan's hands.
   *
   * A player carrying several is carrying one *open* one at most, so any remaining
   * copies are sealed again — which is also what keeps the flag honest when the
   * last lunch is deployed and the inventory no longer has one to be open.
   */
  resealSackLunch(): void {
    this.sackLunchOpenedFlag = false;
  }

  update(dt: number): void {
    if (this.chaffTimer > 0) {
      this.chaffTimer = Math.max(0, this.chaffTimer - dt);
      if (this.chaffTimer === 0) this.chaffOrigin = null;
    }
    if (this.thermalTimer > 0) this.thermalTimer = Math.max(0, this.thermalTimer - dt);

    // Drain the battery while the beam is on; cut out at empty.
    if (this.flashlightOnFlag && this.flashlightChargeLevel > 0) {
      this.flashlightChargeLevel = Math.max(0, this.flashlightChargeLevel - dt / FLASHLIGHT_DRAIN_SECONDS);
      if (this.flashlightChargeLevel === 0) this.flashlightOnFlag = false;
    }
  }
}

/** Snapshot published to the registry for the HUD. */
export interface ActiveItemsView {
  chaffRemaining: number;
  thermalRemaining: number;
  flashlightOwned: boolean;
  flashlightOn: boolean;
  flashlightCharge: number;
  /** A held Sack Lunch is OPENED — the HUD says so, since it costs to carry that way. */
  sackLunchOpened: boolean;
}
