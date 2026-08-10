import { describe, expect, it } from "vitest";
import {
  colliderRect,
  footprintCells,
  footprintCentre,
  hasPlainCollider,
  isSingleCell,
  raySlabIntersect,
} from "./footprint";
import type { GameTile } from "./types";

/** A placed tile with the span/offset fields the editor authors. */
function tile(
  x: number,
  y: number,
  colSpan = 1,
  rowSpan = 1,
  offsetX = 0,
  offsetY = 0,
): GameTile {
  return { x, y, colSpan, rowSpan, offsetX, offsetY } as unknown as GameTile;
}

/** Cells as sorted "x,y" strings, so order of discovery never matters. */
function cells(t: GameTile, tileSize = 32): string[] {
  return footprintCells(t, tileSize)
    .map((c) => `${c.x},${c.y}`)
    .sort();
}

describe("footprintCells", () => {
  it("covers just the placed cell for a plain 1×1 tile", () => {
    expect(cells(tile(3, 4))).toEqual(["3,4"]);
  });

  it("covers both cells of a 1×2.5 pane nudged half a tile down", () => {
    // `door_glass_double_vertical0` as `main2`'s walls board places it: the pane
    // runs from the wall above to the wall below, over two whole cells.
    expect(cells(tile(18, 19, 1, 2.5, 0, 16))).toEqual(["18,19", "18,20"]);
    expect(cells(tile(21, 19, 1, 2.5, 0, 16))).toEqual(["21,19", "21,20"]);
  });

  it("covers both cells of a 2.5×1 double door nudged half a tile right", () => {
    expect(cells(tile(7, 2, 2.5, 1, 16, 0))).toEqual(["7,2", "8,2"]);
  });

  it("keeps a 1.5-wide single door in its own cell — the overhang misses both neighbours", () => {
    // 48px of art centred on a 32px cell reaches 8px into each neighbour, which
    // is nowhere near their centres, so neither is claimed.
    expect(cells(tile(5, 15, 1.5, 1))).toEqual(["5,15"]);
  });

  it("keeps a sub-cell tile in its own cell", () => {
    expect(cells(tile(9, 9, 0.9, 0.9))).toEqual(["9,9"]);
  });

  it("falls back to the placed cell when a level omits the span fields", () => {
    // Generators and test fixtures build tiles as bare coordinates.
    expect(cells({ x: 2, y: 6 } as unknown as GameTile)).toEqual(["2,6"]);
  });

  it("scales the pixel offset by the tile size", () => {
    // The same 16px nudge is a whole cell on a 16px grid rather than half of
    // one, so the pane sits centred on row 5 and reaches the rows either side.
    expect(cells(tile(4, 4, 1, 2.5, 0, 16), 16)).toEqual(["4,4", "4,5", "4,6"]);
  });
});

describe("isSingleCell", () => {
  it("is true only for a 1×1 tile square on its own cell", () => {
    expect(isSingleCell(tile(1, 1))).toBe(true);
    expect(isSingleCell({ x: 1, y: 1 } as unknown as GameTile)).toBe(true);
    expect(isSingleCell(tile(1, 1, 1, 2.5, 0, 16))).toBe(false);
    expect(isSingleCell(tile(1, 1, 1.5, 1))).toBe(false);
    expect(isSingleCell(tile(1, 1, 0.9, 0.9))).toBe(false);
    // A 1×1 tile that is merely nudged still needs the offset honoured.
    expect(isSingleCell(tile(1, 1, 1, 1, 8, 0))).toBe(false);
  });
});

describe("footprintCentre", () => {
  it("is the cell centre plus the authored offset", () => {
    expect(footprintCentre(tile(18, 19, 1, 2.5, 0, 16), 32)).toEqual({ x: 592, y: 640 });
    expect(footprintCentre(tile(0, 0), 32)).toEqual({ x: 16, y: 16 });
  });
});

/** A placed tile carrying authored collider padding. */
function padded(
  pad: { Left?: number; Top?: number; Right?: number; Bottom?: number },
  colSpan = 1,
  rowSpan = 1,
  offsetX = 0,
  offsetY = 0,
): GameTile {
  return { x: 2, y: 3, colSpan, rowSpan, offsetX, offsetY, collider: pad } as unknown as GameTile;
}

