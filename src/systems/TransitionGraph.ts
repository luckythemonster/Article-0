import type { GameMap, GameTile, Transition, TransitionKind } from "../map/types";

/**
 * Legacy transition boards: one board per trigger style, the name doubling as
 * the style. Still what the engine's own generators emit (`VentCoreLevel`,
 * `RoofArrayLevel`, `graftExtractionEntrance`), so they stay first-class.
 */
const TRANSITION_BOARDS: TransitionKind[] = ["stairs", "maintenance_access", "roof_access"];

/**
 * The board NW-SMAC-01 v0.4 files every way out on.
 *
 * v0.3 spread them across nine differently-named boards — `access`,
 * `maintenance_access`, `main2_access`, `main2_vault_entrance1`, `stairs`,
 * `elevator_top` — which meant both ends of a link were almost never on a board
 * of the same name, and the graph saw one connection in the whole map. v0.4
 * consolidates onto this single name, so a link is now just "two levels with a
 * `verticals` tile at the same coordinate".
 */
const VERTICALS_BOARD = "verticals";

/** Elevator car boards: `elevator`, `elevator_bottom`, `elevators`. */
const ELEVATOR_BOARD = /^elevator/i;

/**
 * Refs that name a way out, for the boards above.
 *
 * The filter is not optional. `main2vault` files its stairwell art on
 * `verticals` alongside the real stair, and those two tiles carry `enemySpawn`
 * — without this, walking onto a guard post teleports the player to `main2`. It
 * also drops the elevator car's door art, leaving the car itself as the one
 * coordinate the shaft is keyed on.
 *
 * Anchored, and `^stairs` rather than `/stair/`: `stairwell1` is art, and the
 * map is full of intra-level ramp pieces (`stair_rail_top_left1`) that a loose
 * pattern would turn into level exits.
 */
const VERTICAL_REF = /^(access_hatch|hatch|ladder|stairs|elevator)/i;

/**
 * Refs that name one end of an explicitly numbered access pair, e.g. `hatch3`
 * and `ladder3`. Anchored on purpose: the map is full of intra-level ramp art
 * (`stairs_up_east2`, `stair_rail_top_left1`, …) on `catwalks` / `ramps` /
 * `upper_ramps`, and a loose `/stair|ladder/` would turn every one of them into
 * a level exit.
 */
const NUMBERED_ACCESS = /^(hatch|ladder)(\d+)$/i;

/**
 * Refs that name one floor of a numbered elevator shaft, e.g. `elevator1`. A
 * dedicated regex and number-keyed group rather than folding into
 * {@link NUMBERED_ACCESS}: this file's own invariant is that two ends only
 * ever pair inside the same class (see {@link TransitionClass}), and sharing
 * one namespace would let a stray reused digit (`hatch7` / `elevator7`)
 * cross-link a hatch to an elevator car. A plain unnumbered `elevator` ref —
 * the shipped map's convention — has no digits and never matches.
 *
 * The number is the shaft; an optional trailing `_LABEL` is that floor's name
 * in the car's panel — `elevator1_ROOF`, `elevator1_B2_MAINTENANCE`. Authored
 * on the ref rather than in a component because that is how this engine already
 * reads intent (`^stairs` is walked over, `*_avatar` is where the Core stands),
 * and because it needs nothing new in the tile editor. See {@link floorLabel}.
 */
const NUMBERED_ELEVATOR = /^elevator(\d+)(?:_(.+))?$/i;

/**
 * How far apart the two ends of a link may drift and still be read as one link.
 *
 * One tile, axis-aligned, and only between two ends that have no exact partner
 * at all — see {@link TransitionGraph.linkSlippedPairs}. Deliberately tighter
 * than it could be: guessing link geometry is the silent failure the map docs
 * warn about, and on the shipped map exactly one authored slip needs rescuing.
 */
const SLIP_TOLERANCE = 1;

/**
 * Which index a transition tile is matched within. Two ends only ever pair
 * inside the same class, so a hatch can never be mistaken for an elevator car.
 */
type TransitionClass = TransitionKind | "verticals" | "elevator";

/** One classified transition tile, before it knows where it leads. */
interface AccessEnd {
  level: string;
  x: number;
  y: number;
  cls: TransitionClass;
  kind: TransitionKind;
  /** The floor's authored name, for elevator ends only — see {@link floorLabel}. */
  label?: string;
}

