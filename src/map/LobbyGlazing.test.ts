import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { EdplayLoader } from "./EdplayLoader";
import { footprintCells } from "./footprint";
import {
  appendLobbyGlazing,
  glazingCells,
  GLAZING_DOORWAYS,
  GLAZING_DOOR_CAPS,
  GLAZING_ROW,
} from "./LobbyGlazing";
import { planFor } from "./MapPlan";
import { wallCells } from "./TileBake";
import { CollisionGrid } from "../systems/CollisionGrid";
import { isGlass } from "../systems/EntityStats";
import type { EdPlayFile, GameLevel, GameMap } from "./types";

const RAW = JSON.parse(
  readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
) as EdPlayFile;

function loadMap(): GameMap {
  return EdplayLoader.parse(RAW, RAW.SpriteSheets.map((s) => s.RelativePath)).map;
}

/**
 * Reachable cells from the level's spawn, treating a closed door as passable — the
 * player can open them. This is the check that matters: a glazed line across the lobby
 * is one tile away from sealing the player into the spawn vestibule, and nothing else
 * in the suite would notice.
 */
function reachableFromSpawn(level: GameLevel): { reached: number; open: number } {
  const grid = new CollisionGrid(level, ["walls"], 32);
  const openable = new Set<string>();
  for (const t of level.layers.find((l) => l.name === "doors")?.tiles ?? []) {
    if (!t.components.some((c) => c.type === "door")) continue;
    for (const c of footprintCells(t, 32)) {
      grid.setBlocked(c.x, c.y, true);
      openable.add(`${c.x},${c.y}`);
    }
  }
  const spawn = level.layers.find((l) => l.name === "spawn")!.tiles[0];
  const seen = new Set([`${spawn.x},${spawn.y}`]);
  const queue: [number, number][] = [[spawn.x, spawn.y]];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || !grid.inBounds(nx, ny)) continue;
      if (grid.isBlocked(nx, ny) && !openable.has(k)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  let open = 0;
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (!grid.isBlocked(x, y) || openable.has(`${x},${y}`)) open++;
    }
  }
  return { reached: seen.size, open };
}

describe("the lobby frontage, as authored in the shipped map", () => {
  let map: GameMap;
  let main1: GameLevel;

  beforeEach(() => {
    map = loadMap();
    main1 = map.levels.find((l) => l.name === "main1") as GameLevel;
  });

  it("glazes the whole of row 41 except the four doorways", () => {
    const walls = main1.layers.find((l) => l.name === "walls")!;
    const glazed = walls.tiles
      .filter((t) => t.y === GLAZING_ROW && isGlass(t.components))
      .map((t) => t.x)
      .sort((a, b) => a - b);
    expect(glazed).toEqual(glazingCells().map((c) => c.x).sort((a, b) => a - b));
    expect(glazed).toHaveLength(34);
    for (const x of GLAZING_DOORWAYS) expect(glazed).not.toContain(x);
  });

  it("gives every pane a resolved sprite and a single-cell footprint", () => {
    // A frameless tile is skipped by both the bake and the wall bodies — invisible and
    // walk-through, which is the bug this whole line of work started from. And a
    // footprint taller than one cell would claim row 42 and seal the vestibule.
    const walls = main1.layers.find((l) => l.name === "walls")!;
    for (const t of walls.tiles.filter((t) => t.y === GLAZING_ROW && isGlass(t.components))) {
      expect(t.frame, `pane at ${t.x},${t.y} has no frame`).toBeDefined();
      expect(footprintCells(t, 32)).toEqual([{ x: t.x, y: GLAZING_ROW }]);
    }
  });

  it("blocks movement and passes sight across the whole frontage", () => {
    const grid = new CollisionGrid(main1, ["walls"], 32);
    const bodies = wallCells(main1, 32);
    for (const c of glazingCells()) {
      expect(grid.isBlocked(c.x, c.y), `(${c.x},${c.y}) should block`).toBe(true);
      expect(grid.blocksSight(c.x, c.y), `(${c.x},${c.y}) should be a window`).toBe(false);
      expect(bodies[c.y * main1.width + c.x], `(${c.x},${c.y}) needs a body`).toBe(1);
    }
    // You can see the length of the lobby through it, doorways included.
    expect(grid.hasLineOfSight(2, GLAZING_ROW, 37, GLAZING_ROW)).toBe(true);
  });

  it("no longer caps the doorways from the north", () => {
    const walls = main1.layers.find((l) => l.name === "walls")!;
    for (const c of GLAZING_DOOR_CAPS) {
      expect(
        walls.tiles.some((t) => t.x === c.x && t.y === c.y),
        `(${c.x},${c.y}) should have been removed`,
      ).toBe(false);
    }
  });

  it("leaves the level fully reachable from the spawn", () => {
    const { reached, open } = reachableFromSpawn(main1);
    expect(reached).toBe(open);
  });
});

