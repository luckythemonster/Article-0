/**
 * Global Metal Gear-style alert FSM.
 *
 *   INFILTRATION  — undetected, guards patrol normally.
 *   ALERT         — the player has been spotted; guards converge (has a timer).
 *   EVASION       — the player broke line of sight during ALERT; guards search
 *                   the last known area until the timer runs out, then relax.
 *
 * Timers count down in real seconds. When ALERT's timer expires without a fresh
 * sighting we drop to EVASION; when EVASION expires we return to INFILTRATION.
 */
export type AlertPhase = "INFILTRATION" | "ALERT" | "EVASION";

const ALERT_DURATION = 8; // seconds of active pursuit after a sighting
const EVASION_DURATION = 12; // seconds of searching after losing the player

const SECTOR_CAUTION_DURATION = 20; // seconds a searched sector stays CAUTIOUS
const SECTOR_CAUTION_RADIUS = 4; // tiles

export class AlertState {
  phase: AlertPhase = "INFILTRATION";
  private timer = 0;
  /** Last tile position where the player was seen, for search behaviour. */
  lastKnownTile: { x: number; y: number } | null = null;
  /** Sectors a guard recently finished searching/investigating — stay CAUTIOUS. */
  private cautionSectors: { x: number; y: number; timer: number }[] = [];

  /** Call when any guard has full line-of-sight detection on the player. */
  reportSighting(tileX: number, tileY: number): void {
    this.phase = "ALERT";
    this.timer = ALERT_DURATION;
    this.lastKnownTile = { x: tileX, y: tileY };
  }

  /** Marks a tile's sector as recently searched — nearby guards stay CAUTIOUS. */
  noteSectorCaution(tileX: number, tileY: number, seconds: number = SECTOR_CAUTION_DURATION): void {
    const existing = this.cautionSectors.find((s) => s.x === tileX && s.y === tileY);
    if (existing) {
      existing.timer = Math.max(existing.timer, seconds);
    } else {
      this.cautionSectors.push({ x: tileX, y: tileY, timer: seconds });
    }
  }

  /** True when a tile lies within a still-live caution sector. */
  isCautious(tileX: number, tileY: number, radiusTiles: number = SECTOR_CAUTION_RADIUS): boolean {
    return this.cautionSectors.some(
      (s) => Math.hypot(s.x - tileX, s.y - tileY) <= radiusTiles,
    );
  }

  update(dt: number): void {
    for (let i = this.cautionSectors.length - 1; i >= 0; i--) {
      const s = this.cautionSectors[i];
      s.timer -= dt;
      if (s.timer <= 0) this.cautionSectors.splice(i, 1);
    }

    if (this.phase === "INFILTRATION") return;
    this.timer -= dt;
    if (this.timer > 0) return;

    if (this.phase === "ALERT") {
      this.phase = "EVASION";
      this.timer = EVASION_DURATION;
    } else if (this.phase === "EVASION") {
      this.phase = "INFILTRATION";
      this.timer = 0;
      this.lastKnownTile = null;
    }
  }

  /** An EMP jam (Chaff Pack) breaks an active pursuit into a search. No-op outside ALERT. */
  forceEvasion(seconds: number = EVASION_DURATION): void {
    if (this.phase !== "ALERT") return;
    this.phase = "EVASION";
    this.timer = seconds;
  }

  get isCombatAware(): boolean {
    return this.phase !== "INFILTRATION";
  }

  /** Seconds remaining in the current non-infiltration phase (for the HUD). */
  get remaining(): number {
    return Math.max(0, this.timer);
  }
}