/**
 * One stop a shaft serves: where the car goes and what the panel calls it.
 *
 * The whole ring is kept per tile rather than collapsed to one edge, which is
 * what lets the car's panel offer every floor instead of only the next one —
 * see {@link TransitionGraph.shaftAt}.
 */
export interface ShaftStop {
  level: string;
  x: number;
  y: number;
  /** What the panel prints for this floor. Never empty. */
  label: string;
}

const key = (x: number, y: number): string => `${x},${y}`;

/** The answer for every tile that is not a lift — see {@link TransitionGraph.shaftAt}. */
const NO_STOPS: ShaftStop[] = [];

/**
 * What the car's panel calls a floor.
 *
 * The author names it on the ref — `elevator1_B2_MAINTENANCE` is `B2
 * MAINTENANCE` — and a floor left unnamed falls back to its level's name, so a
 * coordinate-keyed shaft (a plain `elevator` ref, which the shipped map uses)
 * still reads as something rather than as a blank row.
 */
export function floorLabel(ref: string, levelName: string): string {
  const authored = NUMBERED_ELEVATOR.exec(ref)?.[2];
  return authored ? authored.replace(/_/g, " ").toUpperCase() : levelName;
}

/**
 * Classifies a board, or returns undefined for one that isn't a way out.
 *
 * Board name rather than tile ref, because the name is the author's declaration
 * and a ref is only art. `roof_array` proves the difference: its
 * `ramp_up_south_metal1` carries a `Vertical` component but sits on `ramps`, an
 * intra-level ramp, and `vent_core`'s `catwalk_access_up` / `floor_access_down`
 * are ladders between a catwalk and the floor of the *same* level. Keying on the
 * component would turn all of those into exits to nowhere.
 */
export function transitionClassOf(board: string): TransitionClass | undefined {
  if (board === VERTICALS_BOARD) return "verticals";
  if (ELEVATOR_BOARD.test(board)) return "elevator";
  return (TRANSITION_BOARDS as string[]).includes(board)
    ? (board as TransitionKind)
    : undefined;
}

/**
 * Whether a tile on a classified board is a way out rather than art sharing it.
 *
 * Legacy boards take every tile, exactly as they always did — they hold nothing
 * but engine-generated transition tiles, and narrowing them would change
 * behaviour on maps this migration never looked at.
 */
function isWayOut(cls: TransitionClass, tile: GameTile): boolean {
  if (cls !== "verticals" && cls !== "elevator") return true;
  return VERTICAL_REF.test(tile.ref) || (tile.components ?? []).some((c) => c.type === "vertical");
}

/**
 * How this tile triggers.
 *
 * On the consolidated board the tile's own art says which: stairs are walked
 * over, hatches and ladders are entered with the interact key. Verified against
 * every pair in the shipped map — both ends always agree, so the player gets the
 * same interaction in both directions. An elevator is a hatch that happens to go
 * to the roof.
 */
function kindOf(cls: TransitionClass, tile: GameTile): TransitionKind {
  if (cls === "elevator") return "roof_access";
  if (cls !== "verticals") return cls;
  return /^stairs/i.test(tile.ref) ? "stairs" : "maintenance_access";
}

/**
 * The level-to-level connection map, derived automatically from the tile data.
 *
 * The edplay export carries no explicit destination for a stair/ladder/hatch —
 * but the author aligns matching access points across levels by coordinate, and
 * files them on a board whose name says they are ways out. That alignment *is*
 * the graph: a transition tile at (x,y) in level A connects to another level B
 * with a transition tile of the same class at (x,y), and the player arrives at
 * (x,y).
 *
 * Three refinements handle the map's rough edges:
 *  - **Affinity tie-break** — if several levels share a coordinate, prefer the
 *    one that shares the most of this class's tiles overall (then level order).
 *  - **Shafts** — an elevator coordinate shared by three or more levels is a
 *    lift, not a pair, and is linked as a cycle so no floor is a dead end.
 *  - **Slipped pairs** — two otherwise-unpartnered ends a single tile apart on
 *    one axis are one link the author nudged off true.
 *
 * What it deliberately does *not* do is guess: a tile with no partner stays
 * inert art rather than being pointed at whichever level looks closest. An
 * earlier ragged-cluster fallback did exactly that, and on a coordinate-keyed
 * index it fabricates exits — `duct1`'s two dangling ladders would each have
 * dropped the player onto an unrelated level's hatch.
 *
 * Pure: never touches Phaser. Built once from the parsed {@link GameMap}.
 */
