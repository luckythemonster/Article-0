import { footprintCells } from "./footprint";
import type { GameLevel } from "./types";

/**
 * Which walk surface a board belongs to, and which cells that surface paves.
 *
 * NW-SMAC-01 v0.4 authors two levels with a second walk surface laid over the
 * first: `vent_core` (a perimeter gantry with cross-spurs, 334 cells) and
 * `roof_array` (a gantry grid, 200 cells). Both stack a `catwalks` board on a
 * `floor` board that already paves the whole level, and both author ways between
 * the two — `catwalk_access_up` / `floor_access_down` at matching coordinates,
 * and `ramps`. Until now the engine read all of it flat: the decks painted over
 * the floor, `roof_array`'s roof painted over the deck you walk on, and the
 * ladders did nothing.
 *
 * ### Why boards are named rather than inferred
 *
 * There is no elevation field in the export, so the engine has to decide from
 * the board. Overlap cannot: `rain` covers `floor` on 504 of 504 cells and is a
 * decal, `rain_cover` covers it on 255 and is a roof, `secret2`'s `markings`
 * covers it on 98 and is paint. Any overlap heuristic that catches `catwalks`
 * catches all three. Board order cannot either — `catwalks` is board 15 of 16 on
 * `vent_core` and board 2 of 15 on `roof_array`.
 *
 * So it is a named list, sitting beside the four other board-vocabulary
 * constants in `./types.ts` that the engine already keys off by name, and for
 * the reason `TransitionGraph.transitionClassOf` states: the name is the
 * author's declaration.
 *
 * ### Walls are structure the deck runs over
 *
 * Every wall cell on both levels is *also* a deck cell — 64 of 64 on
 * `vent_core`, 26 of 26 on `roof_array`. On `roof_array` the deck columns at
 * x=7/11/15/19 run the full height of the level and the wall band at rows 5–9
 * sits exactly on them. So the walls are the housings the gantry passes above,
 * not obstacles standing on it: they block the floor plane and neither block nor
 * occlude the deck. Read the other way the gantry would be severed into islands,
 * one of which (row 5, x=16–18) nothing could reach.
 *
 * That is also why the upper plane occludes no sight: from a walkway you are
 * above the walls. A future railing board wanting to occlude would declare
 * `Collision: 1` and be handled as an ordinary solid.
 */

/** The floor — every level has this one. */
export const PLANE_FLOOR = 0;
/** The catwalk deck, on the levels that author one. */
export const PLANE_UPPER = 1;

/** Boards that pave the upper walk surface. */
export const UPPER_PLANE_BOARDS: readonly string[] = ["catwalks"];

/**
 * Boards drawn above every plane — art the player passes *under*.
 *
 * `rain_cover` is 255 tiles of `tdRoof_48Terrain2_*` filed after the deck, so
 * baking it in board order paints a roof over the ground the player walks on.
 * As a canopy it reads as what it is.
 */
export const CANOPY_BOARDS: readonly string[] = ["rain_cover"];

/** Which plane a board's art belongs to; {@link CANOPY} is drawn above both. */
export const CANOPY = 2;

export function planeOfLayer(name: string): number {
  if (UPPER_PLANE_BOARDS.includes(name)) return PLANE_UPPER;
  if (CANOPY_BOARDS.includes(name)) return CANOPY;
  return PLANE_FLOOR;
}

/**
 * How many walk surfaces this level has: 2 where a deck board carries tiles, 1
 * everywhere else.
 *
 * Seven of the nine shipped levels have no `catwalks` board at all, so they
 * resolve to a single plane and every plane-aware path below collapses to
 * exactly what it did before.
 */
export function planeCount(level: GameLevel): number {
  const deck = level.layers.find((l) => UPPER_PLANE_BOARDS.includes(l.name));
  return deck && deck.tiles.length > 0 ? 2 : 1;
}

/**
 * The cells the upper deck paves, as a `width * height` mask.
 *
 * Footprint-expanded, like every other cell mask in the engine
 * ({@link footprintCells}), so a deck tile wider than its own cell claims all of
 * itself rather than the one cell it was placed on.
 */
export function deckCells(level: GameLevel, tileSize: number): Uint8Array {
  const mask = new Uint8Array(level.width * level.height);
  for (const layer of level.layers) {
    if (!UPPER_PLANE_BOARDS.includes(layer.name)) continue;
    for (const tile of layer.tiles) {
      for (const cell of footprintCells(tile, tileSize)) {
        if (cell.x < 0 || cell.y < 0 || cell.x >= level.width || cell.y >= level.height) continue;
        mask[cell.y * level.width + cell.x] = 1;
      }
    }
  }
  return mask;
}

/** The cells a canopy board covers — what the player can stand *under*. */
export function canopyCells(level: GameLevel, tileSize: number): Uint8Array {
  const mask = new Uint8Array(level.width * level.height);
  for (const layer of level.layers) {
    if (!CANOPY_BOARDS.includes(layer.name)) continue;
    for (const tile of layer.tiles) {
      for (const cell of footprintCells(tile, tileSize)) {
        if (cell.x < 0 || cell.y < 0 || cell.x >= level.width || cell.y >= level.height) continue;
        mask[cell.y * level.width + cell.x] = 1;
      }
    }
  }
  return mask;
}

/**
 * Which plane a *fixture* standing on this cell belongs to.
 *
 * Fixtures are placed per tile rather than per board, because the boards they
 * sit on are shared and say nothing about height: `roof_array` files the dish
 * and one enforcer rail on deck cells and its terminals and both spawn points on
 * the deck floor, all from boards that mix the two. The cell answers it.
 */
export function deckPlaneAt(deck: Uint8Array, level: GameLevel, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return PLANE_FLOOR;
  return deck[y * level.width + x] === 1 ? PLANE_UPPER : PLANE_FLOOR;
}
