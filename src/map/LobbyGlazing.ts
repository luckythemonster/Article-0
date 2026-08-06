import { isGlass } from "../systems/EntityStats";
import { cloneTile, MissingProto, mustProto, protoTile } from "./generate";
import type { GameMap, GameTile } from "./types";

/**
 * The lobby's glass frontage on the start level — a safety net, not the source of truth.
 *
 * The wall is **authored**, in `edplay.json`: 34 `glass_wall_horizontal*` tiles across
 * row 41 of `main1`'s `walls` board, with the four glass doors at x=7/16/24/33 left as
 * the ways through. This module exists only because that file is an export from an
 * external editor — a re-export from a project that never had the `WINDOWS_TERRAIN48`
 * tile defs would silently drop the wall again, and the level's whole east-west frontage
 * would go back to being invisible and walk-through. So this rebuilds it at boot when it
 * is missing, and declines when it isn't.
 *
 * ### Why the fallback looks worse than the authored wall
 *
 * `src/map/generate.ts` states the rule every generator obeys: a placed tile must be a
 * *clone* of a tile already in the parsed map, because `SpriteAtlas` only registers the
 * frames the parse actually found. So on a map whose tile defs no longer include the
 * glass-wall art, the only glazing left to clone is the glass **door** — and the wall
 * comes back with door art repeated along it. Collision and glazing are identical; it
 * just reads as a row of door panels rather than a clean glazed band. That is the
 * deliberate trade: geometry that is right and ugly beats geometry that is missing.
 *
 * The clone's span is reset to a single cell. The glass door is authored 1×2.5, and a
 * 2.5-tall footprint here would claim row 42 as well — which walls the player into the
 * spawn vestibule, because the outer doors on row 43 open north into exactly that row.
 */

/** The row the frontage runs along on the start level. */
export const GLAZING_ROW = 41;

/** Columns left open — the four glass doors already standing in the line. */
export const GLAZING_DOORWAYS = [7, 16, 24, 33];

/**
 * Inclusive column spans of glazing, i.e. row 41 from the west border to the east one,
 * broken by {@link GLAZING_DOORWAYS}.
 */
export const GLAZING_RUNS: readonly (readonly [number, number])[] = [
  [1, 6],
  [8, 15],
  [17, 23],
  [25, 32],
  [34, 38],
];

/**
 * Lone wall tiles that used to cap each doorway from the north.
 *
 * With no wall to belong to they made the four glass doors nonsense — a door with
 * masonry directly above it leads nowhere — and they are what turned any glazing of this
 * line into a sealed level. Removed as part of building the frontage.
 */
export const GLAZING_DOOR_CAPS = GLAZING_DOORWAYS.map((x) => ({ x, y: GLAZING_ROW - 1 }));

/** Every cell the frontage occupies, west to east. */
export function glazingCells(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const [from, to] of GLAZING_RUNS) {
    for (let x = from; x <= to; x++) out.push({ x, y: GLAZING_ROW });
  }
  return out;
}

/**
 * Rebuilds the lobby frontage on `levelName` if the map doesn't already have it.
 *
 * @returns whether the frontage is present afterwards — `true` when it was already
 *   authored (the normal case) or was successfully grafted, `false` when the map can't
 *   furnish it.
 */
export function appendLobbyGlazing(map: GameMap, levelName: string | null): boolean {
  if (levelName === null) return false;
  const level = map.levels.find((l) => l.name === levelName);
  if (!level) return false;
  const walls = level.layers.find((l) => l.name === "walls");
  if (!walls) return false;

  // Keyed on the concept: any glazing already standing in this row means the map has
  // said what it wants there, and a second pass must not touch it.
  if (walls.tiles.some((t) => t.y === GLAZING_ROW && isGlass(t.components))) return true;

  try {
    // Prefer the real glass-wall art; fall back to the glass door, which is the only
    // other glazed tile any version of this map has. `protoTile` returns undefined
    // rather than throwing, so the fallback is reachable.
    const wallArt = protoTile(map, "walls", (r) => r.startsWith("glass_wall"));
    const glassProto: GameTile =
      wallArt && isGlass(wallArt.components)
        ? wallArt
        : mustProto(map, "doors", (r) => r.includes("glass"));
    if (!isGlass(glassProto.components)) throw new MissingProto("no glazed tile to clone");

    // Drop the caps first — leaving them would seal the doorways this wall depends on.
    walls.tiles = walls.tiles.filter(
      (t) => !GLAZING_DOOR_CAPS.some((c) => c.x === t.x && c.y === t.y),
    );

    for (const cell of glazingCells()) {
      if (walls.tiles.some((t) => t.x === cell.x && t.y === cell.y)) continue;
      // Span reset to one cell: see the note above on why 2.5 rows would seal the level.
      walls.tiles.push({
        ...cloneTile(glassProto, cell.x, cell.y),
        colSpan: 1,
        rowSpan: 1,
        offsetX: 0,
        offsetY: 0,
      });
    }
    return true;
  } catch (e) {
    if (e instanceof MissingProto) return false; // map can't furnish it; skip
    throw e;
  }
}