export class TransitionGraph {
  /** levelName -> ("x,y" -> Transition). */
  private readonly byLevel = new Map<string, Map<string, Transition>>();

  /**
   * levelName -> ("x,y" -> every stop the shaft that tile belongs to serves).
   *
   * Written alongside {@link byLevel} rather than instead of it: the cycle in
   * `byLevel` stays the ride a floor takes when nobody picks, and this is the
   * menu the car's panel offers. Only elevator cars appear here.
   */
  private readonly shaftsByLevel = new Map<string, Map<string, ShaftStop[]>>();

  constructor(map: GameMap) {
    const ends: AccessEnd[] = [];
    // Per (level, class): the set of transition-tile coordinates.
    const coordsByLevelClass = new Map<string, Map<TransitionClass, Set<string>>>();

    for (const level of map.levels) {
      const perClass = new Map<TransitionClass, Set<string>>();
      for (const board of level.layers) {
        const cls = transitionClassOf(board.name);
        if (cls === undefined) continue;
        for (const t of board.tiles) {
          if (!isWayOut(cls, t)) continue;
          ends.push({
            level: level.name,
            x: t.x,
            y: t.y,
            cls,
            kind: kindOf(cls, t),
            label: cls === "elevator" ? floorLabel(t.ref, level.name) : undefined,
          });
          let set = perClass.get(cls);
          if (!set) perClass.set(cls, (set = new Set<string>()));
          set.add(key(t.x, t.y));
        }
      }
      coordsByLevelClass.set(level.name, perClass);
      this.byLevel.set(level.name, new Map<string, Transition>());
      this.shaftsByLevel.set(level.name, new Map<string, ShaftStop[]>());
    }

    const levelOrder = map.levels.map((l) => l.name);

    // Shared-coordinate count between two levels for one class.
    const affinity = (a: string, b: string, cls: TransitionClass): number => {
      const sa = coordsByLevelClass.get(a)?.get(cls);
      const sb = coordsByLevelClass.get(b)?.get(cls);
      if (!sa || !sb) return 0;
      let n = 0;
      for (const c of sa) if (sb.has(c)) n++;
      return n;
    };

    // The unpartnered ends, collected as we go, for the slip rule below.
    const orphans: AccessEnd[] = [];

    for (const end of ends) {
      const here = key(end.x, end.y);
      // A level with the identical coordinate on the same class; ties by affinity,
      // then by map order.
      let best: string | undefined;
      let bestAff = -1;
      for (const b of levelOrder) {
        if (b === end.level) continue;
        if (!coordsByLevelClass.get(b)?.get(end.cls)?.has(here)) continue;
        const aff = affinity(end.level, b, end.cls);
        if (aff > bestAff) {
          bestAff = aff;
          best = b;
        }
      }
      if (best === undefined) {
        orphans.push(end);
        continue;
      }
      this.byLevel
        .get(end.level)!
        .set(here, { toLevel: best, toX: end.x, toY: end.y, kind: end.kind });
    }

    this.linkShafts(ends, levelOrder);
    this.linkSlippedPairs(orphans);
    this.linkNumberedPairs(map);
    this.linkNumberedElevators(map, levelOrder);
  }

  /**
   * An elevator coordinate shared by three or more levels is a shaft.
   *
   * Pairwise matching gives each source tile exactly one destination, which on a
   * three-stop lift leaves one floor with no way back — on NW-SMAC-01 the roof,
   * which is the extraction deck. Linking the floors as a cycle in map order
   * (`vent_core → main2 → roof_array → vent_core`) gives every floor one way in
   * and one way out. The accepted cost is that the car only travels one way
   * round; the roof also has an authored ladder down to `main2`, so no journey
   * depends on riding it backwards.
   */
  private linkShafts(ends: AccessEnd[], levelOrder: string[]): void {
    const byCoord = new Map<string, AccessEnd[]>();
    for (const e of ends) {
      if (e.cls !== "elevator") continue;
      const k = key(e.x, e.y);
      byCoord.set(k, [...(byCoord.get(k) ?? []), e]);
    }

    for (const [, stops] of byCoord) {
      // One end per level, in map order, so the ring is deterministic.
      const floors = levelOrder
        .map((name) => stops.find((s) => s.level === name))
        .filter((s): s is AccessEnd => s !== undefined);
      // A coordinate-keyed pair (2 floors) is already handled by the main
      // per-end best-match loop above; only 3+ makes this a shaft.
      if (floors.length < 3) continue;
      this.linkCycle(floors);
    }
  }

