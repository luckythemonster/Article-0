import type { Chest } from "../../entities/Chest";
import type { Door } from "../../entities/Door";
import type { Enforcer } from "../../entities/Enforcer";
import type { Orderly } from "../../entities/Orderly";
import type { Terminal } from "../../entities/Terminal";
import type { AlertState } from "../../systems/AlertState";
import type { NoiseSpamTracker } from "../../systems/AlertNetwork";
import type { CollisionGrid } from "../../systems/CollisionGrid";
import { len, within } from "../../systems/distance";

/**
 * How sound travels through the level, and who reacts to it.
 *
 * Everything that makes a noise routes through here: a door being worked, a
 * chest being opened, an orderly raising the alarm, and the player's knock.
 * They differ only in where the sound starts and how far it carries, which is
 * the argument list rather than five separate code paths.
 *
 * Guards and orderlies react differently and deliberately so. A guard hears a
 * noise and investigates it at strength proportional to how close it was; an
 * orderly just wanders over to look. The player's knock does both, which is
 * what makes it a lure rather than a mistake.
 */

/** Radius (tiles) a spotted orderly's alarm carries to nearby guards. */
export const ORDERLY_ALERT_RADIUS_TILES = 6;

/** Radius (tiles) a knock's noise carries — between a door (4) and an orderly (6). */
export const KNOCK_NOISE_TILES = 5;

/** Backup radius (tiles) when repeated pings in one area escalate to ALERT. */
export const SPAM_ESCALATION_RADIUS_TILES = 8;

/** The live level state noise propagation reads. Held by reference. */
export interface NoiseWorld {
  tileSize: number;
  grid: CollisionGrid;
  alert: AlertState;
  noiseSpam: NoiseSpamTracker;
  guards: readonly Enforcer[];
  /** The player, live — rallied guards are told to look at them, not at the noise. */
  player: { x: number; y: number };
  orderlies: readonly Orderly[];
  doors: readonly Door[];
  chests: readonly Chest[];
  terminals: readonly Terminal[];
  /** Seconds since the game booted — the spam tracker's clock. */
  now: () => number;
}

export class NoiseEvents {
  constructor(private readonly w: NoiseWorld) {}

  /**
   * Minor investigations (a single noise ping) never broadcast over the alert
   * network — only the individual guard(s) in earshot react. But repeated
   * pings in the same area within a short window are a distraction exploit:
   * once {@link NoiseSpamTracker} flags spam, skip per-guard investigation
   * entirely and radio it in as a confirmed sighting instead.
   */
  emitAt(cx: number, cy: number, radiusPx: number): void {
    if (radiusPx <= 0) return;
    const w = this.w;
    const tx = Math.floor(cx / w.tileSize);
    const ty = Math.floor(cy / w.tileSize);
    if (w.noiseSpam.record(tx, ty, w.now())) {
      w.alert.reportSighting(tx, ty);
      this.broadcast(cx, cy, SPAM_ESCALATION_RADIUS_TILES);
      return;
    }
    for (const e of w.guards) {
      const d = len(e.x - cx, e.y - cy);
      if (d < radiusPx) e.hearNoise(1 - d / radiusPx, cx, cy);
    }
  }

  /** A door operating: nearby guards turn to look and grow wary. */
  doorOperated(door: Door): void {
    const ts = this.w.tileSize;
    this.emitAt(
      (door.tileX + 0.5) * ts,
      (door.tileY + 0.5) * ts,
      door.stats.operationNoise * ts,
    );
  }

  /** A spotted orderly raises the alarm: nearby guards turn to look. */
  orderlyAlarm(orderly: Orderly): void {
    this.emitAt(orderly.x, orderly.y, ORDERLY_ALERT_RADIUS_TILES * this.w.tileSize);
  }

