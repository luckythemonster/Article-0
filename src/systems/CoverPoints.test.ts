import { describe, it, expect } from "vitest";
import { coverTilesNear, type CoverBoards } from "./CoverPoints";

const TS = 16;
const W = 10;
const H = 10;

/** A board where the listed cells are cover, and nothing is blocked. */
function cover(...cells: string[]): CoverBoards {
  const set = new Set(cells);
  return {
    isBlocked: () => false,
    coverTypeAt: (px, py) =>
      set.has(`${Math.floor(px / TS)},${Math.floor(py / TS)}`) ? "low" : undefined,
  };
}

const near = (boards: CoverBoards, tx: number, ty: number, r: number) =>
  coverTilesNear(boards, W, H, TS, tx, ty, r);

describe("coverTilesNear", () => {
  it("returns tile centres in pixels", () => {
    expect(near(cover("5,5"), 5, 5, 1)).toEqual([{ x: 5.5 * TS, y: 5.5 * TS }]);
  });

  it("finds nothing when there is no cover in range", () => {
    expect(near(cover("9,9"), 2, 2, 2)).toEqual([]);
  });

  it("includes cover exactly on the radius and excludes cover past it", () => {
    // withinOrEqual, so the boundary is inclusive.
    expect(near(cover("7,5"), 5, 5, 2)).toHaveLength(1);
    expect(near(cover("8,5"), 5, 5, 2)).toHaveLength(0);
  });

  it("measures by true distance rather than by the scan box", () => {
    // (7,7) is inside the box for radius 2 but 2.83 tiles away, so it is out.
    expect(near(cover("7,7"), 5, 5, 2)).toHaveLength(0);
  });

  it("skips cover a standing man could not enter", () => {
    const blocked: CoverBoards = { ...cover("5,5"), isBlocked: () => true };
    expect(near(blocked, 5, 5, 2)).toEqual([]);
  });

  it("clamps the scan to the map rather than running off its edges", () => {
    // Radius 4 from the corner would scan negative tiles and past the far edge.
    const boards = cover("0,0", "1,1");
    const out = near(boards, 0, 0, 4);
    expect(out).toEqual([
      { x: 0.5 * TS, y: 0.5 * TS },
      { x: 1.5 * TS, y: 1.5 * TS },
    ]);
    expect(near(boards, W - 1, H - 1, 4)).toEqual([]);
  });

  it("returns every cover tile in range, in row-major order", () => {
    const out = near(cover("4,5", "5,5", "6,5", "5,4"), 5, 5, 1);
    expect(out).toEqual([
      { x: 5.5 * TS, y: 4.5 * TS },
      { x: 4.5 * TS, y: 5.5 * TS },
      { x: 5.5 * TS, y: 5.5 * TS },
      { x: 6.5 * TS, y: 5.5 * TS },
    ]);
  });
});
