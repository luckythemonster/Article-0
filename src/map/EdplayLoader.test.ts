import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { EdplayLoader, NO_TINT, multiplyTint, tintRgb, type ParsedMap } from "./EdplayLoader";
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

describe("EdplayLoader — mirrored frames", () => {
  it("carries a keyframe's FlipY onto the placed tile", () => {
    // How the editor gets two facings out of one sprite rect. NW-SMAC-01 draws
    // both ends of the main2 <-> main2vault staircase from `stairs1_39` and flips
    // the one you see from the other side; ignoring the field drew that stair, and
    // the rooftop's south ramp, facing the wrong way.
    const raw = {
      SpriteSheets: [
        { RelativePath: "s.png", RenderedPath: "s.png", Width: 64, Height: 32, Id: "s",
          Sprites: [{ X: 0, Y: 0, Width: 32, Height: 32, Ref: "stairs1_39" }] },
      ],
      TileDefs: [
        { Handle: 1, Ref: "down", ColSpan: 1, RowSpan: 1, DataComponents: [],
          Animation: { Rate: 1, KeyFrames: [{ SpriteId: "stairs1_39", Duration: 1, DurationMax: 1 }] } },
        { Handle: 2, Ref: "up", ColSpan: 1, RowSpan: 1, DataComponents: [],
          Animation: { Rate: 1, KeyFrames: [{ SpriteId: "stairs1_39", Duration: 1, DurationMax: 1, FlipY: true }] } },
      ],
      DataTypes: { EnumDefs: [], DataStructures: [] },
      Width: 4, Height: 4, TileWidth: 32, TileHeight: 32, Name: "t",
      Levels: [{ Name: "only", Id: "l", Boards: [
        { Name: "verticals", Width: 4, Height: 4, IsVisible: true, Id: "b",
          Tiles: [{ Handle: 1, X: 1, Y: 1 }, { Handle: 2, X: 2, Y: 1 }] },
      ] }],
    } as unknown as EdPlayFile;

    const tiles = EdplayLoader.parse(raw, ["s.png"]).map.levels[0].layers[0].tiles;
    expect(tiles.map((t) => t.flipY)).toEqual([false, true]);
    // One sprite rect, one registered frame — the flip is a property of the
    // placement, not of the atlas entry, or the two defs would fight over it.
    expect(tiles[0].frame?.frameKey).toBe(tiles[1].frame?.frameKey);
  });
});

describe("tints", () => {
  it("drops the alpha byte off an editor colour", () => {
    expect(tintRgb(0xffa6d8ff)).toBe(0xa6d8ff);
    expect(tintRgb(0xff808080)).toBe(0x808080);
    // Opaque white is the editor's "no tint", and so is an absent field.
    expect(tintRgb(0xffffffff)).toBe(NO_TINT);
    expect(tintRgb(undefined)).toBe(NO_TINT);
    // A marker def carries alpha 0; the RGB is still white, which is what matters
    // since the tile draws nothing either way.
    expect(tintRgb(0x00ffffff)).toBe(NO_TINT);
  });

  it("multiplies a board's tint by the def's own, per channel", () => {
    // secret2 lights its door room blue and separately dims the secret door.
    // The door is meant to be both, so the two compose rather than one winning.
    expect(multiplyTint(0xc3e8ff, 0xcccccc)).toBe(0x9cbacc);
    // Either side being "none" leaves the other untouched, exactly.
    expect(multiplyTint(NO_TINT, 0x4d5b90)).toBe(0x4d5b90);
    expect(multiplyTint(0x4d5b90, NO_TINT)).toBe(0x4d5b90);
    expect(multiplyTint(NO_TINT, NO_TINT)).toBe(NO_TINT);
    // Black annihilates, white is the identity — the two ends of the range.
    expect(multiplyTint(0x000000, 0xa6d8ff)).toBe(0x000000);
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

  it("carries every authored tint onto the tiles that wear it", () => {
    // Five of the nine decks are graded, and unread they all render the same grey.
    // Pinned so an export that drops the grading is visible rather than silent.
    const graded: Record<string, Record<string, string>> = {};
    for (const level of parsed.map.levels) {
      for (const board of level.layers) {
        const tinted = board.tiles.find((t) => t.tint !== NO_TINT);
        if (!tinted) continue;
        graded[level.name] ??= {};
        graded[level.name][board.name] = tinted.tint.toString(16).padStart(6, "0");
      }
    }
    expect(graded).toEqual({
      main1: { floor: "a6d8ff", cover: "d0d0d0" },
      duct1: { floor: "d5ffcf", walls: "4d5b90", verticals: "ff1602" },
      // duct2 and vent_core carry no board tint — these are the two stair pieces
      // the author darkened on the def itself.
      duct2: { verticals: "808080" },
      vent_core: { floor: "ffedb0", drips: "ffbc6f", verticals: "808080" },
      main2vault: { floor: "f3b0ff", walls: "c6ffd6" },
      secret2: { floor: "e4b6ff", walls: "c3e8ff", doors: "c3e8ff", verticals: "e8ff2c" },
    });
  });

  it("finds both of the shipped map's mirrored tiles", () => {
    const flipped = parsed.map.levels.flatMap((l) =>
      l.layers.flatMap((b) => b.tiles.filter((t) => t.flipY).map((t) => `${l.name} ${t.ref}`)),
    );
    expect(flipped.sort()).toEqual([
      "main2vault stairs_down_north_cement1",
      "roof_array ramp_up_south_metal1",
    ]);
  });

  it("turns every plain wall tile on main1 into exactly one collision cell", () => {
    // main1's walls board holds 318 tiles, all 1×1. 157 of them carry authored collider
    // padding (`ColliderPadding` — see footprint.ts) and are deliberately excluded from
    // this coarse mask: they get their own precise body from `wallBodyRects` instead,
    // covered by the "no blocked cell without a body" test below. What this test still
    // has to hold is the original regression — the border tiles (no X on the west
    // column, no Y on the north row) were silently lost before the NaN fix.
    const main1 = parsed.map.levels.find((l) => l.name === "main1") as GameLevel;
    const walls = main1.layers.find((l) => l.name === "walls")!;
    expect(walls.tiles).toHaveLength(318);
    const plain = walls.tiles.filter((t) => hasPlainCollider(t));
    expect(plain).toHaveLength(161);
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
