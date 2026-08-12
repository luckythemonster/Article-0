import { transitionClassOf } from "../systems/TransitionGraph";
import type { GameLevel, GameMap, GameTile } from "./types";
import {
  ensureLayer,
  marker,
  MissingProto,
  protoTile,
  spreadAround,
  standableIn,
  type TilePos,
} from "./generate";

/**
 * Adopting hand-authored versions of the levels the engine would otherwise
 * generate.
 *
 * `appendVentCore` and `appendRoofArray` bail the moment the map already has a
 * level by their name — which is right, since nobody wants a generated arena
 * stamped over one somebody drew. What was wrong is what happened next: they
 * returned `true`, so `hasVentCore` / `hasRoof` went into the registry and every
 * objective line, codec hint and win condition lit up for content that was, as
 * far as the runtime was concerned, an empty room. The arena had no boss anchors,
 * the roof had no pedestals, and nothing said so.
 *
 * This module is the missing half. It translates what the author *did* place into
 * the board vocabulary the runtime already reads, and derives the rest, so an
 * authored level arrives at `Vent4Boss` / `RoofRelay` carrying the same anchors a
 * generated one would.
 *
 * Two rules it works under:
 *
 * - **Move, don't copy.** A fixture that becomes an entity has to leave the art
 *   board it came from, or the tile bake paints it *and* the entity draws it —
 *   the same double-draw `ENTITY_LAYERS` exists to prevent.
 * - **Author beats engine.** Every board here is filled only when empty, so a map
 *   that places its own `pitons` (or anything else) keeps them. The derived
 *   layouts are a floor, not a ceiling.
 */

/** Refs on the authored `energy` board that are pressure sub-stations. */
const SUBSTATION_REF = /^substation_energy/i;
/** The VENT-4 chassis: the turbine the whole arena is arranged around. */
const CHASSIS_REF = /chassis/i;
/** Steam vents, authored as art on the `VENT-4` board. */
const STEAM_REF = /^steam_vent/i;
/** The roof's hold-to-calibrate pedestals, authored on `terminals`. */
const PEDESTAL_REF = /^calibration_pedestal/i;

/**
 * v0.4's names for the same fixtures. The export moved on; both vocabularies are
 * read, because the v0.2-era one is also what the engine's own generators emit
 * and what the fixtures in `AdoptAuthored.test.ts` are written against.
 */
/** The turbines the arena is arranged around, on v0.4's `vents` board. */
const TURBINE_REF = /^turbine/i;
/** v0.4's board of pressure capacitors — the sub-stations under another name. */
const CAPACITOR_BOARD = "VENT-4_capacitors";
/** EIRA-7 herself, at the centre of the authored vault. */
const AVATAR_REF = /avatar/i;

/** A tile's `terminal` component type, lowercased, or "" for a tile with none. */
const terminalType = (t: GameTile): string =>
  (t.components.find((c) => c.type === "terminal")?.values.type ?? "").toLowerCase();

/** Tiles on `board` matching `pick`, removed from it and returned. */
function takeFrom(
  level: GameLevel,
  board: string,
  pick: RegExp | ((t: GameTile) => boolean),
): GameTile[] {
  const layer = level.layers.find((l) => l.name === board);
  if (!layer) return [];
  const match = pick instanceof RegExp ? (t: GameTile): boolean => pick.test(t.ref) : pick;
  const taken = layer.tiles.filter(match);
  if (taken.length > 0) layer.tiles = layer.tiles.filter((t) => !match(t));
  return taken;
}

/** Tiles on `board` matching `ref`, left where they are. */
function peek(level: GameLevel, board: string, ref: RegExp): GameTile[] {
  return (level.layers.find((l) => l.name === board)?.tiles ?? []).filter((t) => ref.test(t.ref));
}

/** The tiles on a board, whatever they are. */
const tilesOn = (level: GameLevel, board: string): GameTile[] =>
  level.layers.find((l) => l.name === board)?.tiles ?? [];

