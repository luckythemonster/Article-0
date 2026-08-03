import { describe, it, expect } from "vitest";
import { decodeRgba8, encodeRgba8 } from "./png";

/** Builds `width * height` RGBA pixels with deterministic, non-repeating values. */
function pixels(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = (i * 7) & 0xff;
    data[i * 4 + 1] = (i * 13) & 0xff;
    data[i * 4 + 2] = (i * 29) & 0xff;
    data[i * 4 + 3] = (i * 3) & 0xff;
  }
  return data;
}

describe("encodeRgba8", () => {
  it("round-trips pixels through the decoder unchanged", () => {
    const data = pixels(8, 5);
    const decoded = decodeRgba8(encodeRgba8(8, 5, data));
    expect(decoded.width).toBe(8);
    expect(decoded.height).toBe(5);
    expect(Array.from(decoded.data)).toEqual(Array.from(data));
  });

  it("writes a valid PNG signature", () => {
    const png = encodeRgba8(1, 1, Uint8Array.of(1, 2, 3, 4));
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("preserves fully transparent pixels rather than collapsing them", () => {
    // Sprite frames are mostly transparent padding; if alpha were dropped the
    // re-canvas step would silently change every frame's content box.
    const data = new Uint8Array(4 * 4 * 4);
    data.set([255, 0, 0, 255], 5 * 4);
    const decoded = decodeRgba8(encodeRgba8(4, 4, data));
    expect(Array.from(decoded.data.subarray(5 * 4, 6 * 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(decoded.data.subarray(0, 4))).toEqual([0, 0, 0, 0]);
  });

  it("rejects a buffer whose length does not match the dimensions", () => {
    expect(() => encodeRgba8(4, 4, new Uint8Array(10))).toThrow(/expected 64 bytes/);
  });
});
