import type { ComponentData, GameLayer, GameMap, GameTile } from "./types";
import { STAPLER_ITEM } from "../systems/EntityStats";

/**
 * The VENT-4 boss arena, generated in code and appended to the parsed map at
 * boot — the edplay export is never hand-edited. Every placed tile is a clone
 * of a tile already placed somewhere in the shipped map, so its sprite frame
 * is guaranteed to be in the parse's uniqueFrames (SpriteAtlas registers it
 * with no extra work).
 *
 * The arena links to duct2 the same way every other level connects: the
 * TransitionGraph pairs `maintenance_access` tiles that share an exact
 * coordinate across levels. duct2's row-34 crawl corridor is open floor at
 * (18,34) and no level has an access tile there, so a hatch is injected into
 * duct2 at that spot and vent_core carries its twin.
 */

export const VENT_CORE_LEVEL = "vent_core";

/** The hatch tile shared with duct2 — entry and only exit. */
export const VENT_CORE_ENTRY = { x: 18, y: 34 };

/** Turbine centre in tile units (the hub is the 3×3 block around it). */
export const HUB_CENTER_TILE = { x: 20.5, y: 21.5 };

interface TilePos {
  x: number;
  y: number;
}

// --- Layout (single source of truth: the builder places these, Vent4Boss
// --- imports them for interaction targets and force anchors). ---

/** Pressure relief sub-stations; index 2 is the far-east finisher. */
export const VENT_CORE_SUBSTATIONS: TilePos[] = [
  { x: 20, y: 8 },
  { x: 8, y: 21 },
  { x: 32, y: 21 },
];

/** Cargo winches: drop scrap into the intake to jam the turbine. */
export const VENT_CORE_WINCHES: TilePos[] = [
  { x: 8, y: 8 },
  { x: 32, y: 8 },
  { x: 26, y: 34 },
];

/** Piton points: hold E here to ride out the vacuum. */
export const VENT_CORE_PITONS: TilePos[] = [
  { x: 10, y: 12 },
  { x: 30, y: 12 },
  { x: 10, y: 30 },
  { x: 30, y: 30 },
];

/** Condensate drip tiles: standing under one zeroes the thermal signature. */
export const VENT_CORE_DRIPS: TilePos[] = [
  { x: 14, y: 19 },
  { x: 26, y: 23 },
  { x: 20, y: 31 },
];

/** Floor steam valves, flanking each sub-station approach. */
export const VENT_CORE_STEAM: TilePos[] = [
  { x: 17, y: 9 },
  { x: 23, y: 9 },
  { x: 9, y: 18 },
  { x: 9, y: 24 },
  { x: 31, y: 18 },
  { x: 31, y: 24 },
];

/** Structural steel columns: LoS breakers and grip anchors (blocking tiles). */
export const VENT_CORE_COLUMNS: TilePos[] = [
  { x: 15, y: 16 },
  { x: 25, y: 16 },
  { x: 15, y: 26 },
  { x: 25, y: 26 },
  { x: 12, y: 21 },
  { x: 28, y: 21 },
  { x: 20, y: 16 },
  { x: 20, y: 27 },
];

/** Low-cover pads on the sweep lanes (crouch there to hide). */
export const VENT_CORE_COVER: TilePos[] = [
  { x: 17, y: 12 },
  { x: 23, y: 12 },
  { x: 11, y: 17 },
  { x: 29, y: 17 },
  { x: 11, y: 25 },
  { x: 29, y: 25 },
  { x: 17, y: 30 },
  { x: 23, y: 30 },
];

/** Overhead lights: the patch points are lit (risk/reward), entry readable. */
const LIGHTS: TilePos[] = [
  { x: 20, y: 9 },
  { x: 9, y: 21 },
  { x: 31, y: 21 },
  { x: 18, y: 33 },
];

const CHEST: TilePos = { x: 32, y: 33 };
const SPAWN: TilePos = { x: 18, y: 33 };

/** Arena bounds: ring wall on this rectangle, floor inside it. */
const WALL_MIN = { x: 6, y: 6 };
const WALL_MAX = { x: 34, y: 36 };

/** The turbine hub footprint, a blocked 3×3. */
const HUB_MIN = { x: 19, y: 20 };
const HUB_MAX = { x: 21, y: 22 };

