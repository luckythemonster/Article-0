import { describe, expect, it } from "vitest";
import { blockingLayerNames, isForcedSolid } from "./types";
import type { GameLevel, GameTile } from "./types";

/** A level of named boards, each with an optional authored `Collision` value. */
function levelOf(boards: [string, number | undefined][]): GameLevel {
  return {
    name: "t",
    width: 8,
    height: 8,
    layers: boards.map(([name, collision]) => ({
      name,
      tiles: [{ x: 1, y: 1 }],
      collision,
    })),
  } as unknown as GameLevel;
}

describe("blockingLayerNames", () => {
  it("takes the boards the map marked solid", () => {
    const names = blockingLayerNames(
      levelOf([
        ["floor", undefined],
        ["walls", 1],
        ["cover", 1],
        ["light_sources", 2],
        ["terminals", 2],
      ]),
    );
    expect(names.sort()).toEqual(["cover", "walls"]);
  });

  it("does not block boards marked as markers, or left unclassified", () => {
    // The roof deck: `roof` and `platform` carry collider padding because the *art*
    // does, but they are the floor you stand on. Blocking them would make the level
    // unplayable, which is why this defaults to the board's call. A tile can still
    // opt itself in via `isForcedSolid` — that's layered on by the consumers
    // (`CollisionGrid`, `TileBake`), not by this function.
    const names = blockingLayerNames(
      levelOf([
        ["roof", undefined],
        ["platform", undefined],
        ["building", 2],
        ["rain", 2],
        ["fence", undefined],
      ]),
    );
    expect(names).toEqual(["fence"]);
  });

  it("blocks the roof's fence even though the map never classified it", () => {
    const names = blockingLayerNames(levelOf([["fence", undefined]]));
    expect(names).toEqual(["fence"]);
  });

  it("falls back to walls when no board declares anything", () => {
    // Generated levels and older exports carry no `Collision` at all; they have to
    // keep behaving exactly as they did before any of this was read.
    const names = blockingLayerNames(
      levelOf([
        ["floor", undefined],
        ["walls", undefined],
        ["cover", undefined],
      ]),
    );
    expect(names).toEqual(["walls"]);
  });

  it("returns nothing for a level with no solid board at all", () => {
    expect(blockingLayerNames(levelOf([["floor", undefined]]))).toEqual([]);
  });
});

describe("isForcedSolid", () => {
  const tile = (collisionMode?: number): GameTile =>
    ({ x: 1, y: 1, collisionMode }) as unknown as GameTile;

  it("is true only for the confirmed 'wall' collision mode, 1", () => {
    expect(isForcedSolid(tile(1))).toBe(true);
  });

  it("is false when absent, or for any other value", () => {
    expect(isForcedSolid(tile(undefined))).toBe(false);
    // "ignore"'s numeric encoding has never been observed in an export — treated
    // as unhandled rather than guessed, same as any value that isn't 1.
    expect(isForcedSolid(tile(0))).toBe(false);
    expect(isForcedSolid(tile(2))).toBe(false);
  });
});
