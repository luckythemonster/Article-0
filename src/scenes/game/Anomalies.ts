import type { Chest } from "../../entities/Chest";
import type { Door } from "../../entities/Door";
import type { Enforcer, GuardAnomaly } from "../../entities/Enforcer";
import type { Laser } from "../../entities/Laser";
import type { Orderly } from "../../entities/Orderly";
import type { Sensor } from "../../entities/Sensor";

/**
 * Everything a guard's cone could notice as out of place this frame: doors left
 * open, chests emptied, emitters knocked out, bodies on the floor.
 *
 * A body that has been stashed in a locker is reported by none of it — see
 * `src/entities/Locker.ts`. That is the whole of what stashing does, and it has
 * to be enforced here rather than by hiding the sprite, because a cone reads this
 * list and not the screen.
 *
 * The allocation discipline is the reason this is a class rather than a
 * function. It runs every frame, and each entry used to be a fresh object
 * carrying a freshly interpolated `key` string. Entries are recycled in place
 * and only their fields rewritten, so the steady state allocates nothing — the
 * pool has to outlive the call, which means it has to be owned by something.
 *
 * The list is borrowed by the sensing context for the frame and **must not be
 * retained past it** — guards copy the `key` and the coordinates they care
 * about, which is what makes that safe.
 */

/**
 * All getters, because this module is built as a field initializer — Phaser's
 * `scene.restart()` re-runs `create()` on the same instance, so the pool
 * deliberately outlives a level change and cannot capture anything `create()`
 * sets, `tileSize` included.
 */
export interface AnomalyWorld {
  tileSize(): number;
  doors(): readonly Door[];
  chests(): readonly Chest[];
  lasers(): readonly Laser[];
  sensors(): readonly Sensor[];
  orderlies(): readonly Orderly[];
  guards(): readonly Enforcer[];
}

export class Anomalies {
  private readonly buf: GuardAnomaly[] = [];
  private readonly pool: GuardAnomaly[] = [];

  constructor(private readonly w: AnomalyWorld) {}

  /** Refills and returns the frame's anomaly list. Valid until the next call. */
  build(chaffZone: { x: number; y: number; radiusPx: number } | null): GuardAnomaly[] {
    const anomalies = this.buf;
    anomalies.length = 0;

    const ts = this.w.tileSize();

    for (const door of this.w.doors()) {
      if (!door.isOpen) continue;
      this.push((door.tileX + 0.5) * ts, (door.tileY + 0.5) * ts, door.tileX, door.tileY, "door", "door");
    }

    for (const chest of this.w.chests()) {
      if (!chest.isOpen) continue;
      this.push(chest.x, chest.y, chest.tileX, chest.tileY, "chest", "chest");
    }

    for (const laser of this.w.lasers()) {
      if (!laser.isEmped) continue;
      this.push(
        laser.x,
        laser.y,
        Math.floor(laser.x / ts),
        Math.floor(laser.y / ts),
        "device",
        "device:laser",
      );
    }

    if (chaffZone) {
      const r2 = chaffZone.radiusPx * chaffZone.radiusPx;
      for (const sensor of this.w.sensors()) {
        const dx = sensor.x - chaffZone.x;
        const dy = sensor.y - chaffZone.y;
        if (dx * dx + dy * dy > r2) continue;
        this.push(
          sensor.x,
          sensor.y,
          Math.floor(sensor.x / ts),
          Math.floor(sensor.y / ts),
          "device",
          "device:camera",
        );
      }
    }

    for (const guard of this.w.guards()) {
      // A guard on the floor is the loudest thing in the room, so it reports
      // before anything a patrol might merely find odd. Stashed ones report
      // nothing at all — that is what stashing is.
      if (!guard.isDown || guard.isStashed) continue;
      this.push(
        guard.x,
        guard.y,
        Math.floor(guard.x / ts),
        Math.floor(guard.y / ts),
        "downedGuard",
        "guard",
      );
    }

    for (const orderly of this.w.orderlies()) {
      if (orderly.isStashed) continue;
      if (orderly.isStunned) {
        this.push(
          orderly.x,
          orderly.y,
          Math.floor(orderly.x / ts),
          Math.floor(orderly.y / ts),
          "stunnedOrderly",
          "orderly",
        );
      } else if (orderly.isPinned) {
        this.push(
          orderly.x,
          orderly.y,
          Math.floor(orderly.x / ts),
          Math.floor(orderly.y / ts),
          "pinnedOrderly",
          "orderly",
        );
      } else if (orderly.isSurrendered) {
        // Last, so a man surrendered and then darted reports as darted: the dart is
        // the longer-lasting and harder evidence, and it is what a patrol should be
        // reacting to once both are true.
        this.push(
          orderly.x,
          orderly.y,
          Math.floor(orderly.x / ts),
          Math.floor(orderly.y / ts),
          "surrenderedOrderly",
          "orderly",
        );
      }
    }

    return anomalies;
  }

  /**
   * Appends one anomaly, recycling the pool entry at that index when there is
   * one. The `key` is `<prefix>:<tx>:<ty>` and only re-interpolated when the
   * tile it names actually moves — a door never does, so a level's worth of
   * open doors costs no string building after the first frame.
   */
  private push(
    x: number,
    y: number,
    tx: number,
    ty: number,
    kind: GuardAnomaly["kind"],
    keyPrefix: string,
  ): void {
    const i = this.buf.length;
    const slot = this.pool[i];
    if (!slot) {
      this.pool[i] = { x, y, tx, ty, kind, key: `${keyPrefix}:${tx}:${ty}` };
      this.buf.push(this.pool[i]);
      return;
    }
    if (slot.tx !== tx || slot.ty !== ty || slot.kind !== kind) {
      slot.key = `${keyPrefix}:${tx}:${ty}`;
    }
    slot.x = x;
    slot.y = y;
    slot.tx = tx;
    slot.ty = ty;
    slot.kind = kind;
    this.buf.push(slot);
  }
}