const key = (x: number, y: number): string => `${x},${y}`;

/**
 * Floor-grate tiles: the four spokes toward the hub plus a surrounding ring —
 * crossing them at walking noise pings the machine's acoustic triggers.
 */
export function ventCoreGrateTiles(): TilePos[] {
  const taken = new Set<string>();
  for (const c of VENT_CORE_COLUMNS) taken.add(key(c.x, c.y));
  for (const s of VENT_CORE_SUBSTATIONS) taken.add(key(s.x, s.y));
  for (const c of VENT_CORE_COVER) taken.add(key(c.x, c.y));

  const grates: TilePos[] = [];
  const push = (x: number, y: number): void => {
    if (x <= WALL_MIN.x || x >= WALL_MAX.x || y <= WALL_MIN.y || y >= WALL_MAX.y) return;
    if (x >= HUB_MIN.x && x <= HUB_MAX.x && y >= HUB_MIN.y && y <= HUB_MAX.y) return;
    if (taken.has(key(x, y))) return;
    taken.add(key(x, y));
    grates.push({ x, y });
  };

  // Spokes along the hub axes.
  for (let y = 9; y <= 33; y++) push(20, y);
  for (let x = 8; x <= 32; x++) push(x, 21);
  // Chebyshev ring at radius 4–5 around the hub centre tile.
  for (let x = WALL_MIN.x + 1; x < WALL_MAX.x; x++) {
    for (let y = WALL_MIN.y + 1; y < WALL_MAX.y; y++) {
      const d = Math.max(Math.abs(x - 20), Math.abs(y - 21));
      if (d === 4 || d === 5) push(x, y);
    }
  }
  return grates;
}

/** Finds a placed tile to clone, optionally filtered by level and ref. */
function protoTile(
  map: GameMap,
  layerName: string,
  refMatch?: (ref: string) => boolean,
  levelName?: string,
): GameTile | undefined {
  for (const level of map.levels) {
    if (levelName !== undefined && level.name !== levelName) continue;
    const layer = level.layers.find((l) => l.name === layerName);
    if (!layer) continue;
    for (const t of layer.tiles) {
      if (!refMatch || refMatch(t.ref)) return t;
    }
  }
  return undefined;
}

function mustProto(
  map: GameMap,
  layerName: string,
  refMatch?: (ref: string) => boolean,
  levelName?: string,
): GameTile {
  const t = protoTile(map, layerName, refMatch, levelName) ?? protoTile(map, layerName);
  if (!t) throw new Error(`vent_core: no proto tile found on any "${layerName}" board`);
  return t;
}

/** Clones a placed tile to a new coordinate (frame objects are shared, read-only). */
function cloneTile(proto: GameTile, x: number, y: number, components?: ComponentData[]): GameTile {
  return { ...proto, x, y, components: components ?? proto.components };
}

/** A frameless marker tile (never painted; consumed by entity spawners). */
function marker(ref: string, x: number, y: number): GameTile {
  return {
    x,
    y,
    handle: 0,
    ref,
    colSpan: 1,
    rowSpan: 1,
    offsetX: 0,
    offsetY: 0,
    components: [],
  };
}

/**
 * Appends the vent_core level and injects its duct2-side hatch. Idempotent —
 * the parsed map is cached in the registry and must not grow twice.
 */
