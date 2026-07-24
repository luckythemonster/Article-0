import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import { decodeRgba8 } from "./png";

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/** Emits a PNG chunk. The decoder ignores CRC, so we zero it. */
function chunk(type: string, data: number[]): number[] {
  const typeBytes = [type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)];
  return [...u32(data.length), ...typeBytes, ...data, 0, 0, 0, 0];
}

/**
 * Assembles a minimal 8-bit RGBA PNG from pre-filtered scanlines (each row is
 * `[filterByte, ...bytes]`), letting tests exercise specific filter types.
 */
function buildPng(width: number, height: number, colorType: number, filteredRows: number[][]): Uint8Array {
  const raw: number[] = [];
  for (const row of filteredRows) raw.push(...row);
  const idat = Array.from(deflateSync(Uint8Array.from(raw)));
  const ihdr = [...u32(width), ...u32(height), 8, colorType, 0, 0, 0];
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", idat),
    ...chunk("IEND", []),
  ]);
}

describe("decodeRgba8", () => {
  it("round-trips unfiltered RGBA pixels", () => {
    const png = buildPng(2, 1, 6, [[0, 10, 20, 30, 40, 50, 60, 70, 80]]);
    const img = decodeRgba8(png);
    expect(img.width).toBe(2);
    expect(img.height).toBe(1);
    expect(Array.from(img.data)).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
  });

  it("reconstructs the Up filter (type 2) against the previous row", () => {
    const png = buildPng(1, 2, 6, [
      [0, 10, 20, 30, 40], // row 0, no filter
      [2, 5, 5, 5, 10], // row 1, Up: recon = value + above
    ]);
    const img = decodeRgba8(png);
    expect(Array.from(img.data)).toEqual([10, 20, 30, 40, 15, 25, 35, 50]);
  });

  it("rejects a non-PNG buffer", () => {
    expect(() => decodeRgba8(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow();
  });

  it("rejects an unsupported color type", () => {
    const png = buildPng(1, 1, 2, [[0, 1, 2, 3]]); // color type 2 = RGB
    expect(() => decodeRgba8(png)).toThrow(/color type/i);
  });
});
