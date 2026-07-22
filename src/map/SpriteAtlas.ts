import Phaser from "phaser";
import type { SpriteFrame } from "./types";

/**
 * Registers per-tile frames onto the already-loaded spritesheet textures.
 *
 * The edplay map references sprites as rectangles inside three big PNGs. Phaser
 * can slice a sub-rectangle of a texture into a named frame with
 * `texture.add(frameKey, sourceIndex, x, y, w, h)`; once registered, any
 * Sprite/Image created with `(textureKey, frameKey)` draws that exact rect.
 */
export class SpriteAtlas {
  /**
   * Adds every unique frame to its owning texture. Safe to call once after the
   * spritesheet images have finished loading.
   */
  static register(scene: Phaser.Scene, frames: SpriteFrame[]): void {
    for (const f of frames) {
      const texture = scene.textures.get(f.textureKey);
      if (!texture) continue;
      // Guard against duplicate keys (a frame reused across levels).
      if (texture.has(f.frameKey)) continue;
      texture.add(f.frameKey, 0, f.x, f.y, f.width, f.height);
    }
  }
}
