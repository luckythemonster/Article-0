import type { GameMap, Transition, TransitionKind } from "../map/types";

/** Boards whose tiles move the player to another level. */
const TRANSITION_BOARDS: TransitionKind[] = ["stairs", "maintenance_access"];

const key = (x: number, y: number): string => `${x},${y}`;

/**
 * The level-to-level connection map, derived automatically from the tile data.
 *
 * The edplay export carries no explicit destination for a stair/ladder/hatch —
 * but the author aligned matching access points across levels by coordinate
 * (e.g. `main1`'s stairs sit at the same tiles as `main2`'s; `main1`'s hatches
 * share coordinates with `duct1`'s ladders). That alignment *is* the graph:
 * a transition tile at (x,y) in level A connects to another level B whose
 * same-named board also has a tile at (x,y), and the player arrives at (x,y).
 *
 * Two refinements handle the map's rough edges:
 *  - **Affinity tie-break** — if several levels share a coordinate, prefer the
 *    one that shares the most of this board's tiles overall (then level order).
 *  - **Ragged-cluster fallback** — a tile with no exact-coordinate twin (e.g.
 *    the lower row of `main1`'s 2×2 stair block, absent from `main2`) links to
 *    the highest-affinity level and arrives at that level's nearest board tile.
 *
 * Pure: never touches Phaser. Built once from the parsed {@link GameMap}.
 */
export class TransitionGraph {
  /** levelName -> ("x,y" -> Transition). */
  private readonly byLevel = new Map<string, Map<string, Transition>>();

  constructor(map: GameMap) {
    // Per (level, kind): the set of transition-tile coordinates on that board.
    const coordsByLevelKind = new Map<string, Map<TransitionKind, Set<string>>>();
    for (const level of map.levels) {
      const perKind = new Map<TransitionKind, Set<string>>();
      for (const kind of TRANSITION_BOARDS) {
        const board = level.layers.find((l) => l.name === kind);
        if (!board) continue;
        const set = new Set<string>();
        for (const t of board.tiles) set.add(key(t.x, t.y));
        if (set.size > 0) perKind.set(kind, set);
      }
      coordsByLevelKind.set(level.name, perKind);
    }

    const levelOrder = map.levels.map((l) => l.name);

    // Shared-coordinate count between two levels for one board kind.
    const affinity = (a: string, b: string, kind: TransitionKind): number => {
      const sa = coordsByLevelKind.get(a)?.get(kind);
      const sb = coordsByLevelKind.get(b)?.get(kind);
      if (!sa || !sb) return 0;
      let n = 0;
      for (const c of sa) if (sb.has(c)) n++;
      return n;
    };

    // Deterministically pick the best destination level for a source tile.
    const pickLevel = (
      from: string,
      kind: TransitionKind,
      predicate: (b: string) => boolean,
    ): string | undefined => {
      let best: string | undefined;
      let bestAff = -1;
      for (const b of levelOrder) {
        if (b === from || !predicate(b)) continue;
        const aff = affinity(from, b, kind);
        if (aff > bestAff) {
          bestAff = aff;
          best = b;
        }
      }
      return best;
    };

    for (const level of map.levels) {
      const lookup = new Map<string, Transition>();

      for (const kind of TRANSITION_BOARDS) {
        const board = level.layers.find((l) => l.name === kind);
        if (!board) continue;

        for (const t of board.tiles) {
          const here = key(t.x, t.y);
          // First choice: a level with the identical coordinate.
          const toLevel =
            pickLevel(level.name, kind, (b) =>
              (coordsByLevelKind.get(b)?.get(kind)?.has(here) ?? false),
            ) ??
            // Fallback: any level sharing this board, arrive at nearest tile.
            pickLevel(level.name, kind, (b) => affinity(level.name, b, kind) > 0);

          if (!toLevel) continue;

          const destSet = coordsByLevelKind.get(toLevel)!.get(kind)!;
          const [toX, toY] = destSet.has(here)
            ? [t.x, t.y]
            : nearestCoord(destSet, t.x, t.y);

          lookup.set(here, { toLevel, toX, toY, kind });
        }
      }

      this.byLevel.set(level.name, lookup);
    }
  }

  /** The transition on the tile at (tileX, tileY) in a level, if any. */
  at(levelName: string, tileX: number, tileY: number): Transition | undefined {
    return this.byLevel.get(levelName)?.get(key(tileX, tileY));
  }
}

/** The coordinate in `set` closest to (x,y); ties resolve by (y, then x). */
function nearestCoord(set: Set<string>, x: number, y: number): [number, number] {
  let best: [number, number] = [x, y];
  let bestDist = Infinity;
  for (const c of set) {
    const [cx, cy] = c.split(",").map(Number);
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bestDist || (d === bestDist && (cy < best[1] || (cy === best[1] && cx < best[0])))) {
      bestDist = d;
      best = [cx, cy];
    }
  }
  return best;
}
