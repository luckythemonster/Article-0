import { VENT4_DEFAULTS, type Vent4Stats } from "./EntityStats";

/**
 * VENT-4's environmental forces on the player: radial intake suction, grip
 * against it (steel columns / piton holds), air-jet impulses, and the Phase-3
 * heat/condensate-cooling model.
 *
 * Pure (no Phaser). The scene adds the returned velocity to the player's
 * arcade body every frame *after* Player.update — the player re-sets its
 * velocity from input each tick, so forces must be re-applied per frame and
 * one-shot jets live here as a decaying impulse vector.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vent4Layout {
  /** Turbine centre, px. */
  hub: Vec2;
  /** Steel-column centres, px (grip anchors). */
  columns: Vec2[];
  /** Piton-point centres, px (hold E to anchor). */
  pitons: Vec2[];
  /** Condensate-drip tile centres, px. */
  drips: Vec2[];
}

export interface Vent4Forces {
  /** Velocity to add to the player body this frame, px/s. */
  vx: number;
  vy: number;
  /** Gripping a column or holding a piton (pull zeroed). */
  anchored: boolean;
  /** Inside the intake's damage radius around the hub. */
  inIntake: boolean;
}

/**
 * Radial pull toward the hub: zero at suctionRadius, ramping linearly to
 * suctionMax at the hub's edge.
 */
export function suctionVelocity(
  px: number,
  py: number,
  hub: Vec2,
  tileSize: number,
  stats: Vent4Stats = VENT4_DEFAULTS,
): Vec2 {
  const dx = hub.x - px;
  const dy = hub.y - py;
  const d = Math.hypot(dx, dy);
  const outer = stats.suctionRadius * tileSize;
  const inner = stats.hubRadius * tileSize;
  if (d >= outer || d < 1e-6) return { x: 0, y: 0 };
  const t = Math.min(1, (outer - d) / (outer - inner));
  const mag = stats.suctionMax * tileSize * t;
  return { x: (dx / d) * mag, y: (dy / d) * mag };
}

export class Vent4PhysicsSystem {
  /** 0..1 — Phase-2 gauge; drains under un-anchored suction. */
  grip = 1;
  /** 0..1 — Phase-3 gauge; overheating at 1. */
  heat = 0;
  /** Seconds of zeroed thermal signature left after a condensate drip. */
  thermalNullLeft = 0;
  private impulseX = 0;
  private impulseY = 0;

  constructor(
    private readonly layout: Vent4Layout,
    private readonly tileSize: number,
    private readonly stats: Vent4Stats = VENT4_DEFAULTS,
  ) {}

  /** Queue a one-shot push (air jet / correction burst), px/s. Decays fast. */
  addImpulse(vx: number, vy: number): void {
    this.impulseX += vx;
    this.impulseY += vy;
  }

  /** Index of the nearest piton within reach, or null. */
  nearestPiton(px: number, py: number, maxDistTiles: number): number | null {
    let best: number | null = null;
    let bestDist = maxDistTiles * this.tileSize;
    this.layout.pitons.forEach((p, i) => {
      const d = Math.hypot(p.x - px, p.y - py);
      if (d <= bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  /** Standing under a condensate drip tile. */
  onDrip(px: number, py: number): boolean {
    return this.layout.drips.some(
      (d) => Math.hypot(d.x - px, d.y - py) <= this.tileSize * 0.75,
    );
  }

  /** The purge's thermal scan sees the player only while hot and un-cooled. */
  get thermalVisible(): boolean {
    return this.heat > 0.35 && this.thermalNullLeft <= 0;
  }

  update(
    dt: number,
    px: number,
    py: number,
    opts: { suction: boolean; purge: boolean; holdingPiton: boolean },
  ): Vent4Forces {
    const s = this.stats;
    const ts = this.tileSize;

    // Impulses decay exponentially (~gone in half a second).
    const decay = Math.exp(-6 * dt);
    this.impulseX *= decay;
    this.impulseY *= decay;

    const anchored =
      opts.holdingPiton ||
      this.layout.columns.some((c) => Math.hypot(c.x - px, c.y - py) <= s.gripRadius * ts);

    let pull: Vec2 = { x: 0, y: 0 };
    if (opts.suction && !anchored) {
      pull = suctionVelocity(px, py, this.layout.hub, ts, s);
      const pulled = pull.x !== 0 || pull.y !== 0;
      if (pulled) {
        this.grip = Math.max(0, this.grip - dt / s.gripDrainTime);
        if (this.grip <= 0) {
          pull.x *= s.exhaustedPullMultiplier;
          pull.y *= s.exhaustedPullMultiplier;
        }
      } else {
        this.grip = Math.min(1, this.grip + dt / s.gripRegenTime);
      }
    } else {
      this.grip = Math.min(1, this.grip + dt / s.gripRegenTime);
    }

    this.thermalNullLeft = Math.max(0, this.thermalNullLeft - dt);
    if (this.onDrip(px, py)) {
      this.heat = 0;
      this.thermalNullLeft = s.dripCoolDuration;
    } else if (opts.purge) {
      this.heat = Math.min(1, this.heat + dt / s.heatTime);
    } else {
      this.heat = Math.max(0, this.heat - (2 * dt) / s.heatTime);
    }

    const hubDist = Math.hypot(this.layout.hub.x - px, this.layout.hub.y - py);
    return {
      vx: pull.x + this.impulseX,
      vy: pull.y + this.impulseY,
      anchored,
      inIntake: opts.suction && hubDist < s.intakeRadius * ts,
    };
  }
}
