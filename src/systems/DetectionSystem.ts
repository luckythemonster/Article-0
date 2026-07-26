import type { GameLevel } from "../map/types";
import { lightStatsFor, str } from "./EntityStats";

interface LightSource {
  x: number; // pixel centre
  y: number;
  radiusPx: number;
  /** Cached `radiusPx²`, so the reach test never takes a square root. */
  radiusPx2: number;
  multiplier: number;
}

/**
 * Side of one spatial-index bucket, in tiles.
 *
 * {@link DetectionSystem.multiplierAt} is asked once per guard per frame plus
 * once for the player, and it used to answer by walking every light in the
 * level — 49 of them on `main1`, each with a `Math.hypot`. A light only reaches
 * a few tiles, so nearly all of that work was rejecting lights in other rooms.
 *
 * Eight tiles is a comfortable multiple of the largest authored light radius,
 * which keeps the number of buckets a query has to visit at four in the worst
 * case (a point on a bucket corner) while leaving each bucket sparse.
 */
const BUCKET_TILES = 8;

/**
 * Turns the `light_sources` and `cover` layers into a spatial detection
 * modifier. When the player stands in a light pool they are easier to spot
 * (multiplier > 1); when they stand on a cover tile detection is dampened.
 *
 * The result is a single function guards query: `multiplierAt(px, py)`.
 */
export class DetectionSystem {
  /**
   * Bucket key -> the lights whose reach touches that bucket. A light lands in
   * every bucket its radius overlaps, so a lookup only has to scan its own
   * bucket rather than test every light in the level.
   */
  private readonly lightBuckets = new Map<number, LightSource[]>();
  private readonly bucketPx: number;
  /** tile key -> cover type ("low" | "high"). */
  private readonly cover = new Map<number, string>();
  /** Cover tiles that leak body heat, so thermal sensing sees through them. */
  private readonly thermalBleed = new Set<number>();
  private readonly tileSize: number;
  private readonly width: number;

  constructor(level: GameLevel, tileSize: number) {
    this.tileSize = tileSize;
    this.width = level.width;
    this.bucketPx = BUCKET_TILES * tileSize;

    const lightLayer = level.layers.find((l) => l.name === "light_sources");
    if (lightLayer) {
      for (const t of lightLayer.tiles) {
        const s = lightStatsFor(t.components);
        const radiusPx = s.radius * tileSize;
        const light: LightSource = {
          x: (t.x + 0.5) * tileSize,
          y: (t.y + 0.5) * tileSize,
          radiusPx,
          radiusPx2: radiusPx * radiusPx,
          multiplier: s.detectionMultiplier,
        };
        this.indexLight(light);
      }
    }

    const coverLayer = level.layers.find((l) => l.name === "cover");
    if (coverLayer) {
      for (const t of coverLayer.tiles) {
        const type = str(t.components, "cover", "type", "low").toLowerCase();
        this.cover.set(this.key(t.x, t.y), type);
        if (str(t.components, "cover", "ThermalBleed", "false") === "true") {
          this.thermalBleed.add(this.key(t.x, t.y));
        }
      }
    }
  }

  /** Files a light into every spatial bucket its reach can touch. */
  private indexLight(light: LightSource): void {
    const minBx = Math.floor((light.x - light.radiusPx) / this.bucketPx);
    const maxBx = Math.floor((light.x + light.radiusPx) / this.bucketPx);
    const minBy = Math.floor((light.y - light.radiusPx) / this.bucketPx);
    const maxBy = Math.floor((light.y + light.radiusPx) / this.bucketPx);
    for (let by = minBy; by <= maxBy; by++) {
      for (let bx = minBx; bx <= maxBx; bx++) {
        const k = bx * 73856093 + by * 19349663;
        const bucket = this.lightBuckets.get(k);
        if (bucket) bucket.push(light);
        else this.lightBuckets.set(k, [light]);
      }
    }
  }

  /** Detection sensitivity at a pixel position (1 = neutral). */
  multiplierAt(px: number, py: number): number {
    let mult = 1;

    // Standing on cover cuts visibility.
    const tx = Math.floor(px / this.tileSize);
    const ty = Math.floor(py / this.tileSize);
    if (this.cover.has(this.key(tx, ty))) mult *= 0.4;

    // Lights raise it, scaled by how deep in the pool the player is. Only the
    // lights filed against this point's bucket can possibly reach it.
    const bx = Math.floor(px / this.bucketPx);
    const by = Math.floor(py / this.bucketPx);
    const bucket = this.lightBuckets.get(bx * 73856093 + by * 19349663);
    if (!bucket) return mult;
    for (const l of bucket) {
      const dx = px - l.x;
      const dy = py - l.y;
      const d2 = dx * dx + dy * dy;
      // Reject on squared distance; only a light we're actually inside pays for
      // the square root the falloff needs.
      if (d2 >= l.radiusPx2) continue;
      const falloff = 1 - Math.sqrt(d2) / l.radiusPx;
      mult *= 1 + (l.multiplier - 1) * falloff;
    }
    return mult;
  }

  /** Cover type at a pixel position, or undefined if the tile has no cover. */
  coverTypeAt(px: number, py: number): string | undefined {
    const tx = Math.floor(px / this.tileSize);
    const ty = Math.floor(py / this.tileSize);
    return this.cover.get(this.key(tx, ty));
  }

  /** True when the cover here leaks body heat — thermal sensing sees through it. */
  thermalBleedAt(px: number, py: number): boolean {
    const tx = Math.floor(px / this.tileSize);
    const ty = Math.floor(py / this.tileSize);
    return this.thermalBleed.has(this.key(tx, ty));
  }

  /** Thermal Gel zeroes every ThermalDetectionRadius check for its duration. */
  thermalRadiusFor(baseTiles: number, thermalMasked: boolean): number {
    return thermalMasked ? 0 : baseTiles;
  }

  private key(x: number, y: number): number {
    return y * this.width + x;
  }
}
