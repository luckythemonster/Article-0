import { describe, expect, it } from "vitest";
import { doorBlocks, doorSeating } from "./doorGeometry";
import type { GameTile } from "../map/types";

const TILE = 32;

/**
 * The two door families the map actually ships, read off `edplay.json`'s
 * TileDefs rather than invented: a north-south door is a plain 1×1 inset
 * `{Bottom: 0.4}`, and an east-west one is 1×1.5 at `OffsetY: 4` inset
 * `{Left: 0.2, Right: 0.2}`.
 */
function northSouth(x: number, y: number): GameTile {
  return {
    x,
    y,
    colSpan: 1,
    rowSpan: 1,
    offsetX: 0,
    offsetY: 0,
    collider: { Bottom: 0.4 },
  } as unknown as GameTile;
}

function eastWest(x: number, y: number): GameTile {
  return {
    x,
    y,
    colSpan: 1,
    rowSpan: 1.5,
    offsetX: 0,
    offsetY: 4,
    collider: { Left: 0.2, Right: 0.2 },
  } as unknown as GameTile;
}

describe("doorBlocks — when a door is in the way", () => {
  it("blocks while shut", () => {
    expect(doorBlocks(false, false)).toBe(true);
  });

  it("blocks for the whole of the opening slide", () => {
    // The bug this exists for: collision used to clear on the frame `setOpen`
    // was called, while the leaf had 1350ms of OPEN_SEQUENCE still to run.
    expect(doorBlocks(true, true)).toBe(true);
  });

  it("blocks while closing", () => {
    expect(doorBlocks(false, true)).toBe(true);
  });

  it("clears only once open and settled", () => {
    expect(doorBlocks(true, false)).toBe(false);
  });
});

describe("doorSeating — art and collider on one centre line", () => {
  it("puts the collider exactly where an east-west door is drawn", () => {
    // 1×1.5 art is 48px tall and stands on the floor of its own tile, so its
    // centre is 8px into the tile — not the 20px the authored OffsetY gives.
    // The collider used to keep the authored seating, leaving it 12px low.
    const seat = doorSeating(eastWest(14, 13), TILE, true);
    expect(seat.centreY).toBe(13 * TILE + 8);
    expect(seat.collider.y + seat.collider.h / 2).toBeCloseTo(seat.centreY, 6);
  });

  it("keeps the east-west collider 19.2px wide — the authored side padding", () => {
    const seat = doorSeating(eastWest(14, 13), TILE, true);
    expect(seat.collider.w).toBeCloseTo(TILE * 0.6, 6);
    expect(seat.collider.h).toBe(48);
  });

  it("still spans the whole doorway row after the reseat", () => {
    // Moving the box up must not open a gap: a 48px collider covers row 13's
    // full 32px wherever in that row it starts.
    const seat = doorSeating(eastWest(14, 13), TILE, true);
    expect(seat.collider.y).toBeLessThanOrEqual(13 * TILE);
    expect(seat.collider.y + seat.collider.h).toBeGreaterThanOrEqual(14 * TILE);
  });

  it("leaves an east-west door on the authored seating without its art", () => {
    // The map-tile fallback is pre-squished and symmetrically stretched, so the
    // exporter's centred seating is still the right one for it.
    const seat = doorSeating(eastWest(14, 13), TILE, false);
    expect(seat.centreY).toBe(13 * TILE + 16 + 4);
    expect(seat.collider.y).toBe(13 * TILE - 4);
  });

  it("moves a north-south door nowhere, seated either way", () => {
    // Its art is exactly one tile tall, where centred and bottom-aligned land in
    // the same place — so bottom seating is a no-op by construction.
    const centred = doorSeating(northSouth(9, 4), TILE, false);
    const seated = doorSeating(northSouth(9, 4), TILE, true);
    expect(seated.centreY).toBe(centred.centreY);
    expect(seated.collider).toEqual(centred.collider);
    expect(centred.centreY).toBe(4 * TILE + 16);
  });

  it("keeps the north-south inset hugging the drawn face", () => {
    // `{Bottom: 0.4}` reads as an inset, so the solid box is the top 19.2px of
    // the cell and the 12.8px in front of it stays standable — the same rule
    // every padded wall in the map follows.
    const seat = doorSeating(northSouth(9, 4), TILE, false);
    expect(seat.collider.y).toBe(4 * TILE);
    expect(seat.collider.h).toBeCloseTo(TILE * 0.6, 6);
    expect(seat.collider.w).toBe(TILE);
  });

  it("survives a generated level that omits the span and padding fields", () => {
    const bare = { x: 2, y: 6 } as unknown as GameTile;
    const seat = doorSeating(bare, TILE, false);
    expect(seat.centreY).toBe(6 * TILE + 16);
    expect(seat.collider).toEqual({ x: 2 * TILE, y: 6 * TILE, w: TILE, h: TILE });
  });
});
