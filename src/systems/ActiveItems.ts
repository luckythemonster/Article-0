/**
 * Active-item state: the Chaff Pack (EMP burst) and Thermal Gel (thermal mask)
 * consumable timers, plus the flashlight equipment (owned / on / battery
 * charge). Pure dt-driven state — GameScene owns the instance, ticks it every
 * frame, and applies the effects through the detection context / lighting.
 */

import {
  CHAFF_EMP_DURATION,
  CHAFF_EMP_RADIUS_TILES,
  FLASHLIGHT_DRAIN_SECONDS,
  THERMAL_GEL_SECONDS,
} from "./EntityStats";

/** Seconds a Chaff Pack's EMP burst blinds guards / disables electronics. */
export const CHAFF_PACK_DURATION = CHAFF_EMP_DURATION;
/** Radius (tiles) of a Chaff Pack's EMP burst, centred on the player. */
export const CHAFF_PACK_RADIUS_TILES = CHAFF_EMP_RADIUS_TILES;
/** Seconds a Thermal Gel dose zeroes thermal detection. */
export const THERMAL_GEL_DURATION = THERMAL_GEL_SECONDS;

export class ActiveItemState {
  private chaffTimer = 0;
  /** World position the Chaff Pack was used at; null while inactive. */
  chaffOrigin: { x: number; y: number } | null = null;
  private thermalTimer = 0;

  /** Rowan starts equipped with a full flashlight. */
  private flashlightOwnedFlag = true;
  private flashlightOnFlag = false;
  /** Battery level, 0..1. */
  private flashlightChargeLevel = 1;

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
}
