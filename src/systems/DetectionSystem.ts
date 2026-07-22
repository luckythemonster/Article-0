import type { GameLevel } from "../map/types";
import { lightStatsFor, str } from "./EntityStats";

interface LightSource {
  x: number; // pixel centre
  y: number;
  radiusPx: number;
  multiplier: number;
}

/**
 * Turns the `light_sources` and `cover` layers into a spatial detection
 * modifier. When the player stands in a light pool they are easier to spot
 * (multiplier > 1); when they stand on a cover tile detection is dampened.
 *
 * The result is a single function guards query: `multiplierAt(px, py)`.
 */
export class DetectionSystem {
  private readonly lights: LightSource[] = [];
  /** tile key -> cover type ("low" | "high"). */
  private readonly cover = new Map<number, string>();
  private readonly tileSize: number;
  private readonly width: number;

  constructor(level: GameLevel, tileSize: number) {
    this.tileSize = tileSize;
    this.width = level.width;

    const lightLayer = level.layers.find((l) => l.name === "light_sources");
    if (lightLayer) {
      for (const t of lightLayer.tiles) {
        const s = lightStatsFor(t.components);
        this.lights.push({
          x: (t.x + 0.5) * tileSize,
          y: (t.y + 0.5) * tileSize,
          radiusPx: s.radius * tileSize,
          multiplier: s.detectionMultiplier,
        });
      }
    }

    const coverLayer = level.layers.find((l) => l.name === "cover");
    if (coverLayer) {
      for (const t of coverLayer.tiles) {
        const type = str(t.components, "cover", "type", "low").toLowerCase();
        this.cover.set(this.key(t.x, t.y), type);
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

    // Lights raise it, scaled by how deep in the pool the player is.
    for (const l of this.lights) {
      const d = Math.hypot(px - l.x, py - l.y);
      if (d < l.radiusPx) {
        const falloff = 1 - d / l.radiusPx;
        mult *= 1 + (l.multiplier - 1) * falloff;
      }
    }
    return mult;
  }

  /** Cover type at a pixel position, or undefined if the tile has no cover. */
  coverTypeAt(px: number, py: number): string | undefined {
    const tx = Math.floor(px / this.tileSize);
    const ty = Math.floor(py / this.tileSize);
    return this.cover.get(this.key(tx, ty));
  }

  private key(x: number, y: number): number {
    return y * this.width + x;
  }
}
