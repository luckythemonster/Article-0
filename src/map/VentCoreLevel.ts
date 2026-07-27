import type { GameLayer, GameLevel, GameMap, GameTile } from "./types";
import {
  cloneTile,
  cloneWithComponent,
  fillFloor,
  floorPalette,
  marker,
  MissingProto,
  mustProto,
  protoTile,
  wallRing,
  type TilePos,
} from "./generate";
import { STAPLER_ITEM } from "../systems/EntityStats";

/**
 * The VENT-4 boss arena, generated in code and appended to the parsed map at
 * boot — the edplay export is never hand-edited. Every placed tile is a clone
 * of a tile already placed somewhere in the shipped map, so its sprite frame
 * is guaranteed to be in the parse's uniqueFrames (SpriteAtlas registers it
 * with no extra work).
 *
 * The arena links to its *host* level the same way every other level connects: the
 * TransitionGraph pairs `maintenance_access` tiles that share an exact coordinate
 * across levels. A hatch is injected into the host at (18,34) — open floor with no
 * access tile in the shipped map — and vent_core carries its twin. Which level hosts
 * it is decided by `MapPlan.ventCoreHost` rather than hardcoded, so a new map isn't
 * obliged to have a level called `duct2`.
 */

export const VENT_CORE_LEVEL = "vent_core";

/** The hatch tile shared with the host level — entry and only exit. */
export const VENT_CORE_ENTRY = { x: 18, y: 34 };

/** Turbine centre in tile units (the hub is the 3×3 block around it). */
export const HUB_CENTER_TILE = { x: 20.5, y: 21.5 };

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

/**
 * Appends the vent_core level and injects the host-side hatch that reaches it. Idempotent —
 * the parsed map is cached in the registry and must not grow twice.
 *
 * **Optional, and silent when it can't run.** The arena is spliced into a maintenance level
 * and clones that level's art, so a map without a suitable host (or without the boards the
 * prototypes come from) simply doesn't get a VENT-4 — and therefore no Q0 compliance cert,
 * since that is the reward for silencing it. It used to throw instead, which took the whole
 * boot down for any map that wasn't the shipped one.
 *
 * @param host level to graft onto — `MapPlan.ventCoreHost`. Null skips generation.
 * @returns whether the arena was generated.
 */
export function appendVentCore(map: GameMap, host: string | null): boolean {
  if (map.levels.some((l) => l.name === VENT_CORE_LEVEL)) return true;
  if (host === null) return false;

  const hostLevel = map.levels.find((l) => l.name === host);
  if (!hostLevel) return false;
  try {
    buildVentCore(map, host, hostLevel);
    return true;
  } catch (e) {
    if (e instanceof MissingProto) return false; // map can't furnish the arena; skip it
    throw e;
  }
}

function buildVentCore(map: GameMap, host: string, hostLevel: GameLevel): void {
  // --- Protos (all from tiles the shipped map already places) ---
  const grateRef = "tdVents_Interior1_13";
  const floorProtos = floorPalette([hostLevel], 6, (ref) => ref !== grateRef);
  if (floorProtos.length === 0) floorProtos.push(mustProto(map, "floor"));
  const grateProto = mustProto(map, "floor", (r) => r === grateRef);
  const wallProto = mustProto(map, "walls", (r) => r.includes("Concrete_Wall"), host);
  const columnProto =
    protoTile(map, "walls", (r) => r.endsWith("_13"), host) ?? wallProto;
  const hatchProto = mustProto(map, "maintenance_access", (r) => r === "hatch", host);
  const terminalProto = mustProto(map, "terminals", (r) => r === "terminal0");
  const coverProto = mustProto(map, "cover", (r) => r === "cover0");
  const lightProto = mustProto(map, "light_sources", (r) => r.includes("light_source"));
  const chestProto = mustProto(map, "items", (r) => r === "chest0");

  // --- Inject the host-side hatch (skip if a re-parse already carries it) ---
  const hostAccess = hostLevel.layers.find((l) => l.name === "maintenance_access");
  if (!hostAccess) throw new MissingProto(`host "${host}" has no maintenance_access board`);
  if (!hostAccess.tiles.some((t) => t.x === VENT_CORE_ENTRY.x && t.y === VENT_CORE_ENTRY.y)) {
    hostAccess.tiles.push(cloneTile(hatchProto, VENT_CORE_ENTRY.x, VENT_CORE_ENTRY.y));
  }

  // --- Build the arena layers ---
  const floor = fillFloor(
    floorProtos,
    { x: WALL_MIN.x + 1, y: WALL_MIN.y + 1 },
    { x: WALL_MAX.x - 1, y: WALL_MAX.y - 1 },
  );

  const walls: GameTile[] = wallRing(wallProto, WALL_MIN, WALL_MAX);
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
        // All three slots non-empty: blank ones fall back to the default loot
        // table in chestStatsFor.
        cloneWithComponent(chestProto, CHEST.x, CHEST.y, "chest", {
          item1: STAPLER_ITEM,
          item2: "Sealant Tape",
          item3: "Q0 Filter Mask",
        }),
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