  /**
   * Links a set of floors — one end each, already ordered — as a one-way
   * cycle: every floor gets one way in and one way out, and the car travels
   * one way round. Shared by {@link linkShafts} (floors sharing a coordinate)
   * and {@link linkNumberedElevators} (floors sharing a declared number).
   *
   * The cycle is the ride a floor takes when nobody picks — the panel offers
   * the whole ring, recorded here at the same time, because these floors *are*
   * the shaft and nothing downstream can reconstruct them from single edges.
   */
  private linkCycle(floors: AccessEnd[]): void {
    const stops: ShaftStop[] = floors.map((f) => ({
      level: f.level,
      x: f.x,
      y: f.y,
      label: f.label ?? f.level,
    }));

    floors.forEach((from, i) => {
      const to = floors[(i + 1) % floors.length];
      this.byLevel
        .get(from.level)!
        .set(key(from.x, from.y), {
          toLevel: to.level,
          toX: to.x,
          toY: to.y,
          kind: from.kind,
        });
      this.shaftsByLevel.get(from.level)?.set(key(from.x, from.y), stops);
    });
  }

  /**
   * Two unpartnered ends one tile apart on one axis are one link, nudged.
   *
   * NW-SMAC-01 v0.4 leaves `secret1` stranded behind exactly this: its
   * `access_hatch2`(23,13) and `duct1`'s `access_hatch4`(24,13) are plainly the
   * same hatch with one end a tile out, and without the rescue the level — a
   * log cache and a supply chest — is unreachable.
   *
   * Every clause is load-bearing against fabricating links the author never
   * drew. Both ends must already have failed exact matching, so a real pair is
   * never overridden; they must be **mutually** nearest, so one orphan cannot
   * steal a partner; and axis-aligned within one tile is tight enough that
   * `duct1`'s other dangling ladder at (34,14) — eleven tiles from anything —
   * correctly stays inert.
   */
  private linkSlippedPairs(orphans: AccessEnd[]): void {
    const dist = (a: AccessEnd, b: AccessEnd): number | undefined => {
      if (a.level === b.level || a.cls !== b.cls) return undefined;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx !== 0 && dy !== 0) return undefined; // not axis-aligned
      const d = dx + dy;
      return d > 0 && d <= SLIP_TOLERANCE ? d : undefined;
    };

    const nearest = (a: AccessEnd): AccessEnd | undefined => {
      let best: AccessEnd | undefined;
      let bestD = Infinity;
      for (const b of orphans) {
        const d = dist(a, b);
        if (d === undefined || d >= bestD) continue;
        bestD = d;
        best = b;
      }
      return best;
    };