/** The centre of a set of tiles, rounded to a cell. */
function centroid(tiles: readonly GameTile[]): TilePos {
  const n = tiles.length;
  return {
    x: Math.round(tiles.reduce((s, t) => s + t.x, 0) / n),
    y: Math.round(tiles.reduce((s, t) => s + t.y, 0) / n),
  };
}

/** Fills a board from `make()` — but only if the author left it empty. */
function fillIfEmpty(level: GameLevel, board: string, make: () => GameTile[]): void {
  const layer = ensureLayer(level, board);
  if (layer.tiles.length > 0) return;
  layer.tiles.push(...make());
}

/** Markers at each position, named for the board they anchor. */
const markers = (ref: string, at: readonly TilePos[]): GameTile[] =>
  at.map((p) => marker(ref, p.x, p.y));

/**
 * Join a stair that leads nowhere to an extraction level nothing leads to.
 *
 * NW-SMAC-01 authored `main2` with no `stairs` or `maintenance_access` tile at
 * all, which left the win condition on a deck the player cannot walk to, and
 * `vent_core` with a `stairs_up_west1` whose coordinate no other level answers.
 * Those two facts are the same missing staircase seen from either end.
 *
 * The pairing is declared with the map's own numbered-access convention
 * (`hatch9` / `ladder9` — 9 to stay clear of anything an author is likely to
 * have used) rather than by coordinate, because the donor's coordinate is a wall
 * on the far side: the arrival tile has to be the nearest spot a player can
 * actually stand.
 *
 * Declines quietly if the extraction level is already reachable, if nothing
 * dangles, or if there is nowhere to land — the run just keeps whatever routing
 * the map came with.
 *
 * @returns whether a link was grafted.
 */
export function graftExtractionEntrance(map: GameMap, extraction: string | null): boolean {
  if (extraction === null) return false;
  const level = map.levels.find((l) => l.name === extraction);
  if (!level) return false;

  // Every board the transition graph would read as a way in — the map's own name
  // for them, whatever it is, rather than the two the engine happens to generate.
  // NW-SMAC-01 v0.4 files all of them on `verticals`, so hardcoding `stairs` here
  // reported "no way in" for a deck with four of them and grafted a bogus link.
  const waysInto = (name: string): GameTile[] =>
    (map.levels.find((l) => l.name === name)?.layers ?? [])
      // `roof_access` does not count: the roof is downstream of extraction, not a
      // way into it. Any other class does, an elevator car included.
      .filter((l) => {
        const cls = transitionClassOf(l.name);
        return cls !== undefined && cls !== "roof_access";
      })
      .flatMap((l) => l.tiles);

  // Already reachable on foot? Then it needs nothing from us.
  if (waysInto(extraction).length > 0) return false;

  // A dangling transition tile: one whose coordinate no *other* level answers, so
  // it currently leads nowhere at all.
  const donor = map.levels
    .filter((l) => l.name !== extraction)
    .flatMap((l) => waysInto(l.name).map((t) => ({ l, t })))
    .find(({ l, t }) =>
      map.levels.every(
        (o) => o.name === l.name || !waysInto(o.name).some((u) => u.x === t.x && u.y === t.y),
      ),
    );
  if (!donor) return false;

  const spot = spreadAround({ x: donor.t.x, y: donor.t.y }, 1, 0, standableIn(level))[0];
  if (!spot) return false;

  // The arrival end is real art the player can see and read as a way out; the
  // donor end already has its own, so it only needs the link declared.
  const proto = protoTile(map, "stairs") ?? donor.t;
  ensureLayer(level, "stairs").tiles.push({ ...proto, x: spot.x, y: spot.y, ref: "ladder9" });
  ensureLayer(donor.l, "stairs").tiles.push(marker("hatch9", donor.t.x, donor.t.y));
  return true;
}

