import Phaser from "phaser";
import { len } from "../systems/distance";
import { falloff, POOL_CORE } from "./falloff";

/**
 * Soft procedural stamp textures.
 *
 * These started out private to `src/ui/Lighting.ts`, which is still their biggest
 * consumer. They live here because the ground shadows in `src/ui/EntityShadows.ts` draw
 * the same radial stamp, tinted black — the shape a light makes on the floor and the
 * shape a body blocks out of one are the same shape, so it is one texture and one
 * batched draw rather than two of each.
 *
 * The curve behind them is in `./falloff.ts`, deliberately separate: the shadows need to
 * *evaluate* it in code that runs without a canvas, and everything in here needs a live
 * Phaser scene.
 */

/**
 * Size of the generated soft radial stamp texture, in px. Comfortably larger than the
 * biggest pool it has to cover (a 3.5-tile light is 224px across) so the stamp is
 * always scaled *down* — an upscaled gradient shows its own pixel steps, which is a
 * texture artefact masquerading as a lighting one.
 */
export const RADIAL_STAMP_SIZE = 256;

/** Texture key for {@link ensureRadialStamp}. */
export const RADIAL_STAMP_KEY = "radial-stamp";

/**
 * Builds (once) a stamp texture by evaluating `alphaAt` per pixel.
 *
 * Written pixel by pixel rather than by stacking translucent shapes, so the falloff
 * is exactly {@link falloff} instead of whatever a pile of alpha-composited fills
 * happens to add up to. Only the alpha channel carries meaning — these are masks
 * `erase`d out of the darkness or tinted into a shadow, never drawn for their colour —
 * but the RGB is left white so the texture is also sane if it gets drawn normally, and
 * so `setTint` can take it to any colour.
 *
 * Filtered LINEAR, overriding the game-wide `pixelArt` NEAREST: a mask is not sprite
 * art, and nearest-neighbour sampling puts stair-steps in the gradient. That is also
 * why nothing built here answers to the integer-scale rule in `./pixelScale.ts` — the
 * rule exists to stop *art* being resampled, and these are generated at whatever size
 * they are drawn at. The level art keeps its crisp look regardless, since every one of
 * these is a separate object layered above it.
 */
export function ensureStampTexture(
  scene: Phaser.Scene,
  key: string,
  size: number,
  alphaAt: (x: number, y: number) => number,
): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(255 * alphaAt(x + 0.5, y + 0.5));
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/**
 * The soft radial stamp: full centre → clear edge.
 *
 * Erased out of the darkness it is a light pool; tinted black and squashed it is the
 * shadow under a character. Same texture either way — the shape a light makes on the
 * floor and the shape a body blocks out of one are the same shape.
 */
export function ensureRadialStamp(scene: Phaser.Scene): void {
  const c = RADIAL_STAMP_SIZE / 2;
  ensureStampTexture(scene, RADIAL_STAMP_KEY, RADIAL_STAMP_SIZE, (x, y) =>
    falloff(len(x - c, y - c) / c, POOL_CORE),
  );
}
