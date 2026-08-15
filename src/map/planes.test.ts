import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { EdplayLoader } from "./EdplayLoader";
import {
  canopyCells,
  deckCells,
  deckPlaneAt,
  planeCount,
  planeOfLayer,
  CANOPY,
  PLANE_FLOOR,
  PLANE_UPPER,
} from "./planes";
import { blockingLayerNames, type EdPlayFile, type GameLevel } from "./types";
import { CollisionGrid } from "../systems/CollisionGrid";
import { findPath } from "../systems/Pathfinder";

const TILE = 32;

/** The shipped map, parsed once — these assertions are about the real export. */
const map = (() => {
  const raw = JSON.parse(readFileSync("public/assets/edplay.json", "utf8")) as EdPlayFile;
  return EdplayLoader.parse(
    raw,
    raw.SpriteSheets.map((s) => s.RelativePath),
  ).map;
})();

const levelNamed = (name: string): GameLevel => {
  const l = map.levels.find((x) => x.name === name);
  if (!l) throw new Error(`no level ${name}`);
  return l;
};

describe("planeOfLayer", () => {
  it("puts the deck board on the upper plane and the roof above both", () => {
    expect(planeOfLayer("catwalks")).toBe(PLANE_UPPER);
    expect(planeOfLayer("rain_cover")).toBe(CANOPY);
  });

  it("leaves everything else on the floor, including the decals that overlap it", () => {
    // The regression guard against ever inferring planes from overlap: each of
    // these covers `floor` heavily and none of them is a surface.
    for (const board of ["floor", "walls", "rain", "markings", "cover", "verticals"]) {
      expect(planeOfLayer(board)).toBe(PLANE_FLOOR);
    }
  });
});

describe("planeCount", () => {
  it("is 2 for exactly the two levels that author a deck", () => {
    const counts = Object.fromEntries(map.levels.map((l) => [l.name, planeCount(l)]));
    expect(counts.vent_core).toBe(2);
    expect(counts.roof_array).toBe(2);
    for (const flat of ["main1", "duct1", "duct2", "secret1", "main2", "main2vault", "secret2"]) {
      expect(counts[flat]).toBe(1);
    }
  });
});

describe("deckCells", () => {
  it("covers the authored deck on both levels", () => {
    const count = (l: GameLevel): number =>
      deckCells(l, TILE).reduce((n: number, v: number) => n + v, 0);
    expect(count(levelNamed("vent_core"))).toBe(334);
    expect(count(levelNamed("roof_array"))).toBe(200);
  });

  it("is empty on a level with no deck board", () => {
    expect(deckCells(levelNamed("main1"), TILE).some((v) => v === 1)).toBe(false);
  });

  it("puts every wall on both levels *under* the deck", () => {
    // The invariant the whole model rests on: walls are structure the gantry runs
    // over, not obstacles standing on it. If this ever fails, the upper plane's
    // walkable set has to be reconsidered — see the note in `planes.ts`.
    for (const name of ["vent_core", "roof_array"]) {
      const level = levelNamed(name);
      const deck = deckCells(level, TILE);
      const walls = level.layers.find((l) => l.name === "walls");
      expect(walls, `${name} has a walls board`).toBeDefined();
      const off = walls!.tiles.filter((t) => deck[t.y * level.width + t.x] !== 1);
      expect(off, `${name}: every wall cell is a deck cell`).toEqual([]);
    }
  });
});

describe("canopyCells", () => {
  it("covers the roof on roof_array and nothing on the others", () => {
    const roof = levelNamed("roof_array");
    expect(canopyCells(roof, TILE).reduce((n: number, v: number) => n + v, 0)).toBe(255);
    expect(canopyCells(levelNamed("vent_core"), TILE).some((v) => v === 1)).toBe(false);
  });
});

describe("deckPlaneAt", () => {
  it("reads roof_array's fixtures onto the plane their cell is on", () => {
    const roof = levelNamed("roof_array");
    const deck = deckCells(roof, TILE);
    const at = (x: number, y: number): number => deckPlaneAt(deck, roof, x, y);
    // The dish and the east rail stand on the gantry.
    expect(at(15, 7)).toBe(PLANE_UPPER);
    expect(at(23, 7)).toBe(PLANE_UPPER);
    // The calibration terminals and both spawn posts stand on the deck floor.
    expect(at(7, 11)).toBe(PLANE_FLOOR);
    expect(at(27, 11)).toBe(PLANE_FLOOR);
    expect(at(7, 1)).toBe(PLANE_FLOOR);
    expect(at(5, 3)).toBe(PLANE_FLOOR);
  });

  it("reads out of bounds as the floor rather than throwing", () => {
    const roof = levelNamed("roof_array");
    expect(deckPlaneAt(deckCells(roof, TILE), roof, -1, 99)).toBe(PLANE_FLOOR);
  });
});

