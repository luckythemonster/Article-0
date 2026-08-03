/**
 * Lossless re-canvasing for generated sprite frames.
 *
 * PixelLab returns each frame on its own padded canvas, and the padding is not
 * guaranteed to be identical from frame to frame. Two things follow from that,
 * and this module exists to fix both:
 *
 * 1. **The canvas size has to be exact.** The player's on-screen scale is
 *    `displaySize / sourceSize`, and unless that lands on a clean fraction the
 *    nearest-neighbour filter resamples the art — see `PLAYER_SOURCE_SIZE` in
 *    `src/entities/PlayerAnimations.ts` for the arithmetic. So every frame is
 *    placed onto one fixed canvas whose size the caller chooses deliberately.
 *
 * 2. **The translation has to be shared.** Cropping each frame to its own
 *    content would re-centre the character every frame and destroy the motion —
 *    a walk cycle's weight shift, a run's forward lean. So the caller computes
 *    *one* bounding box across the whole set and every frame is translated by
 *    the same vector.
 *
 * Nothing here resamples. Pixels are copied one-to-one or the operation throws.
 */

import type { DecodedImage } from "./png";

/** A pixel rectangle, `max` inclusive. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Alpha at or below this counts as background. Matches the collider generator's threshold. */
export const ALPHA_THRESHOLD = 10;

export function boundsWidth(b: Bounds): number {
  return b.maxX - b.minX + 1;
}

export function boundsHeight(b: Bounds): number {
  return b.maxY - b.minY + 1;
}

/** The tight box around every pixel above the alpha threshold, or null if the frame is empty. */
export function contentBounds(image: DecodedImage, threshold = ALPHA_THRESHOLD): Bounds | null {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

/** The smallest box containing all of `boxes`. Throws on an empty list — an all-empty set is a bug worth surfacing. */
export function unionBounds(boxes: Bounds[]): Bounds {
  if (boxes.length === 0) throw new Error("unionBounds: no frames had any content");
  return boxes.reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }));
}

/**
 * Copies `image` onto a fresh `size`x`size` transparent canvas, moving the pixel
 * at (`shared.minX`, `shared.minY`) to the destination offset that centres the
 * shared box.
 *
 * `shared` must be the union box across the whole animation set, not this
 * frame's own box, so that all frames receive the same translation.
 */
export function recanvas(image: DecodedImage, shared: Bounds, size: number): Uint8Array {
  const contentW = boundsWidth(shared);
  const contentH = boundsHeight(shared);
  if (contentW > size || contentH > size) {
    throw new Error(
      `recanvas: content is ${contentW}x${contentH} but the canvas is ${size}x${size}. ` +
        "Regenerate the character at a smaller size — this step never scales.",
    );
  }

  // Integer offsets keep the copy on the pixel grid; Math.floor rather than
  // round so an odd leftover always falls on the same side across the set.
  const offsetX = Math.floor((size - contentW) / 2) - shared.minX;
  const offsetY = Math.floor((size - contentH) / 2) - shared.minY;

  const out = new Uint8Array(size * size * 4);
  for (let y = shared.minY; y <= shared.maxY; y++) {
    const destY = y + offsetY;
    if (destY < 0 || destY >= size) continue;
    for (let x = shared.minX; x <= shared.maxX; x++) {
      const destX = x + offsetX;
      if (destX < 0 || destX >= size) continue;
      const src = (y * image.width + x) * 4;
      const dest = (destY * size + destX) * 4;
      out[dest] = image.data[src];
      out[dest + 1] = image.data[src + 1];
      out[dest + 2] = image.data[src + 2];
      out[dest + 3] = image.data[src + 3];
    }
  }
  return out;
}
