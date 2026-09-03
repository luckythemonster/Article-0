import { describe, it, expect } from "vitest";
import {
  clearanceAt,
  emptyClearanceMap,
  isCleared,
  NO_CLEARANCE,
  requireClearance,
  restrictedTileCount,
} from "./Clearance";
import { keycardName } from "./EntityStats";

/**
 * The rules half of restricted areas — what ground demands, and what answers it.
 *
 * The derivation that fills these maps in is tested against the real export in
 * `src/map/AutoClearance.test.ts`. This file is about the two questions asked every
 * frame, and in particular about the ways they must fail *open*: a missing map and a
 * tile off the edge of the deck both have to read as ground anyone may stand on,
 * because the one thing this must never do is invent a restriction the map never made.
 */

const mapWith = (entries: [number, number, number][]) => {
  const m = emptyClearanceMap(8, 4);
  for (const [x, y, c] of entries) requireClearance(m, x, y, c);
  return m;
};

describe("clearanceAt", () => {
  it("reads back the clearance a tile was given", () => {
    const m = mapWith([[3, 2, 2]]);
    expect(clearanceAt(m, 3, 2)).toBe(2);
  });

  it("answers open for every tile nobody restricted", () => {
    const m = mapWith([[3, 2, 2]]);
    expect(clearanceAt(m, 3, 1)).toBe(NO_CLEARANCE);
    expect(clearanceAt(m, 2, 2)).toBe(NO_CLEARANCE);
  });

  it("answers open for a level nobody derived areas for", () => {
    // A level with no restricted ground has no map at all, and every caller would
    // otherwise need its own `?? 0` — which is exactly where one of them forgets.
    expect(clearanceAt(undefined, 0, 0)).toBe(NO_CLEARANCE);
  });

  it("answers open off the edge of the deck rather than wrapping", () => {
    // Row-major indexing makes (-1, 2) and (7, 1) the same cell if you don't bounds
    // check, so an out-of-bounds read could report a restriction from the row above.
    const m = mapWith([[7, 1, 3]]);
    expect(clearanceAt(m, -1, 2)).toBe(NO_CLEARANCE);
    expect(clearanceAt(m, 8, 2)).toBe(NO_CLEARANCE);
    expect(clearanceAt(m, 3, -1)).toBe(NO_CLEARANCE);
    expect(clearanceAt(m, 3, 4)).toBe(NO_CLEARANCE);
  });

  it("floors a fractional tile rather than rejecting it", () => {
    // The caller divides pixels by tile size and hands the result straight over.
    const m = mapWith([[3, 2, 2]]);
    expect(clearanceAt(m, 3.9, 2.1)).toBe(2);
  });
});

describe("requireClearance", () => {
  it("takes the higher of two claims on the same ground", () => {
    // A terminal's apron inside a room already sealed behind a clearance-3 door: the
    // room is as restricted as its strictest way in, and whichever source ran second
    // must not be able to lower it.
    const m = emptyClearanceMap(8, 4);
    requireClearance(m, 1, 1, 3);
    requireClearance(m, 1, 1, 2);
    expect(clearanceAt(m, 1, 1)).toBe(3);
  });

  it("ignores a clearance of zero rather than clearing what's there", () => {
    const m = mapWith([[1, 1, 2]]);
    requireClearance(m, 1, 1, 0);
    expect(clearanceAt(m, 1, 1)).toBe(2);
  });

  it("clamps rather than wrapping a clearance past a byte", () => {
    // 256 wrapping to 0 would turn the most restricted ground in the game into open
    // floor — the one arithmetic slip here that fails *open*.
    const m = emptyClearanceMap(8, 4);
    requireClearance(m, 1, 1, 300);
    expect(clearanceAt(m, 1, 1)).toBe(255);
  });

  it("ignores a tile off the edge instead of corrupting a neighbour", () => {
    const m = emptyClearanceMap(8, 4);
    requireClearance(m, -1, 2, 2);
    requireClearance(m, 8, 2, 2);
    expect(restrictedTileCount(m)).toBe(0);
  });
});

describe("isCleared", () => {
  it("admits anyone to unrestricted ground, empty-handed included", () => {
    expect(isCleared(NO_CLEARANCE, [])).toBe(true);
  });

  it("admits the holder of the matching numbered card", () => {
    expect(isCleared(2, [keycardName(2)])).toBe(true);
  });

  it("refuses a card of the wrong number", () => {
    // The state the shipped map is actually in: `main1` hands out a Keycard 1, and
    // every derived area on the map is clearance 2.
    expect(isCleared(2, [keycardName(1)])).toBe(false);
    expect(isCleared(2, [keycardName(3)])).toBe(false);
  });

  it("refuses empty hands and unrelated kit", () => {
    expect(isCleared(2, [])).toBe(false);
    expect(isCleared(2, ["Medkit", "Battery", "Q0_COMPLIANCE_CERT"])).toBe(false);
  });

  it("names the card the same way a door does", () => {
    // The whole point of going through `keycardName`: one item family, asked about by
    // two systems, which must never disagree about what the item is called.
    expect(isCleared(4, ["Keycard 4"])).toBe(true);
  });
});

describe("restrictedTileCount", () => {
  it("counts only restricted ground, and nothing for an absent map", () => {
    expect(
      restrictedTileCount(
        mapWith([
          [1, 1, 2],
          [2, 1, 2],
        ]),
      ),
    ).toBe(2);
    expect(restrictedTileCount(undefined)).toBe(0);
  });
});
