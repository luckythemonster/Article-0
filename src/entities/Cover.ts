import type Phaser from "phaser";
import type { GameTile, SpriteFrame } from "../map/types";
import type { DetectionSystem } from "../systems/DetectionSystem";

/**
 * A destructible cover tile — the map's `Destructible` cover field, wired up.
 *
 * Ordinary cover has no entity at all: it's baked straight into the level's
 * tile texture ({@link import("../map/TileBake").bakeTileLayers}) and read
 * once into {@link DetectionSystem}, which is exactly right for something
 * that never changes. A destructible tile needs one extra hook for the
 * moment something breaks it, so this class exists only for the cover
 * instances a map (or generator) marks `Destructible: "true"` — every other
 * cover tile is untouched by this feature.
 */
export class Cover {
  readonly tileX: number;
  readonly tileY: number;
  private broken = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly detection: DetectionSystem,
    private readonly tileTexture: Phaser.GameObjects.RenderTexture,
    private readonly tileSize: number,
    tile: GameTile,
    /** The floor tile underneath, redrawn once cover art is erased. */
    private readonly floorFrame: SpriteFrame | undefined,
  ) {
    this.tileX = tile.x;
    this.tileY = tile.y;
  }

  get isBroken(): boolean {
    return this.broken;
  }

  /**
   * Breaks the cover: a single hit is enough (no durability system, matching
   * how doors/lasers/chests are all binary state). Clears its detection/
   * thermal effect and erases its art from the baked tile texture, redrawing
   * the floor underneath so destroying it doesn't punch through to the level
   * background.
   */
  destroy(): void {
    if (this.broken) return;
    this.broken = true;
    this.detection.destroyCoverAt(this.tileX, this.tileY);

    const ts = this.tileSize;
    const x = this.tileX * ts;
    const y = this.tileY * ts;
    // A same-size opaque stamp, erased against the baked tile texture — the
    // same technique Lighting.ts uses to punch light pools out of the dark.
    const stamp = this.scene.make
      .image({ key: "__WHITE", add: false })
      .setDisplaySize(ts, ts)
      .setOrigin(0, 0)
      .setPosition(x, y);
    this.tileTexture.erase(stamp);
    stamp.destroy();
    if (this.floorFrame) {
      this.tileTexture.drawFrame(this.floorFrame.textureKey, this.floorFrame.frameKey, x, y);
    }
  }
}
