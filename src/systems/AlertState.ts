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

export class AlertState {
  phase: AlertPhase = "INFILTRATION";
  private timer = 0;
  /** Last tile position where the player was seen, for search behaviour. */
  lastKnownTile: { x: number; y: number } | null = null;

  /** Call when any guard has full line-of-sight detection on the player. */
  reportSighting(tileX: number, tileY: number): void {
    this.phase = "ALERT";
    this.timer = ALERT_DURATION;
    this.lastKnownTile = { x: tileX, y: tileY };
  }

  update(dt: number): void {
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

  get isCombatAware(): boolean {
    return this.phase !== "INFILTRATION";
  }

  /** Seconds remaining in the current non-infiltration phase (for the HUD). */
  get remaining(): number {
    return Math.max(0, this.timer);
  }
}
