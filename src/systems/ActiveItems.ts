/**
 * Active-item timers: the Chaff Pack (EMP jam) and Thermal Gel (thermal mask)
 * consumables triggered from the HUD hotkeys. Pure dt-decremented state, same
 * shape as {@link "./SharedField".SharedField} — GameScene owns the instance,
 * ticks it every frame, and applies the effects through the detection context.
 */

/** Seconds a Chaff Pack's EMP zone blinds guards caught inside it. */
export const CHAFF_PACK_DURATION = 8;
/** Radius (tiles) of a Chaff Pack's EMP zone, centred where it was used. */
export const CHAFF_PACK_RADIUS_TILES = 4;
/** Seconds a Thermal Gel dose zeroes thermal detection. */
export const THERMAL_GEL_DURATION = 15;

export class ActiveItemState {
  private chaffTimer = 0;
  /** World position the Chaff Pack was used at; null while inactive. */
  chaffOrigin: { x: number; y: number } | null = null;
  private thermalTimer = 0;

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

  activateChaff(x: number, y: number): void {
    this.chaffTimer = CHAFF_PACK_DURATION;
    this.chaffOrigin = { x, y };
  }

  activateThermalGel(): void {
    this.thermalTimer = THERMAL_GEL_DURATION;
  }

  update(dt: number): void {
    if (this.chaffTimer > 0) {
      this.chaffTimer = Math.max(0, this.chaffTimer - dt);
      if (this.chaffTimer === 0) this.chaffOrigin = null;
    }
    if (this.thermalTimer > 0) this.thermalTimer = Math.max(0, this.thermalTimer - dt);
  }
}

/** Snapshot published to the registry for the HUD. */
export interface ActiveItemsView {
  chaffRemaining: number;
  thermalRemaining: number;
}