describe("the grid built from those planes", () => {
  it("leaves the floor plane exactly as it was before planes existed", () => {
    // Every level, including the two with decks: plane 0 is the pre-plane answer.
    for (const level of map.levels) {
      const grid = new CollisionGrid(level, blockingLayerNames(level), TILE);
      const walls = level.layers.find((l) => l.name === "walls");
      for (const t of walls?.tiles ?? []) {
        expect(grid.isBlocked(t.x, t.y), `${level.name} (${t.x},${t.y})`).toBe(true);
      }
    }
  });

  it("makes the deck walkable exactly where a deck tile is, and nowhere else", () => {
    const level = levelNamed("roof_array");
    const grid = new CollisionGrid(level, blockingLayerNames(level), TILE);
    const deck = deckCells(level, TILE);
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const onDeck = deck[y * level.width + x] === 1;
        expect(grid.isBlocked(x, y, PLANE_UPPER), `(${x},${y})`).toBe(!onDeck);
      }
    }
  });

  it("lets a wall stand on the floor and be walked over on the deck", () => {
    // The whole point of "deck over structure": (11,7) is both a wall and a deck
    // cell, so it stops you downstairs and carries you upstairs.
    const level = levelNamed("roof_array");
    const grid = new CollisionGrid(level, blockingLayerNames(level), TILE);
    expect(grid.isBlocked(11, 7, PLANE_FLOOR)).toBe(true);
    expect(grid.isBlocked(11, 7, PLANE_UPPER)).toBe(false);
  });

  it("occludes nothing on the deck — you are above the walls", () => {
    const level = levelNamed("roof_array");
    const grid = new CollisionGrid(level, blockingLayerNames(level), TILE);
    // Straight through the wall band at rows 5-9, which blocks sight downstairs.
    expect(grid.hasLineOfSight(11.5, 3.5, 11.5, 11.5, PLANE_FLOOR)).toBe(false);
    expect(grid.hasLineOfSight(11.5, 3.5, 11.5, 11.5, PLANE_UPPER)).toBe(true);
  });

  it("keeps the gantry connected, which is the reading walls-block would break", () => {
    // Row 5 crosses the wall band at x=7/11/15/19. Walls blocking the deck would
    // chop this run into pieces; over the structure it walks to the far corner.
    const level = levelNamed("roof_array");
    const grid = new CollisionGrid(level, blockingLayerNames(level), TILE);
    expect(findPath(grid, { x: 17, y: 5 }, { x: 30, y: 17 }, { plane: PLANE_UPPER })).not.toBeNull();
    expect(findPath(grid, { x: 5, y: 5 }, { x: 30, y: 5 }, { plane: PLANE_UPPER })).not.toBeNull();
  });

  it("leaves the elevator car its own island, reached by lift and not on foot", () => {
    // roof_array's deck is two components: the 191-cell gantry and the 9 cells of
    // the elevator car at x=4-6, y=0-2. That separation is the car being a car.
    const level = levelNamed("roof_array");
    const grid = new CollisionGrid(level, blockingLayerNames(level), TILE);
    expect(grid.isBlocked(5, 1, PLANE_UPPER)).toBe(false);
    expect(findPath(grid, { x: 5, y: 1 }, { x: 17, y: 5 }, { plane: PLANE_UPPER })).toBeNull();
  });

  it("cannot walk off the gantry onto the floor below", () => {
    const level = levelNamed("roof_array");
    const grid = new CollisionGrid(level, blockingLayerNames(level), TILE);
    // (17,3) is deck floor, not gantry — unreachable while on the upper plane.
    expect(grid.isBlocked(17, 3, PLANE_UPPER)).toBe(true);
    expect(findPath(grid, { x: 17, y: 5 }, { x: 17, y: 3 }, { plane: PLANE_UPPER })).toBeNull();
  });
});
