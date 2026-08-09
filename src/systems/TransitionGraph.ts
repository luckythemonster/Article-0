import type { GameMap, Transition, TransitionKind } from "../map/types";

/** Boards whose tiles move the player to another level. */
const TRANSITION_BOARDS: TransitionKind[] = ["stairs", "maintenance_access", "roof_access"];

/**
 * Refs that name one end of an explicitly numbered access pair, e.g. `hatch3`
 * and `ladder3`. Anchored on purpose: the map is full of intra-level ramp art
 * (`stairs_up_east2`, `stair_rail_top_left1`, …) on `catwalks` / `ramps` /
 * `upper_ramps`, and a loose `/stair|ladder/` would turn every one of them into
 * a level exit.
 */
const NUMBERED_ACCESS = /^(hatch|ladder)(\d+)$/i;

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

    this.linkNumberedPairs(map);
  }

  /**
   * Explicitly numbered access pairs — `hatch3` links to `ladder3`, wherever
   * either happens to sit.
   *
   * Collected across *every* board, because a map may file one end somewhere the
   * engine doesn't otherwise read: NW-SMAC-01 puts `main1`'s `hatch1` on the
   * `entities` board, which left the start level with no exit at all under
   * coordinate matching alone. The number is the author declaring the link
   * outright, so it beats coordinate matching and — unlike it — still works when
   * the two ends disagree on (x,y), as the roof pair does (main2 (5,1) vs
   * roof_array (6,30)).
   */
  private linkNumberedPairs(map: GameMap): void {
    type End = { level: string; x: number; y: number; kind: TransitionKind };
    const byNumber = new Map<string, End[]>();

    for (const level of map.levels) {
      for (const layer of level.layers) {
        for (const t of layer.tiles) {
          const m = NUMBERED_ACCESS.exec(t.ref);
          if (!m) continue;
          // A numbered tile on a real transition board keeps that board's trigger
          // style; one filed elsewhere is treated as a hatch, so it prompts on E
          // rather than teleporting the player who merely walks over it.
          const kind = (TRANSITION_BOARDS as string[]).includes(layer.name)
            ? (layer.name as TransitionKind)
            : "maintenance_access";
          byNumber.set(m[2], [...(byNumber.get(m[2]) ?? []), { level: level.name, x: t.x, y: t.y, kind }]);
        }
      }
    }

    for (const ends of byNumber.values()) {
      // Exactly two ends in two different levels, or it isn't a pair and we have
      // no basis for guessing which way it runs.
      if (ends.length !== 2) continue;
      const [a, b] = ends;
      if (a.level === b.level) continue;
      this.byLevel.get(a.level)?.set(key(a.x, a.y), { toLevel: b.level, toX: b.x, toY: b.y, kind: a.kind });
      this.byLevel.get(b.level)?.set(key(b.x, b.y), { toLevel: a.level, toX: a.x, toY: a.y, kind: b.kind });
    }
  }

  /** The transition on the tile at (tileX, tileY) in a level, if any. */
  at(levelName: string, tileX: number, tileY: number): Transition | undefined {
    return this.byLevel.get(levelName)?.get(key(tileX, tileY));
  }

  /**
   * Every transition tile on a level, with its coordinate — the reverse of
   * {@link at}, for the pause menu's map, which needs to mark the ways out
   * rather than test one tile.
   */
  exitsOn(levelName: string): { tx: number; ty: number; transition: Transition }[] {
    const lookup = this.byLevel.get(levelName);
    if (!lookup) return [];
    return [...lookup].map(([coord, transition]) => {
      const [tx, ty] = coord.split(",").map(Number);
      return { tx, ty, transition };
    });
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
