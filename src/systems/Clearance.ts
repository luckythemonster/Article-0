/**
 * Clearance — whether Rowan is admitted to the ground he is standing on.
 *
 * The companion to {@link ../systems/Conduct}, and deliberately the other half of the
 * same sentence. `Conduct` answers *how is he behaving*; this answers *where is he*.
 * Until both existed the facility only ever asked the first, so a man who walked at
 * the pace of the corridor was waved through the vault anteroom exactly as he was
 * waved through the corridor.
 *
 * The rule is the prologue roster's, verbatim: **"STAFF clearance admits the holder to
 * every deck on which the holder has work. It does not admit the holder to a terminal,
 * a rack, or a vault."** A restricted area is somewhere staff clearance does not reach,
 * and a numbered keycard is what reaches it — the same numbered card that answers a
 * door, resolved through the same {@link keycardName}, so the card that opens the door
 * and the card that clears the room can never disagree about what it is.
 *
 * What being in one *does* lives in `Conduct`: it is a continuous `TRESPASS` breach, so
 * compliance drops and every sensor stops clearing him on sight. It does not stop him
 * walking in, does not trip an alarm, and does not make anyone see further. It removes
 * the cover story and the ordinary stealth rules resume.
 *
 * ### Why a per-tile array rather than a list of rooms
 *
 * A level's restricted ground is a {@link ClearanceMap}: one byte per tile holding the
 * clearance that tile demands, `0` for "anyone may be here". That is the shape every
 * other region in this codebase already takes — `deckCells` in `src/map/planes.ts`,
 * `ExploredMap`, `MapSnapshot.walls` — and it makes the question this module exists to
 * answer a single array index, which matters because it is asked every frame.
 *
 * Rectangles would have been the other option and are worse: the areas are derived by
 * flood fill (`src/map/AutoClearance.ts`), so they are room-shaped rather than
 * rectangular, and decomposing them back into boxes would lose exactly the wall-hugging
 * outline that makes the boundary legible in play.
 *
 * Pure — no Phaser, no DOM — like {@link ../systems/Conduct} and {@link ../systems/AlertState},
 * so the rules unit-test on their own.
 */

import { keycardName } from "./EntityStats";

/**
 * A level's restricted ground: the clearance each tile demands, row-major.
 *
 * Written once at boot by `src/map/AutoClearance.ts` and read-only thereafter — the
 * facility does not re-zone itself mid-run. Held on `GameLevel.restricted`, beside
 * `circuits`, for the same reason that lives there: it is derived from the level's
 * geometry and belongs to the level rather than to whoever is currently looking at it.
 */
export interface ClearanceMap {
  width: number;
  height: number;
  /** `width * height` bytes. Index `y * width + x`. `0` means unrestricted. */
  required: Uint8Array;
}

/**
 * The clearance an unrestricted tile demands.
 *
 * Zero rather than `-1` or `null` so a fresh `Uint8Array` is already a correct empty
 * map, and so it agrees with `DoorStats.key`, where `0` likewise means "no card
 * required". The two numbers are the same number in the fiction, and treating them the
 * same way here is what lets one keycard answer both.
 */
export const NO_CLEARANCE = 0;

/** Allocates an empty map for a level — every tile open. */
export function emptyClearanceMap(width: number, height: number): ClearanceMap {
  return { width, height, required: new Uint8Array(Math.max(0, width * height)) };
}

/**
 * The clearance the tile at `(tx, ty)` demands, or {@link NO_CLEARANCE}.
 *
 * A missing map and an out-of-bounds tile both read as open. That is not defensive
 * padding: a level nobody derived areas for has no restricted ground, and off the edge
 * of the deck there is no ground at all. Answering "open" for both means the caller
 * never has to special-case either, and the one thing this must never do is invent a
 * restriction where the map declared none.
 *
 * Fractional coordinates are floored rather than rejected, so a caller may hand this a
 * raw tile computed from pixels without rounding it first.
 */
export function clearanceAt(map: ClearanceMap | undefined, tx: number, ty: number): number {
  if (!map) return NO_CLEARANCE;
  const x = Math.floor(tx);
  const y = Math.floor(ty);
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return NO_CLEARANCE;
  return map.required[y * map.width + x] ?? NO_CLEARANCE;
}

/**
 * Raises the tile at `(tx, ty)` to `clearance`, never lowering it.
 *
 * Highest wins, because two sources may claim the same ground — a terminal's posted
 * apron inside a room that is itself sealed behind a locked door — and a place is as
 * restricted as its strictest claim on it. Lowering would let whichever source happened
 * to run second quietly unlock the other's ground.
 */
export function requireClearance(
  map: ClearanceMap,
  tx: number,
  ty: number,
  clearance: number,
): void {
  if (clearance <= NO_CLEARANCE) return;
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return;
  const i = ty * map.width + tx;
  // Clamp to a byte: the array cannot hold more, and silently wrapping a clearance of
  // 256 round to 0 would turn the most restricted ground in the game into open floor.
  const want = Math.min(255, Math.floor(clearance));
  if (want > map.required[i]) map.required[i] = want;
}

/**
 * True when `inventory` answers `clearance`.
 *
 * {@link NO_CLEARANCE} is answered by everything, including empty hands — that is what
 * makes unrestricted ground unrestricted rather than a permission nobody was granted.
 *
 * Reuses {@link keycardName} rather than matching a string here, so this and
 * `doorOpensWith` are asking the same question of the same item family. A keycard is
 * the one open-ended family in the game (a map may lock anything on any number), which
 * is why the check is a name built from a number rather than a lookup in a list.
 */
export function isCleared(clearance: number, inventory: readonly string[]): boolean {
  if (clearance <= NO_CLEARANCE) return true;
  return inventory.includes(keycardName(clearance));
}

/**
 * How many tiles of a map demand any clearance at all.
 *
 * For the derivation's own tests and the debug overlay: "this deck came out 4%
 * restricted" is the one number that says whether a derived area is a room or a
 * runaway flood fill.
 */
export function restrictedTileCount(map: ClearanceMap | undefined): number {
  if (!map) return 0;
  let n = 0;
  for (let i = 0; i < map.required.length; i++) if (map.required[i] !== NO_CLEARANCE) n++;
  return n;
}