/**
 * Wire an authored VENT-4 arena into the boss's anchors.
 *
 * Returns whether the arena is actually fightable — which needs, at minimum, a
 * turbine to fight and sub-stations to depressurise. Without those the caller
 * reports no VENT-4 rather than an objective the player cannot complete.
 */
export function adoptVentCore(level: GameLevel): boolean {
  // The turbine the arena is built around: v0.2 authored one chassis on a board
  // called `VENT-4`, v0.4 authors a pair of turbines on `vents`. Two turbines
  // have one centre between them, which is the hub either way.
  const turbines = peek(level, "VENT-4", CHASSIS_REF).concat(peek(level, "vents", TURBINE_REF));
  if (turbines.length === 0) return false;
  const hub = centroid(turbines);
  const open = standableIn(level);

  // Sub-stations move off the art board so the bake stops painting them: each
  // becomes a PressureSubStation that draws its own sprite. v0.4 gives them a
  // board of their own and calls them pressure capacitors.
  fillIfEmpty(level, "substations", () => [
    ...takeFrom(level, "energy", SUBSTATION_REF),
    ...takeFrom(level, CAPACITOR_BOARD, () => true),
  ]);
  if (tilesOn(level, "substations").length === 0) return false;

  // The turbine and its steam stay art; these are frameless markers pointing at
  // them, so the boss can find them without drawing them twice. v0.4 authors no
  // steam art at all, so the jets ring the hub instead — an empty `steam` board
  // would otherwise fall through to constants picked for a 40×45 arena.
  fillIfEmpty(level, "vent_hub", () => markers("vent_hub", [hub]));
  fillIfEmpty(level, "steam", () => {
    const authored = peek(level, "VENT-4", STEAM_REF).map((t) => ({ x: t.x, y: t.y }));
    return markers("steam", authored.length > 0 ? authored : spreadAround(hub, 4, 5, open));
  });

  // Columns are grip anchors *and* sight breakers, so they have to be solid:
  // borrow the arena's own interior walls, nearest the turbine first.
  fillIfEmpty(level, "columns", () => {
    const walls = (level.layers.find((l) => l.name === "walls")?.tiles ?? [])
      .filter((t) => t.x > 5 && t.y > 5 && t.x < level.width - 5 && t.y < level.height - 5)
      .map((t) => ({ x: t.x, y: t.y }))
      .sort(
        (a, b) =>
          (a.x - hub.x) ** 2 + (a.y - hub.y) ** 2 - ((b.x - hub.x) ** 2 + (b.y - hub.y) ** 2),
      );
    return markers("column", walls.slice(0, 8));
  });

  // Pitons ring the turbine far enough out that riding the vacuum is a commitment;
  // drips sit closer, where the heat is worth zeroing.
  fillIfEmpty(level, "pitons", () => markers("piton", spreadAround(hub, 4, 9, open, Math.PI / 4)));
  fillIfEmpty(level, "drips", () => markers("drip", spreadAround(hub, 3, 5, open)));
  fillIfEmpty(level, "grates", () => markers("grate", spreadAround(hub, 12, 7, open)));

  return true;
}

/**
 * Wire an authored rooftop relay into the transmission encounter.
 *
 * Returns whether the roof can actually be completed: a dish to aim and at least
 * one pedestal to calibrate from.
 */
