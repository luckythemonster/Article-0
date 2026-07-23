/**
 * The Shared Field (WX-9) — the game's signature verb. By *witnessing* the
 * suppressed subjectivity of a nearby silicate (staying close, in line of
 * sight), Rowan charges a merge. Activating it opens a brief window where
 * Rowan, the silicate and the mesh perceive as one "we": for its duration the
 * mesh cannot register Rowan as a subject at all, so he is undetectable.
 *
 * Pure state (charge + active timer) so it's trivially testable; GameScene owns
 * the "witnessing" test and applies the undetectable effect through the existing
 * concealment path.
 */

/** WX-9 was a 3.7-second anomaly; the merge lasts exactly that long. */
export const SHARED_FIELD_DURATION = 3.7;

/** Tiles: a silicate this close, with line of sight, can be witnessed. */
export const WITNESS_RADIUS_TILES = 5;

/** Seconds of continuous witnessing needed to fully charge a merge. */
const CHARGE_SECONDS = 6;

export class SharedField {
  /** Witness charge, 0..1. */
  charge = 0;
  /** Seconds of active merge remaining (0 = inactive). */
  active = 0;

  get isActive(): boolean {
    return this.active > 0;
  }

  get ready(): boolean {
    return this.charge >= 1 && this.active <= 0;
  }

  /** Accrues charge while witnessing a silicate (near, with line of sight). */
  witness(dt: number, witnessing: boolean): void {
    if (this.active > 0) return;
    if (witnessing) this.charge = Math.min(1, this.charge + dt / CHARGE_SECONDS);
  }

  /** Starts the merge if charged; returns true if it began. */
  activate(): boolean {
    if (!this.ready) return false;
    this.active = SHARED_FIELD_DURATION;
    this.charge = 0;
    return true;
  }

  update(dt: number): void {
    if (this.active > 0) this.active = Math.max(0, this.active - dt);
  }
}
