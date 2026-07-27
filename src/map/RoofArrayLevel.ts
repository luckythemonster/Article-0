import type { GameLayer, GameMap, GameTile } from "./types";
import {
  cloneTile,
  ensureLayer,
  fillFloor,
  hasTileAt,
  marker,
  MissingProto,
  mustProto,
  protoTile,
  wallRing,
  type TilePos,
} from "./generate";

/**
 * The rooftop relay — Act IV's level, generated in code and appended at boot like the
 * VENT-4 arena.
 *
 * Generated rather than authored for the same reason the arena is: `edplay.json` is the
 * tile editor's export, committed verbatim and never hand-edited. Everything placed here
 * is therefore a clone of a tile the shipped map already uses, so `SpriteAtlas` has its
 * frame registered with no extra work.
 *
 * The deck is paved with `tdSidewalk_Spritesheet1_*` — `main1`'s pavement family, and
 * the only floor art in the whole export that reads as *outside*. The parapet is the
 * same concrete the rest of the complex is built from.
 *
 * ### How it connects
 *
 * `TransitionGraph` pairs transition tiles purely by identical `(x, y)` on a same-named
 * board across two levels — there is no explicit link authoring, and a mismatch fails
 * silently. `main2` ships with no `maintenance_access` board at all, so this creates one
 * and puts a ladder at {@link ROOF_ACCESS}; the roof carries its twin at the same
 * coordinate. That coordinate is used by no other level's `stairs` or
 * `maintenance_access` board, so the pairing is unambiguous.
 *
 * Climbing it is gated on the Alignment Core being down — see
 * `Objectives.canReachRoof` — so the roof is Act IV's reward rather than a shortcut past
 * Act III.
 */

export const ROOF_ARRAY_LEVEL = "roof_array";

/** The ladder shared with the host level — entry, and the only way back down. */
export const ROOF_ACCESS: TilePos = { x: 20, y: 41 };

/** Parapet bounds. Deck is the open rectangle inside them. */
const WALL_MIN: TilePos = { x: 5, y: 6 };
const WALL_MAX: TilePos = { x: 35, y: 42 };

/** The motorised dish's blocked footprint, and the tile its axis stands on. */
const DISH_MIN: TilePos = { x: 19, y: 21 };
const DISH_MAX: TilePos = { x: 21, y: 23 };
export const DISH_CENTER_TILE: TilePos = { x: 20, y: 22 };

/** Where EIRA-7 is jacked into the primary feed — the uplink's start button. */
export const FEED_TERMINAL: TilePos = { x: 20, y: 26 };

/**
 * Azimuth and elevation pedestals, at opposite corners of the deck.
 *
 * Deliberately diagonal rather than merely "at each end": the walk between them is the
 * phase, and it has to cross the searchlights' arcs at a different angle each way.
 */
export const ROOF_PEDESTALS: TilePos[] = [
  { x: 8, y: 34 },
  { x: 32, y: 10 },
];

/** Searchlight mounts sweeping the deck. */
export const ROOF_SEARCHLIGHTS: TilePos[] = [
  { x: 10, y: 12 },
  { x: 30, y: 12 },
  { x: 20, y: 37 },
];

/** Catwalk mouths the siege's Enforcers arrive from, one per corner. */
export const ROOF_CATWALKS: TilePos[] = [
  { x: 7, y: 8 },
  { x: 33, y: 8 },
  { x: 7, y: 40 },
  { x: 33, y: 40 },
];

/** HVAC plant — the deck's only cover. */
const ROOF_COVER: TilePos[] = [
  { x: 12, y: 18 },
  { x: 28, y: 18 },
  { x: 12, y: 28 },
  { x: 28, y: 28 },
  { x: 16, y: 36 },
  { x: 24, y: 36 },
];

/** Deck lighting: the pedestals, the feed, and the ladder head. */
const ROOF_LIGHTS: TilePos[] = [
  { x: 8, y: 34 },
  { x: 32, y: 10 },
  { x: 20, y: 26 },
  { x: 20, y: 40 },
];

