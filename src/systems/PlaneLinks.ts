import { deckCells, PLANE_FLOOR, PLANE_UPPER } from "../map/planes";
import type { GameLevel } from "../map/types";

/**
 * The ways between a level's two walk surfaces.
 *
 * A sibling of `TransitionGraph`, not an extension of it, and the split is
 * deliberate: that module is keyed entirely on cross-*level* coordinate matching
 * and its whole contract is `Transition.toLevel`. Its doc comment already sets
 * these three boards aside on purpose — "`vent_core`'s `catwalk_access_up` /
 * `floor_access_down` are ladders between a catwalk and the floor of the *same*
 * level… keying on the component would turn all of those into exits to nowhere".
 * That stays true. They are exits to somewhere else on the same level, and this
 * is what reads them.
 *
 * ### Two authored conventions, one derivation
 *
 * The map declares these two different ways, and both resolve the same way:
 *
 * - **`vent_core`** pairs `catwalk_access_up` with `floor_access_down` at the
 *   *same* three coordinates — (4,17), (35,17), (35,0) — one board per
 *   direction.
 * - **`roof_array`** places four single tiles on `ramps`, at (17,16), (10,7),
 *   (17,1) and (24,7).
 *
 * Every one of those ten tiles turns out to sit on a **floor cell with no deck
 * over it, directly beside a deck cell**. That is the whole rule: the link tile
 * is the foot, and the deck cell beside it is the head. So neither the direction
 * boards nor the ramp refs have to be trusted to say which way is up — the
 * geometry says it, and the two conventions need no separate code.
 */

/** One way between the two surfaces, usable in both directions. */
export interface PlaneLink {
  /** The foot: a floor cell the player stands on to use it. */
  x: number;
  y: number;
  /** The head: the deck cell it leads onto. */
  toX: number;
  toY: number;
}

/** Boards whose tiles are ways between the surfaces of one level. */
export const PLANE_LINK_BOARDS: readonly string[] = [
  "catwalk_access_up",
  "floor_access_down",
  "ramps",
];

/** Neighbours in a fixed order, so a foot with two heads resolves the same way twice. */
const NEIGHBOURS: readonly [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Reads a level's plane links. Empty for every level with one walk surface,
 * which is seven of the nine shipped ones.
 *
 * A link tile with no deck beside it yields nothing rather than a guess — the
 * same "don't point it at something and hope" discipline `TransitionGraph`
 * applies to an unpaired transition.
 */
export function planeLinksFor(level: GameLevel, tileSize: number): PlaneLink[] {
  const deck = deckCells(level, tileSize);
  const at = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < level.width && y < level.height && deck[y * level.width + x] === 1;

  const out: PlaneLink[] = [];
  const seen = new Set<number>();

  for (const layer of level.layers) {
    if (!PLANE_LINK_BOARDS.includes(layer.name)) continue;
    for (const tile of layer.tiles) {
      // `vent_core` files each of its links on two boards, once per direction;
      // they describe one way up, so the second sighting is not a second link.
      const key = tile.y * level.width + tile.x;
      if (seen.has(key)) continue;
      // The foot stands on the floor. A tile that is *itself* deck is not a way
      // between surfaces, it is deck.
      if (at(tile.x, tile.y)) continue;
      const head = NEIGHBOURS.map(([dx, dy]) => ({ x: tile.x + dx, y: tile.y + dy })).find((p) =>
        at(p.x, p.y),
      );
      if (!head) continue;
      seen.add(key);
      out.push({ x: tile.x, y: tile.y, toX: head.x, toY: head.y });
    }
  }
  return out;
}

/** The link the player is standing on, given which surface they are on. */
export function linkAt(
  links: readonly PlaneLink[],
  plane: number,
  tileX: number,
  tileY: number,
): PlaneLink | undefined {
  // Standing at the foot going up, or on the head coming down.
  if (plane === PLANE_FLOOR) return links.find((l) => l.x === tileX && l.y === tileY);
  if (plane === PLANE_UPPER) return links.find((l) => l.toX === tileX && l.toY === tileY);
  return undefined;
}
