import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { CollisionGrid } from "../systems/CollisionGrid";
import { EdplayLoader } from "./EdplayLoader";
import { wallBodyRects } from "./TileBake";
import { blockingLayerNames, isCrawlable } from "./types";
import type { EdPlayFile, GameLevel } from "./types";

/**
 * The squeeze, against the real `edplay.json`.
 *
 * A crouching player passes through cover because the cover cells get their own
 * Arcade body group, which `GameScene` switches off while he is crouched. Two
 * things have to be true for that to mean anything, and neither is visible from
 * a synthetic fixture:
 *
 *  1. the cover tiles the shipped map actually authors end up in the `crawlable`
 *     group and *nothing else does* — a wall filed there would be a wall you can
 *     crawl through;
 *  2. the collision grid is untouched, so guards still treat cover as solid and
 *     cannot follow Rowan into the desk he just crawled under.
 *
 * Written against whatever the map authors rather than a hardcoded tile list,
 * except for the one count that is worth pinning — see the last test.
 */
describe("the shipped map's crawlable cover", () => {
  const TILE_SIZE = 32;

  let levels: GameLevel[];

  beforeAll(() => {
    const raw = JSON.parse(
      readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
    ) as EdPlayFile;
    const parsed = EdplayLoader.parse(
      raw,
      raw.SpriteSheets.map((s) => s.RelativePath),
    );
    levels = parsed.map.levels;
  });

  /** Cells covered by a group's rectangles, as `"x,y"` keys. */
  const cellsOf = (rects: { x: number; y: number; w: number; h: number }[]): Set<string> => {
    const out = new Set<string>();
    for (const r of rects) {
      for (let y = Math.floor(r.y / TILE_SIZE); y < Math.ceil((r.y + r.h) / TILE_SIZE); y++) {
        for (let x = Math.floor(r.x / TILE_SIZE); x < Math.ceil((r.x + r.w) / TILE_SIZE); x++) {
          out.add(`${x},${y}`);
        }
      }
    }
    return out;
  };

  it("files every solid cover tile as crawlable, and only cover", () => {
    for (const level of levels) {
      const blocking = blockingLayerNames(level);
      const coverBoard = level.layers.find((l) => l.name === "cover");
      // Only boards that are solid in the first place can be crawled *through*.
      const coverIsSolid = !!coverBoard && blocking.includes(coverBoard.name);
      const crawlable = cellsOf(wallBodyRects(level, TILE_SIZE).crawlable);

      if (!coverIsSolid) {
        expect(crawlable.size, `${level.name} has no solid cover board`).toBe(0);
        continue;
      }
      for (const t of coverBoard!.tiles) {
        expect(crawlable.has(`${t.x},${t.y}`), `${level.name} cover (${t.x},${t.y})`).toBe(true);
      }
      // Nothing off the cover board may sneak into the group.
      const coverCells = new Set(coverBoard!.tiles.map((t) => `${t.x},${t.y}`));
      for (const cell of crawlable) {
        expect(coverCells.has(cell), `${level.name} crawlable cell ${cell} is not cover`).toBe(true);
      }
    }
  });

  it("keeps cover solid in the collision grid, so guards can't follow you in", () => {
    for (const level of levels) {
      const blocking = blockingLayerNames(level);
      const coverBoard = level.layers.find((l) => l.name === "cover");
      if (!coverBoard || !blocking.includes(coverBoard.name)) continue;
      const grid = new CollisionGrid(level, blocking, TILE_SIZE);
      for (const t of coverBoard.tiles) {
        // The player's Arcade body is what yields to a crouch; pathing, radar and
        // knocking all read this, and they must not.
        expect(grid.isBlocked(t.x, t.y), `${level.name} cover (${t.x},${t.y})`).toBe(true);
      }
    }
  });

  it("leaves the walls group free of cover", () => {
    for (const level of levels) {
      const coverBoard = level.layers.find((l) => l.name === "cover");
      if (!coverBoard || !blockingLayerNames(level).includes(coverBoard.name)) continue;
      const walls = cellsOf(wallBodyRects(level, TILE_SIZE).walls);
      for (const t of coverBoard.tiles) {
        expect(walls.has(`${t.x},${t.y}`), `${level.name} cover (${t.x},${t.y}) in walls`).toBe(
          false,
        );
      }
    }
  });

  it("names `cover` as the one crawlable board", () => {
    // A guard against widening this by accident: every extra board named here is
    // a board a crouching player walks through.
    expect(isCrawlable("cover")).toBe(true);
    expect(isCrawlable("walls")).toBe(false);
    expect(isCrawlable("fence")).toBe(false);
  });

  it("tags each crawlable body with the tile it belongs to, one body per tile", () => {
    // The whole point of the per-tile split: `Cover.destroy()` looks up its own
    // body by (tileX, tileY) rather than trusting a merged rect that might also
    // cover a tile it was never asked to free.
    for (const level of levels) {
      const blocking = blockingLayerNames(level);
      const coverBoard = level.layers.find((l) => l.name === "cover");
      if (!coverBoard || !blocking.includes(coverBoard.name)) continue;
      const crawlable = wallBodyRects(level, TILE_SIZE).crawlable;
      expect(crawlable, level.name).toHaveLength(coverBoard.tiles.length);
      for (const t of coverBoard.tiles) {
        const matches = crawlable.filter((r) => r.tileX === t.x && r.tileY === t.y);
        expect(matches, `${level.name} cover (${t.x},${t.y})`).toHaveLength(1);
      }
    }
  });

  it("gives the squeeze something real to do on the decks it ships with", () => {
    // Pinned because the mechanic is worth nothing if the map stops authoring
    // solid cover: main1's desk and boxes, duct2's and main2's server racks.
    // The rooftop's cover board is not solid, so it is walked over, not through.
    const counts = Object.fromEntries(
      levels.map((l) => [l.name, cellsOf(wallBodyRects(l, TILE_SIZE).crawlable).size]),
    );
    expect(counts).toMatchObject({ main1: 5, duct2: 5, main2: 50, roof_array: 0 });
  });
});
