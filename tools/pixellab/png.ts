/**
 * PNG encoding for the PixelLab asset pipeline.
 *
 * Decoding is already solved by `src/tools/collider/png.ts`, which this module
 * re-exports so callers have one import for both directions. The encoder here is
 * the missing half: it writes the same variant the decoder accepts — 8-bit
 * truecolor with alpha, non-interlaced — so a decode/encode round trip is
 * byte-exact in pixel terms.
 *
 * Every scanline is written with filter type 0 (None). Sprite frames are small
 * and mostly transparent, so `zlib` at maximum level already compresses them to
 * a couple of kilobytes; picking per-line filters would buy little and would add
 * a heuristic to a step that must stay obviously lossless.
 */

import { deflateSync } from "node:zlib";

export { decodeRgba8, type DecodedImage } from "../../src/tools/collider/png";

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BYTES_PER_PIXEL = 4;

/** Encodes raw RGBA pixels (row-major, top-left origin) as an 8-bit RGBA PNG. */
export function encodeRgba8(width: number, height: number, data: Uint8Array): Uint8Array {
  const expected = width * height * BYTES_PER_PIXEL;
  if (data.length !== expected) {
    throw new Error(`encodeRgba8: expected ${expected} bytes for ${width}x${height}, got ${data.length}`);
  }

  // Prefix each scanline with its filter byte (0 = None).
  const stride = width * BYTES_PER_PIXEL;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: truecolor + alpha
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method: adaptive
  ihdr[12] = 0; // interlace: none

  return concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** Builds one `length | type | data | crc32` PNG chunk. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  // The CRC covers the type and the data, but not the length.
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