describe("colliderRect", () => {
  it("returns the plain footprint when the tile declares no bounds", () => {
    expect(colliderRect(tile(2, 3), 32)).toEqual({ x: 64, y: 96, w: 32, h: 32 });
  });

  it("insets a wall from the bottom, leaving the strip in front walkable", () => {
    // The dominant case in the shipped map: `Bottom: 0.4` on ~1,600 wall tiles.
    expect(colliderRect(padded({ Bottom: 0.4 }), 32)).toEqual({
      x: 64,
      y: 96,
      w: 32,
      h: 32 - 0.4 * 32,
    });
  });

  it("insets each side independently", () => {
    expect(colliderRect(padded({ Left: 0.25 }), 32)).toEqual({ x: 72, y: 96, w: 24, h: 32 });
    expect(colliderRect(padded({ Top: 0.25 }), 32)).toEqual({ x: 64, y: 104, w: 32, h: 24 });
    expect(colliderRect(padded({ Right: 0.25 }), 32)).toEqual({ x: 64, y: 96, w: 24, h: 32 });
  });

  it("narrows a door jamb from both sides at once", () => {
    // `door_single_vertical1`: 1×1.5, nudged down 4px, jambs pulled in 0.2 each.
    const r = colliderRect(padded({ Left: 0.2, Right: 0.2 }, 1, 1.5, 0, 4), 32);
    expect(r.x).toBeCloseTo(64 + 6.4);
    expect(r.y).toBeCloseTo(96 + 4 - 8);
    expect(r.w).toBeCloseTo(32 - 12.8);
    expect(r.h).toBeCloseTo(48);
  });

  it("scales the inset with the tile size, like every other authored offset", () => {
    expect(colliderRect(padded({ Bottom: 0.5 }), 16).h).toBe(8);
  });

  it("never produces an inside-out box", () => {
    // Padding that eats the whole tile would otherwise give a negative width, and
    // Arcade reads that as a body you can stand inside.
    const r = colliderRect(padded({ Left: 0.8, Right: 0.8 }), 32);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  });

  it("keeps every cell the footprint claimed, for all the shipped insets", () => {
    // Why the coarse grid can ignore padding entirely: an inset of 0.4 or less
    // never moves a cell's centre out of the box, so pathfinding, sight and guard
    // vision keep working in whole cells while the player's body gets the detail.
    for (const side of ["Left", "Top", "Right", "Bottom"] as const) {
      const t = padded({ [side]: 0.4 });
      const r = colliderRect(t, 32);
      const centreX = (t.x + 0.5) * 32;
      const centreY = (t.y + 0.5) * 32;
      expect(centreX > r.x && centreX < r.x + r.w, `${side} keeps centre in x`).toBe(true);
      expect(centreY > r.y && centreY < r.y + r.h, `${side} keeps centre in y`).toBe(true);
    }
  });
});

describe("raySlabIntersect", () => {
  const rect = { x: 10, y: 10, w: 4, h: 4 }; // [10,14) x [10,14)

  it("finds the near-face distance for a ray heading straight at the rect", () => {
    expect(raySlabIntersect(0, 12, 1, 0, rect)).toBe(10);
  });

  it("returns undefined when the ray heads away from the rect", () => {
    expect(raySlabIntersect(0, 12, -1, 0, rect)).toBeUndefined();
  });

  it("returns undefined when the ray is parallel and outside the rect's band", () => {
    expect(raySlabIntersect(0, 20, 1, 0, rect)).toBeUndefined();
  });

  it("returns 0 when the origin already lies inside the rect", () => {
    expect(raySlabIntersect(12, 12, 1, 0, rect)).toBe(0);
  });

  it("handles a diagonal ray that clips a corner", () => {
    // Aimed at (10,10), the rect's corner — enters exactly there.
    const t = raySlabIntersect(0, 0, 10, 10, rect);
    expect(t).toBeCloseTo(1);
  });

  it("misses a diagonal ray that passes just outside the corner", () => {
    // By the time x reaches the rect's left edge (x=10), y has already climbed
    // past its top edge (y=14) — the ray has cleared the corner.
    expect(raySlabIntersect(0, 0, 9, 14, rect)).toBeUndefined();
  });

  it("handles an axis-aligned ray along an edge that grazes without entering", () => {
    // y=10 exactly is inside the [10,14) band (lo <= o), so this ray does clip it.
    expect(raySlabIntersect(0, 10, 1, 0, rect)).toBe(10);
    // Just above the band misses entirely.
    expect(raySlabIntersect(0, 14.5, 1, 0, rect)).toBeUndefined();
  });
});

describe("hasPlainCollider", () => {
  it("is true with no padding, and for padding that is all zeroes", () => {
    expect(hasPlainCollider(tile(1, 1))).toBe(true);
    expect(hasPlainCollider(padded({}))).toBe(true);
    expect(hasPlainCollider(padded({ Left: 0 }))).toBe(true);
  });

  it("is false once any side is padded", () => {
    expect(hasPlainCollider(padded({ Bottom: 0.4 }))).toBe(false);
  });
});
