import type { GameMap, GameTile } from "./types";
import { cloneWithComponent, MissingProto, requireClear, type TilePos } from "./generate";

/**
 * A handful of the start level's own cover tiles, marked destructible.
 *
 * The `Destructible` cover field ships in the map schema but a map's cover
 * prototype won't always set it, so this grafts the flag on at boot the same
 * way every other generated fixture is added — by cloning a tile the map
 * already places, here at coordinates picked for the shipped 40×45 map's cover
 * layout. Best-effort, like every generator: a map whose start level has no
 * cover tile carrying a real `cover` component to clone from, or whose cover
 * doesn't sit at these coordinates, simply doesn't get destructible cover.
 *
 * Picked, on the map these coordinates were tuned for, as the three `main1`
 * cover tiles closest to the enforcer's patrol route
 * ((22,30)/(14,30)/(18,25)/(17,38), looped), so Stun Rounds, a pursuing
 * guard's fire and the Rail-Stapler's field mode all have something real to
 * break within reach of an actual patrol rather than only in unit tests.
 */
export const DESTRUCTIBLE_COVER: readonly TilePos[] = [
  { x: 15, y: 40 },
  { x: 14, y: 40 },
  { x: 13, y: 40 },
];

/**
 * A cover tile that actually carries a `cover` component — the thing
 * {@link cloneWithComponent} needs to override `Destructible` onto. Prefers
 * `startLevel`'s own cover art, so main1's clones look like main1's furniture
 * whenever main1 has any component-bearing cover to offer; otherwise any tile
 * on the board map-wide, the same reach `mustProto` gives every other generator.
 *
 * Ref alone can't answer this — the shipped map typed its one cover prototype
 * `cover0`, but a re-export is free to place cover art with no `cover`
 * component at all (main1's own boxes and desk do exactly that on this map),
 * and cloning one of those would silently produce a tile the `Destructible`
 * override has nothing to attach to.
 */
function destructibleProto(map: GameMap, startLevel: string): GameTile | undefined {
  const hasCover = (t: GameTile): boolean => t.components.some((c) => c.type === "cover");
  for (const level of map.levels) {
    if (level.name !== startLevel) continue;
    const found = level.layers.find((l) => l.name === "cover")?.tiles.find(hasCover);
    if (found) return found;
  }
  for (const level of map.levels) {
    const found = level.layers.find((l) => l.name === "cover")?.tiles.find(hasCover);
    if (found) return found;
  }
  return undefined;
}

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
    const proto = destructibleProto(map, startLevel);
    if (!proto) {
      throw new MissingProto(`no cover tile with a "cover" component to clone for "${startLevel}"`);
    }
    // Coordinates are reused from the shipped map, which is exactly why they can't be
    // trusted blind on a different one — every sibling generator checks placement
    // before committing, and this was the one that didn't.
    requireClear(level, startLevel, DESTRUCTIBLE_COVER);
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