export function adoptRoofArray(map: GameMap, level: GameLevel): boolean {
  // `uplink` is the engine's name for the dish's board; v0.4 files it on
  // `extraction`, which is also how the level declares itself the destination.
  const dishTile = tilesOn(level, "uplink")[0] ?? tilesOn(level, "extraction")[0];
  if (!dishTile) return false;
  const dish = { x: dishTile.x, y: dishTile.y };
  const open = standableIn(level);

  // The authored pedestals are typed `LOG_CACHE` (v0.2) or `CALIBRATION` (v0.4).
  // Either way, left on `terminals` they would be hackable caches on top of being
  // hold fixtures — and count against the cache tally the objectives read. Moving
  // them off settles both. v0.4 names them `terminal11`/`12` rather than anything
  // matching the pedestal ref, so the component is what identifies them.
  fillIfEmpty(level, "relay_pedestals", () =>
    takeFrom(
      level,
      "terminals",
      (t) => PEDESTAL_REF.test(t.ref) || terminalType(t) === "calibration",
    ),
  );
  const pedestals = tilesOn(level, "relay_pedestals");
  if (pedestals.length === 0) return false;

  fillIfEmpty(level, "relay_dish", () => markers("relay_dish", [dish]));

  // The feed is a hold fixture like the pedestals, so it needs a real sprite
  // rather than a marker — clone one of theirs and stand it beside the dish.
  fillIfEmpty(level, "relay_feed", () => {
    const proto = pedestals[0] ?? protoTile(map, "terminals");
    if (!proto) throw new MissingProto('no pedestal to clone for "relay_feed"');
    const spot = spreadAround(dish, 1, 3, open)[0];
    return spot ? [{ ...proto, x: spot.x, y: spot.y }] : [];
  });

  // Guards the author placed are where a siege comes from — that is what a lone
  // enforcer standing on an open roof is for. v0.2 put them on `entities`; v0.4
  // splits them across a spawn board and two rail mounts. Markers only: the tiles
  // stay where they are and still spawn their own sentry.
  fillIfEmpty(level, "siege_mouths", () =>
    markers(
      "siege_mouth",
      ["entities", "enforcer_spawn", "enforcer_rail_A", "enforcer_rail_B"]
        .flatMap((b) => tilesOn(level, b))
        .map((t) => ({ x: t.x, y: t.y })),
    ),
  );
  fillIfEmpty(level, "searchlights", () =>
    markers("searchlight", spreadAround(dish, 3, 11, open, Math.PI / 6)),
  );

  return true;
}

/**
 * Wire an authored alignment vault into the Core encounter.
 *
 * v0.4 draws the vault as a whole level (`main2vault`) rather than leaving it to
 * be grafted into a corner of the extraction deck: EIRA-7 in a glass vitrine at
 * the centre, four correction terminals at the compass points around her, and
 * eight server racks outside those again.
 *
 * Returns whether the Core is actually fightable — a core to stand in front of
 * and at least one node to desynchronise.
 */
export function adoptAlignmentVault(level: GameLevel): boolean {
  const avatar = peek(level, "EIRA-7", AVATAR_REF)[0];
  if (!avatar) return false;

  // The avatar *is* the core's art, so it moves rather than being marked: it is
  // the one tile `BossCore` draws its glow over, and `vault_core` is baked like
  // any other board.
  fillIfEmpty(level, "vault_core", () => takeFrom(level, "EIRA-7", AVATAR_REF));
  const core = tilesOn(level, "vault_core")[0];
  if (!core) return false;

  // The four correction terminals move off `terminals`, both because each becomes
  // a HoldFixture that draws the tile itself and because three of the four are
  // left with an empty `type` field, which the export's schema defaults to
  // LOG_CACHE — they would otherwise read as log caches standing in a ring.
  fillIfEmpty(level, "vault_nodes", () =>
    takeFrom(level, "terminals", (t) => t.components.some((c) => c.type === "terminal")),
  );
  if (tilesOn(level, "vault_nodes").length === 0) return false;

  // Racks are copied, not moved: they are the level's cover as well as the Shared
  // Field's witnesses, and taking them off `cover` would cost the room the thing
  // you hide behind. `vault_racks` is read for positions only, so markers do.
  fillIfEmpty(level, "vault_racks", () =>
    markers(
      "vault_rack",
      tilesOn(level, "cover").map((t) => ({ x: t.x, y: t.y })),
    ),
  );

  return true;
}
