/**
 * Minimal PNG decoder for the Article Zero collider generator.
 *
 * Supports exactly the variant the game's sprite assets use — 8-bit truecolor
 * with alpha (color type 6), non-interlaced — and throws a clear error for
 * anything else rather than returning garbage. Chunk parsing is done here;
 * DEFLATE decompression uses Node's built-in `zlib`, so there is no third-party
 * image dependency. This module is the only Node-coupled piece of the core.
 */

import { inflateSync } from "node:zlib";

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major (top-left origin). */
  data: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const BYTES_PER_PIXEL = 4;

/** Decodes an 8-bit RGBA, non-interlaced PNG into raw pixels. */
export function decodeRgba8(buffer: Uint8Array): DecodedImage {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (buffer[i] !== SIGNATURE[i]) {
      throw new Error("decodeRgba8: not a PNG (bad signature)");
    }
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const idat: Uint8Array[] = [];
  let width = 0;
  let height = 0;
  let offset = SIGNATURE.length;

  while (offset + 8 <= buffer.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      buffer[offset + 4],
      buffer[offset + 5],
      buffer[offset + 6],
      buffer[offset + 7],
    );
    const dataStart = offset + 8;

    if (type === "IHDR") {
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      const bitDepth = buffer[dataStart + 8];
      const colorType = buffer[dataStart + 9];
      const interlace = buffer[dataStart + 12];
      if (bitDepth !== 8 || colorType !== 6) {
        throw new Error(
          `decodeRgba8: unsupported PNG (bitDepth=${bitDepth}, colorType=${colorType}); ` +
            "only 8-bit RGBA (color type 6) is supported",
        );
      }
      if (interlace !== 0) {
        throw new Error("decodeRgba8: interlaced PNGs are not supported");
      }
    } else if (type === "IDAT") {
      idat.push(buffer.subarray(dataStart, dataStart + length));
    } else if (type === "IEND") {
      break;
    }

    // Advance past length (4) + type (4) + data (length) + CRC (4).
    offset = dataStart + length + 4;
  }

  if (width === 0 || height === 0) {
    throw new Error("decodeRgba8: missing or empty IHDR");
  }
  if (idat.length === 0) {
    throw new Error("decodeRgba8: no image data (IDAT)");
  }

  const raw = new Uint8Array(inflateSync(concat(idat)));
  return { width, height, data: unfilter(raw, width, height) };
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

/** Reverses the per-scanline PNG filters (types 0–4) for 8-bit RGBA. */
function unfilter(raw: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * BYTES_PER_PIXEL;
  const out = new Uint8Array(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[src++];
      const left = x >= BYTES_PER_PIXEL ? out[row + x - BYTES_PER_PIXEL] : 0;
      const up = y > 0 ? out[row - stride + x] : 0;
      const upLeft = x >= BYTES_PER_PIXEL && y > 0 ? out[row - stride + x - BYTES_PER_PIXEL] : 0;
      let recon: number;
      switch (filter) {
        case 0:
          recon = value;
          break;
        case 1:
          recon = value + left;
          break;
        case 2:
          recon = value + up;
          break;
        case 3:
          recon = value + ((left + up) >> 1);
          break;
        case 4:
          recon = value + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`decodeRgba8: unknown scanline filter ${filter}`);
      }
      out[row + x] = recon & 0xff;
    }
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