export function appendVentCore(map: GameMap): void {
  if (map.levels.some((l) => l.name === VENT_CORE_LEVEL)) return;

  const duct2 = map.levels.find((l) => l.name === "duct2");
  if (!duct2) throw new Error("vent_core: duct2 level missing from map");

  // --- Protos (all from tiles the shipped map already places) ---
  const grateRef = "tdVents_Interior1_13";
  const floorProtos: GameTile[] = [];
  {
    const duct2Floor = duct2.layers.find((l) => l.name === "floor");
    const seen = new Set<string>();
    for (const t of duct2Floor?.tiles ?? []) {
      if (t.ref === grateRef || seen.has(t.ref) || !t.frame) continue;
      seen.add(t.ref);
      floorProtos.push(t);
      if (floorProtos.length >= 6) break;
    }
  }
  if (floorProtos.length === 0) floorProtos.push(mustProto(map, "floor"));
  const grateProto = mustProto(map, "floor", (r) => r === grateRef);
  const wallProto = mustProto(map, "walls", (r) => r.includes("Concrete_Wall"), "duct2");
  const columnProto =
    protoTile(map, "walls", (r) => r.endsWith("_13"), "duct2") ?? wallProto;
  const hatchProto = mustProto(map, "maintenance_access", (r) => r === "hatch", "duct2");
  const terminalProto = mustProto(map, "terminals", (r) => r === "terminal0");
  const coverProto = mustProto(map, "cover", (r) => r === "cover0");
  const lightProto = mustProto(map, "light_sources", (r) => r.includes("light_source"));
  const chestProto = mustProto(map, "items", (r) => r === "chest0");

  // --- Inject the duct2-side hatch (skip if a re-parse already carries it) ---
  const duct2Access = duct2.layers.find((l) => l.name === "maintenance_access");
  if (!duct2Access) throw new Error("vent_core: duct2 has no maintenance_access board");
  if (!duct2Access.tiles.some((t) => t.x === VENT_CORE_ENTRY.x && t.y === VENT_CORE_ENTRY.y)) {
    duct2Access.tiles.push(cloneTile(hatchProto, VENT_CORE_ENTRY.x, VENT_CORE_ENTRY.y));
  }

  // --- Build the arena layers ---
  const floor: GameTile[] = [];
  for (let x = WALL_MIN.x + 1; x < WALL_MAX.x; x++) {
    for (let y = WALL_MIN.y + 1; y < WALL_MAX.y; y++) {
      // Deterministic variant cycling for texture.
      floor.push(cloneTile(floorProtos[(x * 7 + y * 13) % floorProtos.length], x, y));
    }
  }

  const walls: GameTile[] = [];
  for (let x = WALL_MIN.x; x <= WALL_MAX.x; x++) {
    walls.push(cloneTile(wallProto, x, WALL_MIN.y));
    walls.push(cloneTile(wallProto, x, WALL_MAX.y));
  }
  for (let y = WALL_MIN.y + 1; y < WALL_MAX.y; y++) {
    walls.push(cloneTile(wallProto, WALL_MIN.x, y));
    walls.push(cloneTile(wallProto, WALL_MAX.x, y));
  }
  for (let x = HUB_MIN.x; x <= HUB_MAX.x; x++) {
    for (let y = HUB_MIN.y; y <= HUB_MAX.y; y++) {
      walls.push(cloneTile(wallProto, x, y));
    }
  }
  for (const c of VENT_CORE_COLUMNS) walls.push(cloneTile(columnProto, c.x, c.y));

  const layers: GameLayer[] = [
    { name: "floor", tiles: floor },
    { name: "grates", tiles: ventCoreGrateTiles().map((g) => cloneTile(grateProto, g.x, g.y)) },
    { name: "cover", tiles: VENT_CORE_COVER.map((c) => cloneTile(coverProto, c.x, c.y)) },
    { name: "light_sources", tiles: LIGHTS.map((l) => cloneTile(lightProto, l.x, l.y)) },
    { name: "walls", tiles: walls },
    {
      name: "maintenance_access",
      tiles: [cloneTile(hatchProto, VENT_CORE_ENTRY.x, VENT_CORE_ENTRY.y)],
    },
    {
      name: "substations",
      tiles: VENT_CORE_SUBSTATIONS.map((s) => cloneTile(terminalProto, s.x, s.y)),
    },
    {
      name: "items",
      tiles: [
        cloneTile(
          chestProto,
          CHEST.x,
          CHEST.y,
          chestProto.components.map((c) =>
            c.type === "chest"
              ? {
                  type: c.type,
                  values: {
                    ...c.values,
                    // All three slots non-empty: blank ones fall back to the
                    // default loot table in chestStatsFor.
                    item1: STAPLER_ITEM,
                    item2: "Sealant Tape",
                    item3: "Q0 Filter Mask",
                  },
                }
              : c,
          ),
        ),
      ],
    },
    { name: "spawn", tiles: [marker("spawn", SPAWN.x, SPAWN.y)] },
  ];

  map.levels.push({
    name: VENT_CORE_LEVEL,
    width: 40,
    height: 45,
    layers,
  });
}
