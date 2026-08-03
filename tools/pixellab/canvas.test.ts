import { describe, it, expect } from "vitest";
import {
  boundsHeight,
  boundsWidth,
  contentBounds,
  recanvas,
  unionBounds,
  type Bounds,
} from "./canvas";
import type { DecodedImage } from "./png";

/** Builds an image with an opaque rectangle at (x, y) and nothing else. */
function withRect(size: number, x: number, y: number, w: number, h: number, colour = 200): DecodedImage {
  const data = new Uint8Array(size * size * 4);
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      const i = (row * size + col) * 4;
      data[i] = colour;
      data[i + 1] = colour;
      data[i + 2] = colour;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

describe("contentBounds", () => {
  it("finds the tight box around opaque pixels", () => {
    const box = contentBounds(withRect(16, 3, 5, 4, 6))!;
    expect(box).toEqual({ minX: 3, minY: 5, maxX: 6, maxY: 10 });
    expect(boundsWidth(box)).toBe(4);
    expect(boundsHeight(box)).toBe(6);
  });

  it("returns null for a fully transparent frame", () => {
    expect(contentBounds({ width: 4, height: 4, data: new Uint8Array(64) })).toBeNull();
  });

  it("ignores near-transparent pixels below the threshold", () => {
    const image = withRect(8, 2, 2, 2, 2);
    // A stray pixel at alpha 10 is anti-aliasing residue, not content.
    image.data[(0 * 8 + 0) * 4 + 3] = 10;
    expect(contentBounds(image)).toEqual({ minX: 2, minY: 2, maxX: 3, maxY: 3 });
  });
});

describe("unionBounds", () => {
  it("covers every input box", () => {
    const boxes: Bounds[] = [
      { minX: 5, minY: 5, maxX: 9, maxY: 9 },
      { minX: 2, minY: 7, maxX: 6, maxY: 12 },
    ];
    expect(unionBounds(boxes)).toEqual({ minX: 2, minY: 5, maxX: 9, maxY: 12 });
  });

  it("throws when no frame had content", () => {
    expect(() => unionBounds([])).toThrow(/no frames had any content/);
  });
});

describe("recanvas", () => {
  it("copies pixels without altering their values", () => {
    const image = withRect(20, 6, 6, 3, 3, 137);
    const shared = contentBounds(image)!;
    const out = recanvas(image, shared, 16);

    const opaque = [...Array(16 * 16).keys()].filter((i) => out[i * 4 + 3] > 0);
    expect(opaque).toHaveLength(9);
    for (const i of opaque) {
      expect(Array.from(out.subarray(i * 4, i * 4 + 4))).toEqual([137, 137, 137, 255]);
    }
  });

  it("centres the shared box on the new canvas", () => {
    const image = withRect(20, 1, 1, 2, 2);
    const out = recanvas(image, contentBounds(image)!, 10);
    // A 2x2 box on a 10x10 canvas starts at (4, 4).
    expect(out[(4 * 10 + 4) * 4 + 3]).toBe(255);
    expect(out[(3 * 10 + 4) * 4 + 3]).toBe(0);
  });

  it("applies the same translation to every frame, preserving relative motion", () => {
    // Two frames of a "walk": the same shape one pixel further right. The gap
    // between them has to survive, or the character marches on the spot.
    const a = withRect(20, 5, 5, 2, 2);
    const b = withRect(20, 6, 5, 2, 2);
    const shared = unionBounds([contentBounds(a)!, contentBounds(b)!]);

    const outA = recanvas(a, shared, 16);
    const outB = recanvas(b, shared, 16);

    const firstOpaqueX = (out: Uint8Array) =>
      [...Array(16 * 16).keys()].find((i) => out[i * 4 + 3] > 0)! % 16;
    expect(firstOpaqueX(outB) - firstOpaqueX(outA)).toBe(1);
  });

  it("throws rather than scaling when the content does not fit", () => {
    const image = withRect(40, 0, 0, 40, 40);
    expect(() => recanvas(image, contentBounds(image)!, 16)).toThrow(/never scales/);
  });
});
