/**
 * Alpha-boundary extraction for the Article Zero collider generator.
 *
 * Pipeline: {@link alphaMask} thresholds the alpha channel into a binary mask,
 * {@link largestComponent} keeps only the biggest blob (dropping stray specks,
 * as OpenCV's `max(contours, key=contourArea)` would), and
 * {@link traceContour} walks that blob's outer edge into an ordered pixel path
 * via Moore-neighbor boundary tracing. Pure and browser-safe.
 */

import type { Point } from "./rdp";
import type { DecodedImage } from "./png";

export interface Mask {
  width: number;
  height: number;
  /** 1 = foreground (opaque), 0 = background (transparent). */
  data: Uint8Array;
}

/** Thresholds an RGBA image's alpha channel into a binary foreground mask. */
export function alphaMask(img: DecodedImage, threshold = 10): Mask {
  const { width, height, data } = img;
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) {
    out[i] = data[i * 4 + 3] > threshold ? 1 : 0;
  }
  return { width, height, data: out };
}

/** Keeps only the largest 8-connected foreground component. Throws if empty. */
export function largestComponent(mask: Mask): Mask {
  const { width, height, data } = mask;
  const labels = new Int32Array(width * height);
  const stack: number[] = [];
  let best = 0;
  let bestSize = 0;
  let label = 0;

  for (let start = 0; start < data.length; start++) {
    if (data[start] === 0 || labels[start] !== 0) continue;
    label++;
    let size = 0;
    stack.length = 0;
    stack.push(start);
    labels[start] = label;
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      size++;
      const x = idx % width;
      const y = (idx / width) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (data[n] === 1 && labels[n] === 0) {
            labels[n] = label;
            stack.push(n);
          }
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = label;
    }
  }

  if (best === 0) {
    throw new Error("largestComponent: mask has no foreground pixels");
  }

  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) {
    out[i] = labels[i] === best ? 1 : 0;
  }
  return { width, height, data: out };
}

// Moore neighborhood, clockwise, starting at North.
const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // 0 N
  [1, -1], // 1 NE
  [1, 0], //  2 E
  [1, 1], //  3 SE
  [0, 1], //  4 S
  [-1, 1], // 5 SW
  [-1, 0], // 6 W
  [-1, -1], // 7 NW
];

/**
 * Traces the outer boundary of `mask`'s foreground as an ordered list of pixel
 * coordinates (top-left origin), using Moore-neighbor tracing. The mask should
 * hold a single blob — run {@link largestComponent} first. Throws if empty.
 */
export function traceContour(mask: Mask): Point[] {
  const { width, height, data } = mask;
  const fg = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] === 1;

  // Start at the top-most, then left-most foreground pixel; its western
  // neighbor is therefore background, so we "enter" it from the West (index 6).
  let sx = -1;
  let sy = -1;
  for (let y = 0; y < height && sy < 0; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] === 1) {
        sx = x;
        sy = y;
        break;
      }
    }
  }
  if (sx < 0) {
    throw new Error("traceContour: mask has no foreground pixels");
  }

  const contour: Point[] = [{ x: sx, y: sy }];
  let px = sx;
  let py = sy;
  let enterDir = 6; // West
  // A simple closed boundary can't be longer than 8× the pixel count.
  const maxSteps = width * height * 8 + 8;

  for (let step = 0; step < maxSteps; step++) {
    let moved = false;
    // Sweep clockwise, starting just past the cell we entered from.
    for (let i = 1; i <= 8; i++) {
      const dir = (enterDir + i) % 8;
      const nx = px + NEIGHBORS[dir][0];
      const ny = py + NEIGHBORS[dir][1];
      if (fg(nx, ny)) {
        px = nx;
        py = ny;
        enterDir = (dir + 4) % 8; // direction from the new pixel back to the old
        moved = true;
        break;
      }
    }
    if (!moved) break; // isolated single pixel
    if (px === sx && py === sy) break; // closed the loop
    contour.push({ x: px, y: py });
  }

  return contour;
}
