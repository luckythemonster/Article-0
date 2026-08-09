import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { CollisionGrid } from "../systems/CollisionGrid";
import { EdplayLoader } from "./EdplayLoader";
import { colliderRect, hasPlainCollider } from "./footprint";
import { wallBodyRects } from "./TileBake";
import { blockingLayerNames } from "./types";
import type { EdPlayFile, GameLevel, GameTile } from "./types";

/**
 * The shipped map's glazing, against the real `edplay.json`.
 *
 * NW-SMAC-01's glazing isn't the old map's shape — two hand-placed 1×2.5 panes
 * on the `walls` board. This map glazes generously: 55 clear-glass tiles across
 * `main1` and `main2`, almost all plain 1×1 tiles on `walls` (main2's read as a
 * long observation window at y=7 and y=15), plus three genuine glass **doors**
 * (1×1.5, nudged down 16px) on the separate `doors` board.
 *
 * Written as a property test over whatever glazing the map actually authors,
 * rather than a hardcoded coordinate list — the point of glazing is "solid but
 * see-through", and that should hold for every glass tile the map ever ends up
 * with, not just the ones present the day this file was last updated.
 */
describe("the shipped map's glazing", () => {
  const TILE_SIZE = 32;

  let levels: GameLevel[];
  /** Every `walls`-board tile carrying a clear (non-VisionBlock) glass component. */
  let wallGlass: { level: GameLevel; tile: GameTile }[];
  /** The three glass door fixtures, wherever they are. */
  let glassDoors: { level: GameLevel; tile: GameTile }[];

  beforeAll(() => {
    const raw = JSON.parse(
      readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
    ) as EdPlayFile;
    const parsed = EdplayLoader.parse(raw, raw.SpriteSheets.map((s) => s.RelativePath));
    levels = parsed.map.levels;

    const isClearGlass = (t: GameTile): boolean => {
      const glass = t.components.find((c) => c.type === "glass");
      return glass !== undefined && glass.values.VisionBlock !== "true" && glass.values.VisionBlock !== "1";
    };

    wallGlass = [];
    glassDoors = [];
    for (const level of levels) {
      for (const layer of level.layers) {
        for (const tile of layer.tiles) {
          if (!isClearGlass(tile)) continue;
          if (layer.name === "walls") wallGlass.push({ level, tile });
          else if (layer.name === "doors") glassDoors.push({ level, tile });
        }
      }
    }
  });

  it("finds glazing on both boards this map actually uses", () => {
    // A sanity check on the fixtures above, not a coordinate pin: if this map stops
    // authoring glass altogether the rest of the file is vacuously true, which would
    // hide a real regression. At least one of each kind is the floor for that.
    expect(wallGlass.length).toBeGreaterThan(0);
    expect(glassDoors.length).toBeGreaterThan(0);
  });

  it("every wall-board glass tile blocks movement but lets sight through", () => {
    const byLevel = new Map<string, CollisionGrid>();
    const gridFor = (level: GameLevel): CollisionGrid => {
      let g = byLevel.get(level.name);
      if (!g) {
        g = new CollisionGrid(level, blockingLayerNames(level), TILE_SIZE);
        byLevel.set(level.name, g);
      }
      return g;
    };
    for (const { level, tile } of wallGlass) {
      const grid = gridFor(level);
      expect(grid.isBlocked(tile.x, tile.y), `${level.name} (${tile.x},${tile.y}) should block`).toBe(
        true,
      );
      expect(
        grid.blocksSight(tile.x, tile.y),
        `${level.name} (${tile.x},${tile.y}) should be a window`,
      ).toBe(false);
    }
  });

  it("gives every wall-board glass tile a player collision body", () => {
    // The grid drives pathing and radar; the Arcade bodies are what actually stop the
    // player, built from a separate walk over the board.
    const byLevel = new Map<string, ReturnType<typeof wallBodyRects>>();
    const rectsFor = (level: GameLevel): ReturnType<typeof wallBodyRects> => {
      let r = byLevel.get(level.name);
      if (!r) {
        r = wallBodyRects(level, TILE_SIZE);
        byLevel.set(level.name, r);
      }
      return r;
    };
    const coveredBy = (rects: ReturnType<typeof wallBodyRects>, px: number, py: number): boolean =>
      rects.some((r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);

    for (const { level, tile } of wallGlass) {
      const rects = rectsFor(level);
      const centre = { x: (tile.x + 0.5) * TILE_SIZE, y: (tile.y + 0.5) * TILE_SIZE };
      expect(
        coveredBy(rects, centre.x, centre.y),
        `${level.name} (${tile.x},${tile.y}) needs a body`,
      ).toBe(true);
    }
  });

  it("authors the three glass doors as fixtures, not static wall glazing", () => {
    for (const { tile } of glassDoors) {
      expect(tile.colSpan).toBe(1);
      expect(tile.rowSpan).toBe(1.5);
      expect(tile.offsetY).toBe(-4);
    }
    // The coordinates a future map export could plausibly move — pinned so a change
    // here is a deliberate, visible one rather than a silent drift.
    const byLevel = glassDoors.map(({ level, tile }) => `${level.name} ${tile.x},${tile.y}`).sort();
    expect(byLevel).toEqual(["main1 9,13", "main2 26,16", "main2 26,6"]);
  });

  it("resolves each glass door's collider to its footprint, jambs narrowed as authored", () => {
    // Doors aren't in blockingLayerNames — they get their own static body from
    // Door.ts at scene-build time, a separate, already-established mechanism this
    // file isn't re-simulating. What belongs here is the geometry Door.ts will read.
    //
    // These are also `ColliderPadding`-bearing: {Left: 0.2, Right: 0.2} pulls each
    // jamb in from both sides, so the body is narrower than the full-height frame —
    // the same authored inset every padded wall tile gets, just on a door.
    for (const { tile } of glassDoors) {
      expect(hasPlainCollider(tile)).toBe(false);
      const rect = colliderRect(tile, TILE_SIZE);
      expect(rect.w).toBeCloseTo(TILE_SIZE - 2 * 0.2 * TILE_SIZE);
      expect(rect.h).toBe(1.5 * TILE_SIZE);
    }
  });
});
