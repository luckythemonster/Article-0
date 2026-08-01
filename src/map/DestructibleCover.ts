import type { GameMap } from "./types";
import { cloneWithComponent, mustProto, MissingProto, type TilePos } from "./generate";

/**
 * A handful of the start level's own cover tiles, marked destructible.
 *
 * The `Destructible` cover field ships in the map schema but the shipped map's
 * single `cover0` prototype never sets it, so nothing was ever breakable. Since
 * the map is committed verbatim, this grafts the flag on at boot the same way
 * every other generated fixture is added — by cloning a tile the map already
 * places, here at coordinates the map already uses for cover, so no wall-clear
 * check is needed the way a brand new position would.
 *
 * Picked as the three `main1` cover tiles closest to the enforcer's patrol
 * route ((22,30)/(14,30)/(18,25)/(17,38), looped), so Stun Rounds, a pursuing
 * guard's fire and the Rail-Stapler's field mode all have something real to
 * break within reach of an actual patrol rather than only in unit tests.
 */
export const DESTRUCTIBLE_COVER: readonly TilePos[] = [
  { x: 15, y: 40 },
  { x: 14, y: 40 },
  { x: 13, y: 40 },
];

/** True when a destructible clone already sits at this coordinate. */
function hasDestructibleAt(tiles: { x: number; y: number; components: { type: string; values: Record<string, string> }[] }[], x: number, y: number): boolean {
  return tiles.some(
    (t) =>
      t.x === x &&
      t.y === y &&
      t.components.some((c) => c.type === "cover" && c.values.Destructible === "true"),
  );
}

/**
 * Marks {@link DESTRUCTIBLE_COVER}'s tiles as destructible on `startLevel`.
 * Optional like every other generator: a map with no cover on its start level
 * simply doesn't get any destructible cover. Idempotent — coordinates that
 * already carry a destructible clone (a second run against the same parsed
 * map) are skipped rather than duplicated, the same guarantee the other
 * generators give.
 */
export function appendDestructibleCover(map: GameMap, startLevel: string): boolean {
  const level = map.levels.find((l) => l.name === startLevel);
  const coverLayer = level?.layers.find((l) => l.name === "cover");
  if (!level || !coverLayer) return false;

  try {
    const proto = mustProto(map, "cover", (r) => r === "cover0", startLevel);
    for (const p of DESTRUCTIBLE_COVER) {
      if (hasDestructibleAt(coverLayer.tiles, p.x, p.y)) continue;
      coverLayer.tiles.push(
        cloneWithComponent(proto, p.x, p.y, "cover", { Destructible: "true" }),
      );
    }
    return true;
  } catch (e) {
    if (e instanceof MissingProto) return false;
    throw e;
  }
}
