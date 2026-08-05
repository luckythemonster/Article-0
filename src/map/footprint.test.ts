import { describe, expect, it } from "vitest";
import { footprintCells, footprintCentre, isSingleCell } from "./footprint";
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