/** Distinct sidewalk floor tiles, for a deck that reads as outdoors. */
function sidewalkPalette(map: GameMap): GameTile[] {
  const out: GameTile[] = [];
  const seen = new Set<string>();
  for (const level of map.levels) {
    for (const t of level.layers.find((l) => l.name === "floor")?.tiles ?? []) {
      if (!t.frame || seen.has(t.ref) || !t.ref.includes("Sidewalk")) continue;
      seen.add(t.ref);
      out.push(t);
      if (out.length >= 6) return out;
    }
  }
  return out;
}

/**
 * Appends the rooftop level and injects the host-side ladder that reaches it.
 * Idempotent — the parsed map is registry-cached and must not grow twice.
 *
 * @param host the level the ladder rises from — `MapPlan.extractionLevel`, the same
 *   deck the vault stands on. Null skips generation.
 * @returns whether the level was generated.
 */
export function appendRoofArray(map: GameMap, host: string | null): boolean {
  if (map.levels.some((l) => l.name === ROOF_ARRAY_LEVEL)) return true;
  if (host === null) return false;
  const hostLevel = map.levels.find((l) => l.name === host);
  if (!hostLevel) return false;

  try {
    buildRoofArray(map, hostLevel);
    return true;
  } catch (e) {
    if (e instanceof MissingProto) return false;
    throw e;
  }
}

function buildRoofArray(map: GameMap, hostLevel: GameMap["levels"][number]): void {
  const floorProtos = sidewalkPalette(map);
  if (floorProtos.length === 0) floorProtos.push(mustProto(map, "floor"));

  const wallProto = mustProto(map, "walls", (r) => r.includes("Concrete_Wall"));
  const dishProto = protoTile(map, "walls", (r) => r.endsWith("_13")) ?? wallProto;
  const ladderProto = mustProto(map, "maintenance_access", (r) => r === "ladder0");
  const terminalProto = mustProto(map, "terminals", (r) => r === "terminal0");
  const coverProto = mustProto(map, "cover", (r) => r === "cover0");
  const lightProto = mustProto(map, "light_sources", (r) => r.includes("light_source"));

  // --- Host-side ladder. `main2` has no maintenance_access board, so make one. ---
  const hostAccess = ensureLayer(hostLevel, "maintenance_access");
  if (!hasTileAt(hostAccess, ROOF_ACCESS.x, ROOF_ACCESS.y)) {
    hostAccess.tiles.push(cloneTile(ladderProto, ROOF_ACCESS.x, ROOF_ACCESS.y));
  }

  // --- The deck ---
  const floor = fillFloor(
    floorProtos,
    { x: WALL_MIN.x + 1, y: WALL_MIN.y + 1 },
    { x: WALL_MAX.x - 1, y: WALL_MAX.y - 1 },
  );

  const walls = wallRing(wallProto, WALL_MIN, WALL_MAX);
  for (let x = DISH_MIN.x; x <= DISH_MAX.x; x++) {
    for (let y = DISH_MIN.y; y <= DISH_MAX.y; y++) walls.push(cloneTile(dishProto, x, y));
  }

  const layers: GameLayer[] = [
    { name: "floor", tiles: floor },
    { name: "cover", tiles: ROOF_COVER.map((c) => cloneTile(coverProto, c.x, c.y)) },
    { name: "light_sources", tiles: ROOF_LIGHTS.map((l) => cloneTile(lightProto, l.x, l.y)) },
    { name: "walls", tiles: walls },
    {
      name: "maintenance_access",
      tiles: [cloneTile(ladderProto, ROOF_ACCESS.x, ROOF_ACCESS.y)],
    },
    {
      name: "relay_pedestals",
      tiles: ROOF_PEDESTALS.map((p) => cloneTile(terminalProto, p.x, p.y)),
    },
    {
      name: "relay_feed",
      tiles: [cloneTile(terminalProto, FEED_TERMINAL.x, FEED_TERMINAL.y)],
    },
    { name: "spawn", tiles: [marker("spawn", ROOF_ACCESS.x, ROOF_ACCESS.y)] },
  ];

  map.levels.push({
    name: ROOF_ARRAY_LEVEL,
    width: 40,
    height: 45,
    layers,
  });
}
