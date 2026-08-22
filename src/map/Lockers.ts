import type { GameMap, GameTile } from "./types";
import { cloneTile, MissingProto, requireClear, type TilePos } from "./generate";

/**
 * Somewhere to put a body, added at boot.
 *
 * The map has no locker: its `DataTypes` list runs `Chest`, `Cover`, `Door`,
 * `Glass`, `Hatch`, `Human`, `LightSource`, `PowerGrid`, `Sensor`, `Silicate`,
 * `Terminal`, `Vertical`, `enemySpawn` and nothing else, and no placed tile is
 * one. So `locker.aseprite` and `footlocker.aseprite` arrived with nowhere to
 * stand, and the stashing verb they exist for had nowhere to happen.
 *
 * Grafted on at boot by cloning a tile the map already places, the same way every
 * other engine-added fixture is — the export is committed verbatim and is never
 * hand-edited. Best-effort like its siblings: a map with nothing to clone, or one
 * whose geometry has moved under these coordinates, simply gets no lockers, and
 * the mechanic degrades to "there is nowhere to put him" rather than crashing.
 *
 * ### Where they go, and why there
 *
 * Coordinates were read off the shipped 36x18 `main1` rather than guessed, and
 * each one satisfies three things at once: it is clear, it backs onto a wall (a
 * locker stands against something), and its front is open so it can be reached
 * and worked. Each also sits within a tile or two of a point on one of the two
 * `security_guard_*` beats — (11,4)->(16,8)->(25,11)->(28,11) and
 * (29,8)->(6,8)->(11,4) — because a locker out of everyone's way solves nothing.
 * The whole tension of stashing is that the place to hide a body is near where
 * the body happened, which is near where a patrol is about to walk.
 *
 * Note this is the same trap `DestructibleCover` fell into and documents: its
 * constants were tuned for a 40x45 map and this one is 36x18, so every one of its
 * coordinates is now off the level and `requireClear` rejects the lot. These were
 * measured against the map as shipped today; if it is re-exported at another size
 * they will need re-measuring, and until then they fail closed rather than
 * placing lockers inside walls.
 */
export const MAIN1_LOCKERS: readonly TilePos[] = [
  { x: 16, y: 7 },
  { x: 25, y: 7 },
  { x: 29, y: 7 },
  { x: 5, y: 7 },
];

/** The board engine-added lockers live on, read by `indexFixtures`. */
export const LOCKER_BOARD = "lockers";

/**
 * A tile to clone for the carrier.
 *
 * Only its *placement* matters — `Locker` draws itself from `locker.aseprite`
 * through `HoldTarget`, so what this prototype looks like is the fallback shown
 * on a build with no entity art on disk, and nothing more. Cover art is the right
 * fallback for that: it is furniture, it is the same size, and it already reads
 * as something standing on the floor rather than painted on it.
 *
 * Any board-level tile will do, so this reaches map-wide rather than insisting on
 * the host level — the same reach `mustProto` gives every other generator.
 */
function lockerProto(map: GameMap, host: string): GameTile | undefined {
  for (const preferHost of [true, false]) {
    for (const level of map.levels) {
      if (preferHost !== (level.name === host)) continue;
      for (const board of ["cover", "items"]) {
        const found = level.layers.find((l) => l.name === board)?.tiles[0];
        if (found) return found;
      }
    }
  }
  return undefined;
}

/**
 * Adds {@link MAIN1_LOCKERS} to `startLevel`.
 *
 * Idempotent — a second run against the same parsed map finds the board already
 * populated and adds nothing, the same guarantee the other generators give.
 * Returns whether any locker was placed, so `main.ts` can report the same
 * best-effort outcome its siblings do.
 */
export function appendLockers(map: GameMap, startLevel: string): boolean {
  const level = map.levels.find((l) => l.name === startLevel);
  if (!level) return false;

  try {
    const proto = lockerProto(map, startLevel);
    if (!proto) throw new MissingProto(`no furniture tile to clone for "${startLevel}"`);
    requireClear(level, startLevel, MAIN1_LOCKERS);

    let board = level.layers.find((l) => l.name === LOCKER_BOARD);
    if (!board) {
      board = { name: LOCKER_BOARD, tiles: [] };
      level.layers.push(board);
    }
    for (const p of MAIN1_LOCKERS) {
      if (board.tiles.some((t) => t.x === p.x && t.y === p.y)) continue;
      // The `ref` is what `Locker` reads to pick between the two silhouettes, and
      // it is the only thing carried over from the clone that this cares about.
      const tile = cloneTile(proto, p.x, p.y, []);
      board.tiles.push({ ...tile, ref: "locker1", colSpan: 1, rowSpan: 1, offsetX: 0, offsetY: 0 });
    }
    return true;
  } catch (e) {
    if (e instanceof MissingProto) return false;
    throw e;
  }
}
