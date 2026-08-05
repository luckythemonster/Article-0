import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { CollisionGrid } from "../systems/CollisionGrid";
import { EdplayLoader } from "./EdplayLoader";
import { wallCells } from "./TileBake";
import type { EdPlayFile, GameLevel } from "./types";

/**
 * The shipped map's static glazing, against the real `edplay.json`.
 *
 * `main2` glazes the jambs of the passage south out of its row-19 corridor with
 * two `door_glass_double_vertical0` tiles placed on the **walls** board — glass
 * on a blocking board, which `docs/MAP_AUTHORING.md` documents as a supported
 * authoring pattern and which nothing else in the map uses.
 *
 * They are authored 1×2.5 with a 16px vertical nudge, so each one covers two
 * cells. Every static-tile path used to assume one cell at the tile's own
 * coordinates, which left the lower half of each pane with no collision at all
 * — you walked straight through it. These are the coordinates that regressed.
 */
describe("main2's static glass panes", () => {
  const TILE_SIZE = 32;
  /** Both panes, as the cells each one is authored to cover. */
  const PANES = [
    [
      { x: 18, y: 19 },
      { x: 18, y: 20 },
    ],
    [
      { x: 21, y: 19 },
      { x: 21, y: 20 },
    ],
  ];

  let main2: GameLevel;
  let grid: CollisionGrid;

  beforeAll(() => {
    const raw = JSON.parse(
      readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
    ) as EdPlayFile;
    const parsed = EdplayLoader.parse(
      raw,
      raw.SpriteSheets.map((s) => s.RelativePath),
    );
    const level = parsed.map.levels.find((l) => l.name === "main2");
    expect(level, "main2 is missing from the map").toBeDefined();
    main2 = level!;
    grid = new CollisionGrid(main2, ["walls"], TILE_SIZE);
  });

  it("still places both panes on the walls board", () => {
    const walls = main2.layers.find((l) => l.name === "walls");
    const glazed = walls!.tiles.filter((t) => t.components.some((c) => c.type === "glass"));
    expect(glazed.map((t) => `${t.x},${t.y}`).sort()).toEqual(["18,19", "21,19"]);
    // The span is what the fix turns on: a 1×1 pane would need no footprint.
    for (const t of glazed) {
      expect(t.rowSpan).toBe(2.5);
      expect(t.offsetY).toBe(16);
    }
  });

  it("blocks movement across the whole of each pane", () => {
    for (const pane of PANES) {
      for (const cell of pane) {
        expect(grid.isBlocked(cell.x, cell.y), `(${cell.x},${cell.y}) should block`).toBe(true);
      }
    }
  });

  it("gives every blocked cell a player collision body", () => {
    // The grid drives pathing and radar; the Arcade bodies are what actually
    // stop the player, and they are built from a separate walk over the board.
    const solid = wallCells(main2, TILE_SIZE);
    for (const pane of PANES) {
      for (const cell of pane) {
        expect(solid[cell.y * main2.width + cell.x], `(${cell.x},${cell.y}) needs a body`).toBe(1);
      }
    }
  });

  it("lets sight through the whole of each pane", () => {
    for (const pane of PANES) {
      for (const cell of pane) {
        expect(grid.blocksSight(cell.x, cell.y), `(${cell.x},${cell.y}) should be a window`).toBe(
          false,
        );
      }
    }
    // Across both panes and the passage between them, at both pane rows.
    expect(grid.hasLineOfSight(16, 19, 23, 19)).toBe(true);
    expect(grid.hasLineOfSight(16, 20, 23, 20)).toBe(true);
  });

  it("leaves the passage between the panes walkable", () => {
    // The panes are jambs, not a seal — the point of the corridor is that you
    // can still get through it.
    for (const y of [19, 20]) {
      expect(grid.isBlocked(19, y)).toBe(false);
      expect(grid.isBlocked(20, y)).toBe(false);
    }
  });
});
