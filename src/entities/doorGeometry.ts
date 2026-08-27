import { colliderRect, footprintCentre, type Rect } from "../map/footprint";
import type { GameTile } from "../map/types";

/**
 * Where a door is, and whether it is in the way.
 *
 * Both answers are arithmetic over the map's authoring data and a couple of
 * booleans, so they live here rather than inside `Door` — that class needs a
 * Phaser scene to exist at all, and neither of these questions does. Same
 * argument `src/map/footprint.ts` makes for the geometry it owns, and this
 * builds on that rather than repeating it.
 */

/**
 * Whether a door is physically blocking, given what it is doing.
 *
 * **Fully open and settled is the only state you can walk through.** Shut
 * blocks, closing blocks, and — the case this exists for — *opening* blocks,
 * for as long as the slide runs.
 *
 * That last one used to be false, and the class doc on `Door` said so: the
 * collision grid and the Arcade body flipped the instant `setOpen` was called
 * while the sprite took another 1.35 seconds to get out of the way. On the
 * shipped art that is 750ms of `UNLOCKED` — the granted-access indicator, played
 * over a door that has not moved a pixel — followed by 600ms of actual travel.
 * So a door you had just tapped was passable for over a second while it was
 * drawn dead shut, and you could walk straight through the leaf.
 *
 * Closing is unchanged and already correct: `open` goes false the moment the
 * door is told to shut, so it blocks from the first frame of the reversal.
 */
export function doorBlocks(open: boolean, sliding: boolean): boolean {
  return !open || sliding;
}

/** Where a door's art and its collider sit, in pixels. */
export interface DoorSeating {
  /** Centre y for the sprite *and* the collider — they are the same number. */
  centreY: number;
  /** The solid rectangle, already moved onto {@link centreY}. */
  collider: Rect;
}

/**
 * Seats a door: one centre line for what is drawn and what you collide with.
 *
 * `bottomSeated` is the east-west case. Those doors' hand-drawn art is 32×48 and
 * is not stretched — it stands in its own canvas the way the door stands in its
 * jamb — so its footprint's bottom edge is pinned to the bottom of the door's
 * own tile rather than taking the tile-centred seating the map's `Anchor` /
 * `OffsetY` metadata resolves to (that metadata was tuned for the older
 * pre-squished art). North-south doors are exactly one tile tall, where centred
 * and bottom-aligned are the same place, so this only ever moves the east-west
 * pair — and only once their art has loaded.
 *
 * **The collider moves with it.** It previously did not: collision was built
 * from {@link colliderRect} on the authored offset while the art was reseated,
 * which on the shipped 1×1.5 defs (`OffsetY: 4`) put the solid box 12px below
 * the door you can see. Both orientations blocked passage either way — a 48px
 * box covers the doorway row wherever in that row it starts — so this was never
 * a hole you could walk through, but you were stopped a half-body past the face
 * you were walking into, which is what "the colliders are wrong" looks like from
 * the player's side.
 *
 * Deliberately *not* fed back into `footprintCells`: the grid stays whole-cell
 * on the authored offset, so pathfinding, sight and radar keep exactly the cells
 * they have always had.
 */
export function doorSeating(
  tile: GameTile,
  tileSize: number,
  bottomSeated: boolean,
): DoorSeating {
  const authoredY = footprintCentre(tile, tileSize).y;
  const displayH = (tile.rowSpan ?? 1) * tileSize;
  const centreY = bottomSeated ? (tile.y + 1) * tileSize - displayH / 2 : authoredY;
  const rect = colliderRect(tile, tileSize);
  return { centreY, collider: { ...rect, y: rect.y + (centreY - authoredY) } };
}
