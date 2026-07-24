import { describe, it, expect } from "vitest";
import { alphaMask, largestComponent, traceContour, type Mask } from "./contour";
import { rdp } from "./rdp";
import { toAABB } from "./format";

/** Builds a mask with the given inclusive rectangles filled in. */
function rectMask(width: number, height: number, rects: Array<[number, number, number, number]>): Mask {
  const data = new Uint8Array(width * height);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        data[y * width + x] = 1;
      }
    }
  }
  return { width, height, data };
}

describe("alphaMask", () => {
  it("thresholds the alpha channel", () => {
    // 2×1 RGBA: first pixel transparent (a=5), second opaque (a=200).
    const img = { width: 2, height: 1, data: new Uint8Array([0, 0, 0, 5, 0, 0, 0, 200]) };
    expect(Array.from(alphaMask(img, 10).data)).toEqual([0, 1]);
  });
});

describe("largestComponent", () => {
  it("keeps the biggest blob and drops specks", () => {
    const mask = rectMask(12, 12, [
      [1, 1, 6, 6], // 6×6 blob
      [10, 10, 10, 10], // 1px speck
    ]);
    const largest = largestComponent(mask);
    expect(largest.data[10 * 12 + 10]).toBe(0); // speck removed
    expect(largest.data[3 * 12 + 3]).toBe(1); // blob kept
  });

  it("throws on an empty mask", () => {
    expect(() => largestComponent(rectMask(4, 4, []))).toThrow();
  });
});

describe("traceContour", () => {
  it("bounds a solid rectangle exactly", () => {
    const mask = rectMask(10, 8, [[2, 1, 7, 5]]);
    const contour = traceContour(largestComponent(mask));
    // Every traced point sits on a foreground pixel.
    for (const p of contour) {
      expect(mask.data[p.y * mask.width + p.x]).toBe(1);
    }
    expect(toAABB(contour)).toEqual({ width: 5, height: 4, offsetX: 2, offsetY: 1 });
  });

  it("simplifies a rectangle contour to its corners", () => {
    const mask = rectMask(12, 12, [[2, 2, 9, 8]]);
    const contour = traceContour(largestComponent(mask));
    const poly = rdp(contour, 1);
    expect(poly.length).toBeLessThanOrEqual(6);
    // The simplified polygon still bounds the same rectangle.
    expect(toAABB(contour)).toEqual({ width: 7, height: 6, offsetX: 2, offsetY: 2 });
  });

  it("throws on an empty mask", () => {
    expect(() => traceContour(rectMask(4, 4, []))).toThrow();
  });
});