    for (const a of orphans) {
      const b = nearest(a);
      // Mutually nearest, or it isn't a pair — and the reverse edge is written
      // when the loop reaches `b`, so each end keeps its own trigger style.
      if (!b || nearest(b) !== a) continue;
      this.byLevel
        .get(a.level)!
        .set(key(a.x, a.y), { toLevel: b.level, toX: b.x, toY: b.y, kind: a.kind });
    }
  }

  /**
   * Explicitly numbered access pairs — `hatch3` links to `ladder3`, wherever
   * either happens to sit.
   *
   * Collected across *every* board, because a map may file one end somewhere the
   * engine doesn't otherwise read. The number is the author declaring the link
   * outright, so it beats coordinate matching and — unlike it — still works when
   * the two ends disagree on (x,y).
   */
  private linkNumberedPairs(map: GameMap): void {
    const byNumber = new Map<string, AccessEnd[]>();

    for (const level of map.levels) {
      for (const layer of level.layers) {
        const cls = transitionClassOf(layer.name);
        for (const t of layer.tiles) {
          const m = NUMBERED_ACCESS.exec(t.ref);
          if (!m) continue;
          // A numbered tile on a real transition board keeps that board's trigger
          // style; one filed elsewhere is treated as a hatch, so it prompts on E
          // rather than teleporting the player who merely walks over it.
          const kind = cls === undefined ? "maintenance_access" : kindOf(cls, t);
          byNumber.set(m[2], [
            ...(byNumber.get(m[2]) ?? []),
            { level: level.name, x: t.x, y: t.y, cls: cls ?? "maintenance_access", kind },
          ]);
        }
      }
    }

    for (const ends of byNumber.values()) {
      // Exactly two ends in two different levels, or it isn't a pair and we have
      // no basis for guessing which way it runs.
      if (ends.length !== 2) continue;
      const [a, b] = ends;
      if (a.level === b.level) continue;
      this.byLevel
        .get(a.level)
        ?.set(key(a.x, a.y), { toLevel: b.level, toX: b.x, toY: b.y, kind: a.kind });
      this.byLevel
        .get(b.level)
        ?.set(key(b.x, b.y), { toLevel: a.level, toX: a.x, toY: a.y, kind: b.kind });
    }
  }

  /**
   * Numbered elevator shafts — every floor's car tile shares one ref,
   * `elevator<N>`, and links into a pair or a cycle regardless of coordinate.
   *
   * This is the elevator counterpart to {@link linkNumberedPairs}, but keyed
   * by the *shaft* model rather than the hatch/ladder *pair* one: a shaft's
   * floors all declare the same number (mirroring how a coordinate-keyed
   * shaft has all its floors share one coordinate today) rather than two
   * different prefixes, so it generalizes from 2 floors to N without a
   * separate rule for each.
   *
   * Only tiles on a board {@link transitionClassOf} already calls
   * `"elevator"` are scanned — narrower than hatch/ladder's "wherever it
   * sits" — because {@link kindOf} only produces the elevator's
   * `roof_access` trigger for tiles classified that way; a numbered elevator
   * ref filed off an elevator board would silently lose it.
   */
  private linkNumberedElevators(map: GameMap, levelOrder: string[]): void {
    const byNumber = new Map<string, AccessEnd[]>();

    for (const level of map.levels) {
      for (const layer of level.layers) {
        const cls = transitionClassOf(layer.name);
        if (cls !== "elevator") continue;
        for (const t of layer.tiles) {
          const m = NUMBERED_ELEVATOR.exec(t.ref);
          if (!m) continue;
          byNumber.set(m[1], [
            ...(byNumber.get(m[1]) ?? []),
            {
              level: level.name,
              x: t.x,
              y: t.y,
              cls,
              kind: kindOf(cls, t),
              label: floorLabel(t.ref, level.name),
            },
          ]);
        }
      }
    }

    for (const stops of byNumber.values()) {
      // One end per level, in map order, exactly as a coordinate-keyed shaft
      // does — see linkShafts. Fewer than two distinct levels means the
      // number has no partner, so it stays inert rather than guessed at.
      const floors = levelOrder
        .map((name) => stops.find((s) => s.level === name))
        .filter((s): s is AccessEnd => s !== undefined);
      if (floors.length < 2) continue;
      this.linkCycle(floors);
    }
  }

  /** The transition on the tile at (tileX, tileY) in a level, if any. */
  at(levelName: string, tileX: number, tileY: number): Transition | undefined {
    return this.byLevel.get(levelName)?.get(key(tileX, tileY));
  }

  /**
   * Every *other* floor the car on this tile serves, in map order — what the
   * panel inside it offers.
   *
   * Empty for anything that is not an elevator car, and for a car whose shaft
   * nothing else joined, so a caller can treat "no choice to make" and "not a
   * lift" the same way. The floor being ridden from is dropped rather than
   * shown greyed: a lift button for the floor you are standing on is a button
   * that does nothing.
   */
  shaftAt(levelName: string, tileX: number, tileY: number): ShaftStop[] {
    const stops = this.shaftsByLevel.get(levelName)?.get(key(tileX, tileY));
    // Read once per frame from the tile under the player, so the miss — every
    // tile that is not a lift — hands back the shared empty rather than a new
    // array to collect.
    if (!stops) return NO_STOPS;
    return stops.filter((s) => s.level !== levelName);
  }

  /**
   * This car's own stop — the floor being ridden *from*, which the panel prints
   * as its header. The counterpart to {@link shaftAt}, which drops it.
   */
  floorAt(levelName: string, tileX: number, tileY: number): ShaftStop | undefined {
    return this.shaftsByLevel
      .get(levelName)
      ?.get(key(tileX, tileY))
      ?.find((s) => s.level === levelName);
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
