import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { EdplayLoader, type ParsedMap } from "./EdplayLoader";
import { wallCells } from "./TileBake";
import { CollisionGrid } from "../systems/CollisionGrid";
import type { EdPlayFile, GameLevel } from "./types";

/**
 * The exporter omits any field sitting at its default, so a tile at column 0 has no
 * `X` and a tile in row 0 has no `Y`. Reading them straight through produced
 * `undefined` coordinates, which every consumer then swallowed in its own way — the
 * grid's bounds check rejected them, the wall-body mask wrote to `solid[NaN]`, and the
 * bake drew at `NaN` pixels. The whole west column and north row of every level were
 * invisible and had no collision.
 */
describe("EdplayLoader — omitted coordinates mean zero", () => {
  it("parses a tile with no X/Y as (0, 0)", () => {
    const raw = {
      SpriteSheets: [],
      TileDefs: [],
      DataTypes: { EnumDefs: [], DataStructures: [] },
      Width: 4,
      Height: 4,
      TileWidth: 32,
      TileHeight: 32,
      Name: "t",
      Levels: [
        {
          Name: "only",
          Boards: [
            {
              Name: "walls",
              Width: 4,
              Height: 4,
              // X omitted, Y omitted, and one with each present — the four cases.
              Tiles: [{ Handle: 1 }, { X: 2, Handle: 1 }, { Y: 3, Handle: 1 }, { X: 1, Y: 1, Handle: 1 }],
            },
          ],
        },
      ],
    } as unknown as EdPlayFile;

    const tiles = EdplayLoader.parse(raw, []).map.levels[0].layers[0].tiles;
    expect(tiles.map((t) => `${t.x},${t.y}`)).toEqual(["0,0", "2,0", "0,3", "1,1"]);
    for (const t of tiles) {
      expect(Number.isInteger(t.x), `x of ${JSON.stringify(t)}`).toBe(true);
      expect(Number.isInteger(t.y), `y of ${JSON.stringify(t)}`).toBe(true);
    }
  });
});

describe("the shipped map's level borders", () => {
  let parsed: ParsedMap;

  beforeAll(() => {
    const raw = JSON.parse(
      readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
    ) as EdPlayFile;
    parsed = EdplayLoader.parse(raw, raw.SpriteSheets.map((s) => s.RelativePath));
  });

  it("gives every parsed tile a finite integer coordinate", () => {
    const bad: string[] = [];
    for (const level of parsed.map.levels) {
      for (const layer of level.layers) {
        for (const t of layer.tiles) {
          if (!Number.isInteger(t.x) || !Number.isInteger(t.y)) bad.push(`${level.name}/${layer.name} ${t.ref}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("blocks the west column and north row of main1, with bodies to match", () => {
    const main1 = parsed.map.levels.find((l) => l.name === "main1") as GameLevel;
    const grid = new CollisionGrid(main1, ["walls"], 32);
    const bodies = wallCells(main1, 32);

    for (let y = 0; y < main1.height; y++) {
      expect(grid.isBlocked(0, y), `(0,${y}) should block`).toBe(true);
      expect(bodies[y * main1.width], `(0,${y}) needs a body`).toBe(1);
    }
    for (let x = 0; x < main1.width; x++) {
      expect(grid.isBlocked(x, 0), `(${x},0) should block`).toBe(true);
      expect(bodies[x], `(${x},0) needs a body`).toBe(1);
    }
  });

  it("turns every wall tile on main1 into a collision cell", () => {
    // main1's walls board holds 526 tiles, all 1×1 — the count TileBake's own doc
    // table quotes. Before the fix this produced 442, the 84 border tiles silently lost.
    const main1 = parsed.map.levels.find((l) => l.name === "main1") as GameLevel;
    const walls = main1.layers.find((l) => l.name === "walls")!;
    const bodies = wallCells(main1, 32);
    expect(walls.tiles).toHaveLength(526);
    expect(bodies.reduce((a: number, v: number) => a + v, 0)).toBe(526);
  });

  it("keeps the collision grid and the collision bodies in exact agreement", () => {
    // Two independent walks over the same board; a disagreement means the player and
    // the guards are moving through different levels.
    for (const level of parsed.map.levels) {
      const grid = new CollisionGrid(level, ["walls"], 32);
      const bodies = wallCells(level, 32);
      const mismatch: string[] = [];
      for (let y = 0; y < level.height; y++) {
        for (let x = 0; x < level.width; x++) {
          if (grid.isBlocked(x, y) !== (bodies[y * level.width + x] === 1)) mismatch.push(`${x},${y}`);
        }
      }
      expect(mismatch, `${level.name} grid/body mismatch`).toEqual([]);
    }
  });
});
