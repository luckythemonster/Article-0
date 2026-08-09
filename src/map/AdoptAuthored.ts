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

/** Tiles on `board` matching `ref`, removed from it and returned. */
function takeFrom(level: GameLevel, board: string, ref: RegExp): GameTile[] {
  const layer = level.layers.find((l) => l.name === board);
  if (!layer) return [];
  const taken = layer.tiles.filter((t) => ref.test(t.ref));
  if (taken.length > 0) layer.tiles = layer.tiles.filter((t) => !ref.test(t.ref));
  return taken;
}

/** Tiles on `board` matching `ref`, left where they are. */
function peek(level: GameLevel, board: string, ref: RegExp): GameTile[] {
  return (level.layers.find((l) => l.name === board)?.tiles ?? []).filter((t) => ref.test(t.ref));
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

  const walkTo = (name: string, board: string): GameTile[] =>
    map.levels.find((l) => l.name === name)?.layers.find((l) => l.name === board)?.tiles ?? [];

  // Already reachable on foot? Then it needs nothing from us. `roof_access` does
  // not count: the roof is downstream of extraction, not a way into it.
  const inbound = ["stairs", "maintenance_access"].flatMap((b) => walkTo(extraction, b));
  if (inbound.length > 0) return false;

  // A dangling stair: one whose coordinate no *other* level's `stairs` board
  // answers, so it currently falls back to some arbitrary neighbour.
  const donor = map.levels
    .filter((l) => l.name !== extraction)
    .flatMap((l) => l.layers.find((b) => b.name === "stairs")?.tiles.map((t) => ({ l, t })) ?? [])
    .find(({ l, t }) =>
      map.levels.every(
        (o) =>
          o.name === l.name ||
          !(o.layers.find((b) => b.name === "stairs")?.tiles ?? []).some(
            (u) => u.x === t.x && u.y === t.y,
          ),
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
  const chassis = peek(level, "VENT-4", CHASSIS_REF)[0];
  if (!chassis) return false;
  const hub = { x: chassis.x, y: chassis.y };
  const open = standableIn(level);

  // Sub-stations move off `energy` so the bake stops painting them: each becomes
  // a PressureSubStation that draws its own sprite.
  fillIfEmpty(level, "substations", () => takeFrom(level, "energy", SUBSTATION_REF));
  if ((level.layers.find((l) => l.name === "substations")?.tiles ?? []).length === 0) return false;

  // The turbine and its steam stay art on `VENT-4`; these are frameless markers
  // pointing at them, so the boss can find them without drawing them twice.
  fillIfEmpty(level, "vent_hub", () => markers("vent_hub", [hub]));
  fillIfEmpty(level, "steam", () =>
    markers(
      "steam",
      peek(level, "VENT-4", STEAM_REF).map((t) => ({ x: t.x, y: t.y })),
    ),
  );

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
  const dishTile = (level.layers.find((l) => l.name === "uplink")?.tiles ?? [])[0];
  if (!dishTile) return false;
  const dish = { x: dishTile.x, y: dishTile.y };
  const open = standableIn(level);

  // The authored pedestals are typed `LOG_CACHE`, which would make them hackable
  // caches on top of being hold fixtures — and count against the cache tally the
  // objectives read. Moving them off `terminals` settles both.
  fillIfEmpty(level, "relay_pedestals", () => takeFrom(level, "terminals", PEDESTAL_REF));
  const pedestals = level.layers.find((l) => l.name === "relay_pedestals")?.tiles ?? [];
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

  // Guards the author placed on `entities` are where a siege comes from — that is
  // what a lone enforcer standing on an open roof is for.
  fillIfEmpty(level, "siege_mouths", () =>
    markers(
      "siege_mouth",
      (level.layers.find((l) => l.name === "entities")?.tiles ?? []).map((t) => ({
        x: t.x,
        y: t.y,
      })),
    ),
  );
  fillIfEmpty(level, "searchlights", () =>
    markers("searchlight", spreadAround(dish, 3, 11, open, Math.PI / 6)),
  );

  return true;
}
