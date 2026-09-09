import type { AlertState } from "./AlertState";
import { withinOrEqual } from "./distance";

/** One detector's contribution to the network readout. */
export interface NetworkUnit {
  /** 0..1 suspicion meter. */
  detection: number;
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

/** A blank snapshot to fill — hold one per scene and pass it back in each frame. */
export function emptyAlertNetworkSnapshot(): AlertNetworkSnapshot {
  return {
    status: "INFILTRATION",
    total: 0,
    alerted: 0,
    suspicious: 0,
    converging: 0,
    target: null,
    countdown: 0,
  };
}

/**
 * Aggregates every detector plus the alert FSM into one readout. Pure — never
 * touches Phaser — mirroring {@link buildRadarSnapshot}, so it's cheap per frame
 * and easy to unit-check.
 *
 * Mobile and fixed detectors arrive as two arrays rather than one list of
 * tagged units: "mobile" was only ever "is this a guard rather than a camera",
 * which the caller already knows, and merging the two cost a pair of mapped
 * arrays plus an object per detector on every frame.
 *
 * Reuses `into` rather than allocating a fresh object per frame to eliminate GC pressure.
 *
 * @param mobile units that physically converge on a sighting — guards.
 * @param fixed units that only watch — cameras.
 * @param into reusable snapshot buffer to write into.
 */
export function buildAlertNetworkSnapshot(
  mobile: readonly NetworkUnit[],
  fixed: readonly NetworkUnit[],
  alert: AlertState,
  into: AlertNetworkSnapshot = emptyAlertNetworkSnapshot(),
): AlertNetworkSnapshot {
  let alerted = 0;
  let suspicious = 0;
  for (let i = 0; i < mobile.length; i++) {
    const d = mobile[i].detection;
    if (d > ALERTED) alerted++;
    else if (d > 0) suspicious++;
  }
  for (let i = 0; i < fixed.length; i++) {
    const d = fixed[i].detection;
    if (d > ALERTED) alerted++;
    else if (d > 0) suspicious++;
  }

  into.status = alert.phase;
  into.total = mobile.length + fixed.length;
  into.alerted = alerted;
  into.suspicious = suspicious;
  into.converging = alert.isCombatAware ? mobile.length : 0;
  into.target = alert.lastKnownTile;
  into.countdown = alert.remaining;
  return into;
}

/**
 * Anti-exploit: tracks recent noise pings by tile so repeated distractions
 * in the same area stop being free. Record each ping's origin tile; once more
 * than `threshold` pings land within `radiusTiles` of a new one inside
 * `windowSec`, guards should skip individual SUSPICIOUS investigation and
 * escalate straight to a base-wide alert instead.
 */
export class NoiseSpamTracker {
  private pings: { x: number; y: number; time: number }[] = [];

  constructor(
    private readonly radiusTiles: number = 4,
    private readonly windowSec: number = 10,
    private readonly threshold: number = 2,
  ) {}

  /** Records a ping at (tileX, tileY) at `now` (seconds) and reports spam. */
  record(tileX: number, tileY: number, now: number): boolean {
    this.pings = this.pings.filter((p) => now - p.time <= this.windowSec);
    const nearby = this.pings.filter(
      (p) => withinOrEqual(p.x - tileX, p.y - tileY, this.radiusTiles),
    ).length;
    this.pings.push({ x: tileX, y: tileY, time: now });
    // Include the ping just recorded: > threshold pings (e.g. a 3rd within a
    // threshold of 2) counts as spam.
    return nearby + 1 > this.threshold;
  }
}
