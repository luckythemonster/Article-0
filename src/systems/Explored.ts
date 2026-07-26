/**
 * Fog of war for the pause menu's map.
 *
 * The engine already knows, every frame, exactly which tiles the player can see —
 * `Visibility`/`CollisionGrid.hasLineOfSight` compute it for the darkness overlay
 * and the guards' vision alike. What nothing kept was the *union* of that over
 * time, which is what a map wants: not what you can see, but what you have seen.
 *
 * Stored as a bit per tile. A level is a few thousand tiles, so a bitset is a few
 * hundred bytes — small enough to hold one per level for the whole run and still
 * fit comfortably in a localStorage save, which a `Set<string>` of `"x,y"` keys
 * emphatically would not.
 */

/** One level's seen-tile mask. */
export class ExploredMap {
  private readonly bits: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    bits?: Uint8Array,
  ) {
    const bytes = Math.ceil((width * height) / 8);
    this.bits = bits && bits.length === bytes ? bits : new Uint8Array(bytes);
  }

  /** Marks a tile seen. Out-of-bounds coordinates are ignored, not clamped —
   *  a clamp would smear the map edge as the player walks along a wall. */
  mark(tx: number, ty: number): void {
    const i = this.index(tx, ty);
    if (i < 0) return;
    this.bits[i >> 3] |= 1 << (i & 7);
  }

  has(tx: number, ty: number): boolean {
    const i = this.index(tx, ty);
    if (i < 0) return false;
    return (this.bits[i >> 3] & (1 << (i & 7))) !== 0;
  }

  /** How many tiles have been seen — the STATUS tab's "surveyed" percentage. */
  count(): number {
    let n = 0;
    for (const byte of this.bits) {
      // Brian Kernighan's: clears the lowest set bit each pass.
      for (let b = byte; b !== 0; b &= b - 1) n++;
    }
    return n;
  }

  private index(tx: number, ty: number): number {
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) return -1;
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return -1;
    return ty * this.width + tx;
  }

  toBase64(): string {
    return bytesToBase64(this.bits);
  }

  /**
   * Rebuilds a mask from a persisted string. Anything that doesn't decode to the
   * right length yields a blank map rather than throwing — a save whose level was
   * re-authored to a different size should cost the player their fog, not their run.
   */
  static fromBase64(s: string, width: number, height: number): ExploredMap {
    const bytes = base64ToBytes(s);
    return new ExploredMap(width, height, bytes ?? undefined);
  }
}

/** Every level's mask, keyed by level name — what the save file carries. */
export type ExploredState = Record<string, string>;

export function initialExplored(): ExploredState {
  return {};
}

export function isExploredState(v: unknown): v is ExploredState {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every((s) => typeof s === "string");
}

// --- base64 --------------------------------------------------------------
//
// `btoa`/`atob` are DOM globals but exist in Node ≥16 too, so these work in both
// the browser and the vitest (node) suite without a polyfill or a Buffer import.

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  // Chunked so a large mask can't blow the argument limit on String.fromCharCode.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function base64ToBytes(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
