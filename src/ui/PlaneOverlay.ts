import type Phaser from "phaser";
import { canopyCells, deckCells, CANOPY, PLANE_FLOOR } from "../map/planes";
import type { GameLevel } from "../map/types";
import { UNDER_ALPHA } from "../render/depths";
import type { BakedPlane } from "../map/TileBake";

/**
 * Fades the surfaces the player is standing *underneath*.
 *
 * `roof_array` roofs a chunk of its deck (`rain_cover`, 255 tiles) and both
 * two-plane levels run a gantry over ground you can walk on. Drawn honestly,
 * both hide the player: the roof sits above the world it covers, and the deck
 * draws over the floor by construction. Walking under either would mean walking
 * blind.
 *
 * So whichever surface is over the player's head thins out while he is under it,
 * and comes back the moment he steps clear. Eased rather than switched, because
 * a hard cut on a tile boundary reads as the roof flickering rather than as him
 * passing beneath it.
 *
 * Nothing here runs on a single-plane level with no canopy, which is seven of
 * the nine shipped ones — {@link PlaneOverlay.update} returns immediately.
 */

/** Alpha units per second the fade moves; a little under a fifth of a second end to end. */
const FADE_RATE = 6;

interface Faded {
  texture: Phaser.GameObjects.RenderTexture;
  /** Cells that, with the player standing on them, put this surface overhead. */
  covers: Uint8Array;
  /** The plane the player must be *on* for this surface to be overhead. */
  under: number;
  alpha: number;
}

export class PlaneOverlay {
  private readonly faded: Faded[] = [];

  constructor(
    private readonly level: GameLevel,
    tileSize: number,
    planes: readonly BakedPlane[],
  ) {
    for (const baked of planes) {
      if (baked.plane === CANOPY) {
        // A roof is overhead from either surface — you can be on the gantry and
        // still be under it.
        this.faded.push({
          texture: baked.texture,
          covers: canopyCells(level, tileSize),
          under: -1,
          alpha: 1,
        });
      } else if (baked.plane > PLANE_FLOOR) {
        // The deck is only overhead when the player is on the floor beneath it.
        this.faded.push({
          texture: baked.texture,
          covers: deckCells(level, tileSize),
          under: PLANE_FLOOR,
          alpha: 1,
        });
      }
    }
  }

  /** @param plane the walk surface the player is currently on. */
  update(dt: number, playerX: number, playerY: number, plane: number, tileSize: number): void {
    if (this.faded.length === 0) return;
    const tx = Math.floor(playerX / tileSize);
    const ty = Math.floor(playerY / tileSize);
    const inside = tx >= 0 && ty >= 0 && tx < this.level.width && ty < this.level.height;
    const cell = inside ? ty * this.level.width + tx : -1;

    for (const f of this.faded) {
      const overhead =
        cell >= 0 && f.covers[cell] === 1 && (f.under === -1 || plane === f.under);
      const target = overhead ? UNDER_ALPHA : 1;
      const step = FADE_RATE * dt;
      f.alpha =
        f.alpha < target ? Math.min(target, f.alpha + step) : Math.max(target, f.alpha - step);
      f.texture.setAlpha(f.alpha);
    }
  }
}
