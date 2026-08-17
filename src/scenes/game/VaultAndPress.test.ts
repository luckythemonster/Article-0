import { describe, it, expect } from "vitest";
import { vaultTargetFor, type VaultQuery } from "./VaultAndPress";
import { VAULT_REACH_TILES } from "../../systems/EntityStats";

const TS = 16;

/** Facings, in the radians `Player.facing` uses. */
const EAST = 0;
const SOUTH = Math.PI / 2;
const WEST = Math.PI;
const NORTH = -Math.PI / 2;

/**
 * A board from a sparse map of `"tx,ty"` → cover height. Anything listed is
 * blocked; anything blocked without a height is a plain wall.
 */
function board(cells: Record<string, "low" | "high" | "wall">): VaultQuery {
  return {
    isBlocked: (tx, ty) => cells[`${tx},${ty}`] !== undefined,
    coverTypeAt: (px, py) => {
      const c = cells[`${Math.floor(px / TS)},${Math.floor(py / TS)}`];
      return c === "wall" ? undefined : c;
    },
  };
}

/** Centre of tile (tx, ty), in pixels. */
const at = (tx: number, ty: number): [number, number] => [(tx + 0.5) * TS, (ty + 0.5) * TS];

describe("vaultTargetFor", () => {
  it("hops the low crate ahead and lands two cells on", () => {
    const q = board({ "6,5": "low" });
    expect(vaultTargetFor(q, TS, ...at(5, 5), EAST)).toEqual({ x: 7, y: 5 });
  });

  it("works on all four cardinals", () => {
    expect(vaultTargetFor(board({ "5,6": "low" }), TS, ...at(5, 5), SOUTH)).toEqual({ x: 5, y: 7 });
    expect(vaultTargetFor(board({ "4,5": "low" }), TS, ...at(5, 5), WEST)).toEqual({ x: 3, y: 5 });
    expect(vaultTargetFor(board({ "5,4": "low" }), TS, ...at(5, 5), NORTH)).toEqual({ x: 5, y: 3 });
  });

  it("reduces a diagonal facing to its dominant axis", () => {
    // Facing east-south-east: the x component dominates, so this is an east hop
    // and should land squarely on the far side rather than anywhere diagonal.
    const q = board({ "6,5": "low" });
    expect(vaultTargetFor(q, TS, ...at(5, 5), Math.PI / 5)).toEqual({ x: 7, y: 5 });
  });

  it("refuses when there is nothing to go over", () => {
    expect(vaultTargetFor(board({}), TS, ...at(5, 5), EAST)).toBeNull();
  });

  it("refuses high cover — a rack is got into or hidden behind, not over", () => {
    expect(vaultTargetFor(board({ "6,5": "high" }), TS, ...at(5, 5), EAST)).toBeNull();
  });

  it("refuses a plain wall, which is blocked but is not cover", () => {
    expect(vaultTargetFor(board({ "6,5": "wall" }), TS, ...at(5, 5), EAST)).toBeNull();
  });

  it("refuses when the landing cell is occupied", () => {
    // The next crate along: cover reads as blocked, so this also stops him
    // landing on top of it.
    expect(vaultTargetFor(board({ "6,5": "low", "7,5": "low" }), TS, ...at(5, 5), EAST)).toBeNull();
    expect(vaultTargetFor(board({ "6,5": "low", "7,5": "wall" }), TS, ...at(5, 5), EAST)).toBeNull();
  });

  it("refuses an obstacle further than the reach, measured to its centre", () => {
    const q = board({ "6,5": "low" });
    // Standing at the far edge of tile 5 the crate's centre is within reach...
    expect(vaultTargetFor(q, TS, (5 + 0.5) * TS, (5 + 0.5) * TS, EAST)).not.toBeNull();
    // ...and backing off past VAULT_REACH_TILES puts it out of it.
    const tooFar = (6.5 - VAULT_REACH_TILES) * TS - 1;
    expect(vaultTargetFor(q, TS, tooFar, (5 + 0.5) * TS, EAST)).toBeNull();
  });

  it("breaks an exact 45-degree facing toward the horizontal", () => {
    // |cos| === |sin|, and the reduction tests `>=`, so x wins. The crate to the
    // east is vaulted; an identical one to the south is not.
    const diagonal = Math.PI / 4;
    expect(vaultTargetFor(board({ "6,5": "low" }), TS, ...at(5, 5), diagonal)).toEqual({
      x: 7,
      y: 5,
    });
    expect(vaultTargetFor(board({ "5,6": "low" }), TS, ...at(5, 5), diagonal)).toBeNull();
  });
});
