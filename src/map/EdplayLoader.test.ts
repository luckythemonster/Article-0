import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { EdplayLoader, type ParsedMap } from "./EdplayLoader";
import { wallBodyRects, wallCells } from "./TileBake";
import { hasPlainCollider } from "./footprint";
import { CollisionGrid } from "../systems/CollisionGrid";
import { blockingLayerNames, type EdPlayFile, type GameLevel } from "./types";

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

  /**
   * Which cells have *some* body over them — merged whole-cell rectangles and
   * per-tile collider rectangles alike.
   *
   * Cell-for-cell equality between the grid and the body mask stopped being the
   * right invariant once tiles could declare their own bounds: a padded wall's
   * body deliberately covers only part of its cell. What still has to hold — and
   * what these tests are really for — is that no blocked cell is left with
   * nothing under it, which is the failure that lets a player walk through a
   * level border.
   */
  function bodyCoverage(level: GameLevel, tileSize: number): Uint8Array {
    const covered = new Uint8Array(level.width * level.height);
    // Both groups: the crawlable ones yield to a crouching player, but they are
    // still a body under a blocked cell, which is what this is checking for.
    const { walls, crawlable } = wallBodyRects(level, tileSize);
    for (const r of [...walls, ...crawlable]) {
      const x0 = Math.floor(r.x / tileSize);
      const y0 = Math.floor(r.y / tileSize);
      const x1 = Math.ceil((r.x + r.w) / tileSize) - 1;
      const y1 = Math.ceil((r.y + r.h) / tileSize) - 1;
      for (let y = Math.max(0, y0); y <= Math.min(level.height - 1, y1); y++) {
        for (let x = Math.max(0, x0); x <= Math.min(level.width - 1, x1); x++) {
          covered[y * level.width + x] = 1;
        }
      }
    }
    return covered;
  }

  it("blocks the west column and north row of main1, with bodies to match", () => {
    const main1 = parsed.map.levels.find((l) => l.name === "main1") as GameLevel;
    const grid = new CollisionGrid(main1, blockingLayerNames(main1), 32);
    const covered = bodyCoverage(main1, 32);

    for (let y = 0; y < main1.height; y++) {
      expect(grid.isBlocked(0, y), `(0,${y}) should block`).toBe(true);
      expect(covered[y * main1.width], `(0,${y}) needs a body`).toBe(1);
    }
    for (let x = 0; x < main1.width; x++) {
      expect(grid.isBlocked(x, 0), `(${x},0) should block`).toBe(true);
      expect(covered[x], `(${x},0) needs a body`).toBe(1);
    }
  });

  it("turns every plain wall tile on main1 into exactly one collision cell", () => {
    // main1's walls board holds 792 tiles, all 1×1. 336 of them carry authored collider
    // padding (`ColliderPadding` — see footprint.ts) and are deliberately excluded from
    // this coarse mask: they get their own precise body from `wallBodyRects` instead,
    // covered by the "no blocked cell without a body" test below. What this test still
    // has to hold is the original regression — before the NaN fix this produced 442, the
    // 84 border tiles (no X on the west column, no Y on the north row) silently lost.
    const main1 = parsed.map.levels.find((l) => l.name === "main1") as GameLevel;
    const walls = main1.layers.find((l) => l.name === "walls")!;
    expect(walls.tiles).toHaveLength(792);
    const plain = walls.tiles.filter((t) => hasPlainCollider(t));
    expect(plain).toHaveLength(456);
    const bodies = wallCells(main1, 32);
    expect(bodies.reduce((a: number, v: number) => a + v, 0)).toBe(plain.length);
  });

  it("leaves no blocked cell without a body, and no body outside a blocked cell", () => {
    // Two independent walks over the same boards; a disagreement means the player and
    // the guards are moving through different levels. Stated as coverage rather than
    // equality because a padded tile's body is smaller than its cell by design — the
    // cell is still blocked for the guards, and still has something in it for the
    // player to hit.
    for (const level of parsed.map.levels) {
      const grid = new CollisionGrid(level, blockingLayerNames(level), 32);
      const covered = bodyCoverage(level, 32);
      const uncovered: string[] = [];
      const stray: string[] = [];
      for (let y = 0; y < level.height; y++) {
        for (let x = 0; x < level.width; x++) {
          const blocked = grid.isBlocked(x, y);
          const hasBody = covered[y * level.width + x] === 1;
          if (blocked && !hasBody) uncovered.push(`${x},${y}`);
          if (!blocked && hasBody) stray.push(`${x},${y}`);
        }
      }
      expect(uncovered, `${level.name}: blocked cells with no body`).toEqual([]);
      expect(stray, `${level.name}: bodies outside any blocked cell`).toEqual([]);
    }
  });
});