describe("appendLobbyGlazing", () => {
  it("declines to touch a map that already has the frontage", () => {
    const map = loadMap();
    const walls = (map.levels.find((l) => l.name === "main1") as GameLevel).layers.find(
      (l) => l.name === "walls",
    )!;
    const before = walls.tiles.length;
    expect(appendLobbyGlazing(map, "main1")).toBe(true);
    expect(walls.tiles).toHaveLength(before);
  });

  it("rebuilds the frontage on a map whose glass-wall tiles were lost", () => {
    const map = loadMap();
    const main1 = map.levels.find((l) => l.name === "main1") as GameLevel;
    const walls = main1.layers.find((l) => l.name === "walls")!;
    // Simulate a re-export from a project without the glass-wall tile defs: the panes
    // are gone and the door caps are back.
    walls.tiles = walls.tiles.filter((t) => !(t.y === GLAZING_ROW && isGlass(t.components)));
    for (const c of GLAZING_DOOR_CAPS) walls.tiles.push({ ...walls.tiles[0], x: c.x, y: c.y });

    expect(appendLobbyGlazing(map, "main1")).toBe(true);

    const grid = new CollisionGrid(main1, ["walls"], 32);
    for (const c of glazingCells()) {
      expect(grid.isBlocked(c.x, c.y)).toBe(true);
      expect(grid.blocksSight(c.x, c.y)).toBe(false);
    }
    for (const c of GLAZING_DOOR_CAPS) {
      expect(walls.tiles.some((t) => t.x === c.x && t.y === c.y)).toBe(false);
    }
    // Still playable — the fallback must not seal the vestibule either.
    const { reached, open } = reachableFromSpawn(main1);
    expect(reached).toBe(open);
  });

  it("is idempotent", () => {
    const map = loadMap();
    const walls = (map.levels.find((l) => l.name === "main1") as GameLevel).layers.find(
      (l) => l.name === "walls",
    )!;
    walls.tiles = walls.tiles.filter((t) => !(t.y === GLAZING_ROW && isGlass(t.components)));
    appendLobbyGlazing(map, "main1");
    const after = walls.tiles.length;
    appendLobbyGlazing(map, "main1");
    expect(walls.tiles).toHaveLength(after);
  });

  it("declines rather than throwing when the map can't host it", () => {
    const bare: GameMap = {
      name: "bare",
      tileWidth: 32,
      tileHeight: 32,
      sheetTextureKeys: [],
      levels: [{ name: "only", width: 10, height: 10, layers: [{ name: "floor", tiles: [] }] }],
    };
    expect(appendLobbyGlazing(bare, "only")).toBe(false);
    expect(appendLobbyGlazing(bare, "nope")).toBe(false);
    expect(appendLobbyGlazing(bare, null)).toBe(false);
  });

  it("runs on the start level the plan picks", () => {
    const map = loadMap();
    expect(planFor(map).startLevel).toBe("main1");
  });
});
