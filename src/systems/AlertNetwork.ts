import type { AlertState } from "./AlertState";

/** One detector's contribution to the network readout. */
export interface NetworkUnit {
  /** 0..1 suspicion meter. */
  detection: number;
  /** True for units that physically converge on a sighting (guards, not cameras). */
  mobile: boolean;
}

/** Everything the alert-network HUD needs to draw one frame. */
export interface AlertNetworkSnapshot {
  /** The global alert phase ("INFILTRATION" | "ALERT" | "EVASION"). */
  status: string;
  /** Total detectors online (guards + cameras). */
  total: number;
  /** Units actively spotting the player (detection past the alerted threshold). */
  alerted: number;
  /** Units suspicious but not yet confirmed. */
  suspicious: number;
  /** Mobile units converging on the last-known tile (0 unless combat-aware). */
  converging: number;
  /** Last known player tile, or null when the network has lost the trail. */
  target: { x: number; y: number } | null;
  /** Seconds until the network relaxes to the next-calmer phase. */
  countdown: number;
}

/** Threshold shared across the codebase for "this unit has spotted the player". */
const ALERTED = 0.66;

/**
 * Aggregates every detector plus the alert FSM into one readout. Pure — never
 * touches Phaser — mirroring {@link buildRadarSnapshot}, so it's cheap per frame
 * and easy to unit-check.
 */
export function buildAlertNetworkSnapshot(
  units: NetworkUnit[],
  alert: AlertState,
): AlertNetworkSnapshot {
  let alerted = 0;
  let suspicious = 0;
  let mobile = 0;
  for (const u of units) {
    if (u.mobile) mobile++;
    if (u.detection > ALERTED) alerted++;
    else if (u.detection > 0) suspicious++;
  }

  return {
    status: alert.phase,
    total: units.length,
    alerted,
    suspicious,
    converging: alert.isCombatAware ? mobile : 0,
    target: alert.lastKnownTile,
    countdown: alert.remaining,
  };
}