  /**
   * A confirmed sighting propagates through the alert network: every guard
   * within the spotter's radius snaps to look toward the player and grows wary,
   * so a camera or a distant guard tripping the alarm immediately rallies the
   * ones nearby.
   *
   * The origin is where the *sighting* happened; what the rallied guards are
   * told to look at is the player. Those differ whenever the spotter is a
   * camera across the room, and conflating them would send guards to stare at
   * the camera.
   */
  broadcast(originX: number, originY: number, radiusTiles: number): void {
    const radiusPx = radiusTiles * this.w.tileSize;
    if (radiusPx <= 0) return;
    const r2 = radiusPx * radiusPx;
    const { x: lookX, y: lookY } = this.w.player;
    for (const e of this.w.guards) {
      if (e.x === originX && e.y === originY) continue; // skip the spotter itself
      const dx = e.x - originX;
      const dy = e.y - originY;
      if (dx * dx + dy * dy < r2) e.hearNoise(1, lookX, lookY);
    }
  }

  /**
   * Rap on an adjacent wall or object. The noise originates at *that tile*, not
   * at the player, so guards and orderlies in earshot converge on the spot
   * while Rowan slips past.
   *
   * Returns false when there is nothing knockable next to the player, so the
   * caller can decline to spend the cooldown on a whiff.
   */
  knock(playerX: number, playerY: number, facing: number): boolean {
    const target = this.findKnockTarget(playerX, playerY, facing);
    if (!target) return false;
    const ts = this.w.tileSize;
    const cx = (target.tx + 0.5) * ts;
    const cy = (target.ty + 0.5) * ts;
    const radiusPx = KNOCK_NOISE_TILES * ts;
    this.emitAt(cx, cy, radiusPx); // guards, via the shared noise pipeline
    this.distractOrderlies(cx, cy, radiusPx); // orderlies walk over to look
    return true;
  }

  /**
   * The wall/object a knock lands on: the tile one step along the player's
   * facing if it's knockable, else the nearest knockable of the 8 neighbours,
   * biased toward the facing direction.
   */
  private findKnockTarget(
    px: number,
    py: number,
    facing: number,
  ): { tx: number; ty: number } | null {
    const ts = this.w.tileSize;
    const fx = Math.cos(facing);
    const fy = Math.sin(facing);

    const aheadX = Math.floor((px + fx * ts) / ts);
    const aheadY = Math.floor((py + fy * ts) / ts);
    if (this.isKnockable(aheadX, aheadY)) return { tx: aheadX, ty: aheadY };

    const ptx = Math.floor(px / ts);
    const pty = Math.floor(py / ts);
    let best: { tx: number; ty: number } | null = null;
    let bestScore = -Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = ptx + dx;
        const ty = pty + dy;
        if (!this.isKnockable(tx, ty)) continue;
        // Prefer neighbours that lie in the direction the player is facing.
        const score = (dx * fx + dy * fy) / len(dx, dy);
        if (score > bestScore) {
          bestScore = score;
          best = { tx, ty };
        }
      }
    }
    return best;
  }

  /** True when a tile holds something to knock on: a wall, door, chest or terminal. */
  private isKnockable(tx: number, ty: number): boolean {
    const w = this.w;
    if (!w.grid.inBounds(tx, ty)) return false;
    if (w.grid.isBlocked(tx, ty)) return true;
    if (w.doors.some((d) => d.tileX === tx && d.tileY === ty)) return true;
    if (w.chests.some((c) => c.tileX === tx && c.tileY === ty)) return true;
    return w.terminals.some(
      (t) => Math.floor(t.x / w.tileSize) === tx && Math.floor(t.y / w.tileSize) === ty,
    );
  }

  /** A knock draws nearby orderlies over to investigate (guards use {@link emitAt}). */
  private distractOrderlies(cx: number, cy: number, radiusPx: number): void {
    if (radiusPx <= 0) return;
    for (const orderly of this.w.orderlies) {
      if (within(orderly.x - cx, orderly.y - cy, radiusPx)) orderly.distract(cx, cy);
    }
  }
}
