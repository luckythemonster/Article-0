import { lightStatsFor } from "../systems/EntityStats";
import { ensureLayer, marker, spreadAround, standableIn, type TilePos } from "./generate";
import type { ComponentData, GameLevel, GameMap, GameTile } from "./types";

/**
 * Lighting the engine derives, so a level doesn't have to be lit by hand.
 *
 * ### Why this exists
 *
 * Light used to come from exactly one place: a tile on a `light_sources` board.
 * `src/ui/Lighting.ts` and `src/systems/DetectionSystem.ts` both walk that board
 * and build one light per tile on it, so every lit spot on every deck was a spot
 * somebody placed. NW-SMAC-01 pays for that in the obvious way — **127 hand-placed
 * light tiles**, fifty of them `light_overhead1` on `main1` alone — and in the less
 * obvious way: four of its nine levels have no `light_sources` board at all, and
 * darkness here is *opaque*, so those four are pitch black and crossable only by
 * flashlight.
 *
 * Between "place fifty lamps" and "the level is unplayable" there was no third
 * option. This is the third option.
 *
 * ### What it derives
 *
 * The level is cut into **zones** — fixed {@link ZONE_TILES}-square blocks — and
 * each zone that has floor in it gets *one* light, at its centre, nudged to
 * somewhere a player could actually stand. A 36×18 deck is 18 zones, so a level
 * nobody lit comes out with 18 fixtures instead of 50, and comes out lit.
 *
 * Zones group into **wings**, one per quadrant of the level. That is the whole
 * circuit topology, and it is deliberately coarse: a wing is what a breaker takes,
 * a zone is what a switch takes.
 *
 * ### Why the zone name is the tile's `ref`
 *
 * A breaker's `Target` names a tile-def `ref`, and `Lighting.setCircuit` /
 * `DetectionSystem.setCircuit` each darken every light whose `ref` matches. That is
 * already a circuit mechanic; it just had no circuits worth naming. Giving a derived
 * light its zone's name *as its ref* is therefore the entire wiring job — neither of
 * those two classes changes at all, and a zone is switchable the day it is derived.
 *
 * ### What it will not touch
 *
 * A zone already covered by a light somebody placed is left alone — see
 * {@link suppressedZones}. So `main1`'s fifty tuned overheads and `vent_core`'s wide
 * amber flickers still read exactly as authored, and the derived grid only fills in
 * where nobody has been. Hand placement stays the override, not the obligation.
 *
 * Pure — no Phaser — like everything else under `src/map/`, so this tests against the
 * real shipped map rather than a fixture built to flatter it.
 */

/**
 * Zone size, in tiles. The unit a light covers and a switch controls.
 *
 * Six is a room, roughly, on a map whose decks are 36×18: big enough that a level
 * gets a readable handful of zones rather than a lamp every other step, small
 * enough that killing one is a place going dark rather than a rounding error. It
 * is the single number that decides how this feels, and it is expected to move.
 */
export const ZONE_TILES = 6;

/**
 * Radius (tiles) of a derived light.
 *
 * A hair over the zone's half-diagonal (`6/2 * √2 ≈ 4.24`), so a zone is covered
 * corner to corner and neighbouring pools overlap slightly. Sized *down* from that
 * and the grid reads as a row of spotlights with dark seams between them, which is
 * the look this exists to avoid.
 *
 * Authored explicitly rather than left to `LIGHT_DEFAULTS.radius` (3.5) because the
 * number is a consequence of {@link ZONE_TILES} and should move when it does.
 */
export const DERIVED_RADIUS_TILES = 4.5;

/**
 * Marks a ref as something this module made.
 *
 * A double underscore cannot occur in an edplay tile-def ref — the editor's refs are
 * ordinary identifiers like `light_overhead1` — so a derived circuit can never
 * collide with a `Target` somebody authored, and a re-run can recognise its own work.
 */
const DERIVED = "__";

/**
 * Reach of the emergency light a switched-off zone falls back to, in tiles.
 *
 * The art's own number: `light_switch.aseprite` labels its `emergency_light` layer
 * `light_source {radius=4}` across exactly the frames the `OFF` tag covers. Smaller
 * than {@link DERIVED_RADIUS_TILES}, and mounted on the wall rather than hung over
 * the middle of the room, so a room on emergency power reads as a room you can cross
 * rather than a room that is lit.
 */
export const EMERGENCY_RADIUS_TILES = 4;

/**
 * How much easier a guard finds you in emergency light. Full lighting is 1.6.
 *
 * The value `vent_core`'s amber flickers were authored with, and the reason the wall
 * switch is worth walking into a room for: dim red is better cover than an overhead
 * but worse than the dark a breaker buys. If it were 1.6 the switch would give
 * visibility back for nothing; at 0.4 it would be as good as crouching behind a
 * crate, and the breaker would have no job left.
 */
export const EMERGENCY_MULTIPLIER = 0.75;

/**
 * How bright the emergency lamp burns, against a full fixture's 1.
 *
 * Measured rather than guessed. At full brightness the lamp was *indistinguishable*
 * from the overhead it replaces — same lit area over the zone (0.42 of it either
 * way) and the same mean brightness (0.376 against 0.381) — because a radius-4 lamp
 * on the wall reaches almost exactly as far as the radius-4.5 overhead in the
 * middle. Shrinking it instead would have made it stop reaching the doorway, which
 * is the one part of a dark room you need to find. Dim is a brightness question.
 */
export const EMERGENCY_BRIGHTNESS = 0.45;

/**
 * The circuit of a zone's emergency light.
 *
 * A ref of its own rather than a flag on the zone's light, because `Lighting` and
 * `DetectionSystem` switch on refs and nothing else — the same reason a zone is
 * named at all. It is driven as the zone's *complement* while the circuit has power,
 * which is `PowerControl`'s job, not this module's.
 */
export function emergencyRef(zone: string): string {
  return `${zone}${DERIVED}emergency`;
}

/** The zone an {@link emergencyRef} belongs to, or the ref itself if it is not one. */
export function zoneOfEmergency(ref: string): string {
  const cut = ref.lastIndexOf(`${DERIVED}emergency`);
  return cut === -1 ? ref : ref.slice(0, cut);
}

/**
 * Footprint of a switch plate, in tiles.
 *
 * A quarter, and that is arithmetic rather than taste: the house pixel density is one
 * art pixel per world pixel, a tile is 32 world pixels, and the plate's art is 8x8.
 * Drawn at the breaker's half-tile instead, every pixel of the switch would be twice
 * the size of every pixel of the cabinet beside it on the same wall.
 *
 * Written onto the tile rather than kept as a constant inside `LightSwitch`, so the
 * drawn size stays answerable from the map — which is how `Breaker` reads its own
 * cabinet's. It is the second of a hand-written pair with `displayTiles` on the
 * `light-switch` sprite spec in `src/entities/EntitySprites.ts`; a test in
 * `src/render/pixelScale.test.ts` holds the two together.
 */
export const SWITCH_TILES = 0.25;

/** The board derived switches are filed on. */
export const LIGHT_SWITCH_BOARD = "light_switches";

/**
 * A board whose mere presence opts a level out of derived lighting entirely.
 *
 * Overhead lighting assumes an overhead. The rooftop relay deck has none — it is
 * outdoors at night, and its whole pitch is crossing three sweeping searchlights in
 * the dark (`docs/DESIGN_NOTES.md`, "Searchlights and boss beams keep their cones").
 * Hanging sixteen lamps from its sky would quietly delete that level's difficulty.
 *
 * Empty is enough; nothing reads the tiles. `src/map/RoofArrayLevel.ts` files one on
 * the roof it appends or adopts, and a map author can file one on any deck that is
 * meant to stay dark.
 */
export const UNLIT_BOARD = "unlit";

/** The component a derived switch carries, read by `lightSwitchStatsFor`. */
export const LIGHT_SWITCH_COMPONENT = "light_switch";

/** The circuit a zone's light belongs to. */
export function zoneRef(level: string, col: number, row: number): string {
  return `${level}${DERIVED}z${col}_${row}`;
}

/** The circuit a breaker throws: one quadrant's worth of zones. */
export function wingRef(level: string, col: number, row: number): string {
  return `${level}${DERIVED}wing_${col}${row}`;
}

/** True for a circuit this module derived, as opposed to a ref the map authored. */
export function isDerivedCircuit(ref: string): boolean {
  return ref.includes(DERIVED);
}

/**
 * Derives lighting for every level on the map that needs it.
 *
 * Idempotent: the parsed map is registry-cached and boot must not be able to light
 * it twice. A level that already carries derived tiles is skipped outright.
 *
 * Runs *last* in the boot pipeline, after every act the engine grafts on, so it
 * lights the geometry the player will actually walk rather than a level that is
 * about to grow a vault.
 */
export function autoLight(map: GameMap): void {
  for (const level of map.levels) autoLightLevel(level);
}

function autoLightLevel(level: GameLevel): void {
  // A deck that is meant to stay dark says so, and is not argued with.
  if (level.layers.some((l) => l.name === UNLIT_BOARD)) return;

  const lights = ensureLayer(level, "light_sources");
  // Already done. Re-deriving would double every pool and every switch.
  if (lights.tiles.some((t) => isDerivedCircuit(t.ref))) return;

  const cols = Math.ceil(level.width / ZONE_TILES);
  const rows = Math.ceil(level.height / ZONE_TILES);
  if (cols === 0 || rows === 0) return;

  const standable = standableIn(level);
  const suppressed = suppressedZones(level, cols, rows);
  const switches = ensureLayer(level, LIGHT_SWITCH_BOARD);
  const circuits: Record<string, string[]> = level.circuits ?? {};

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (suppressed.has(key(col, row))) continue;
      // A zone of solid rock, or off the end of a level whose size isn't a
      // multiple of the zone: no floor, so nothing to light and no circuit to name.
      const at = zoneAnchor(level, standable, col, row);
      if (!at) continue;

      const zone = zoneRef(level.name, col, row);
      lights.tiles.push(derivedLight(zone, at));

      const wing = wingRef(level.name, col < cols / 2 ? 0 : 1, row < rows / 2 ? 0 : 1);
      (circuits[wing] ??= []).push(zone);

      // A plate needs a wall to sit on. A zone with none — the middle of an open
      // deck — simply has no switch, and is thrown from its wing's breaker instead.
      const plate = switchAnchor(level, standable, col, row);
      if (plate) {
        switches.tiles.push(derivedSwitch(zone, plate));
        // The emergency lamp is part of the *plate*, which is where the art puts it,
        // so it goes where the plate went and only where there is a plate. A zone
        // nobody can switch off locally can only be darkened by a breaker, and a
        // breaker is supposed to mean darkness — so it gets no fallback light.
        //
        // Deliberately not filed into `circuits`: that map is the zones a breaker
        // feeds, and this one is derived from its zone rather than thrown on its own.
        lights.tiles.push(derivedEmergency(zone, plate));
      }
    }
  }

  if (Object.keys(circuits).length > 0) level.circuits = circuits;
}

/**
 * Zones a hand-placed light already covers, which this leaves alone.
 *
 * Measured against each authored fixture's *own* reach — asked of `lightStatsFor`,
 * which is the same answer `Lighting` and `DetectionSystem` get. That is the point:
 * suppression has to match what the engine will actually *draw*, not what the export
 * says on paper. (On NW-SMAC-01 those differ, and not in this module's favour: the
 * map writes `radius` / `detectionMultiplier` where `lightStatsFor` reads `Radius` /
 * `DetectionMultiplier`, so every authored light on the shipped map silently runs at
 * the engine default. Reading the raw field here would suppress zones that are not
 * in fact lit.)
 *
 * A tile this module derived on an earlier pass is not "authored" and is not
 * consulted — but `autoLightLevel` has already returned in that case.
 */
function suppressedZones(level: GameLevel, cols: number, rows: number): Set<string> {
  const out = new Set<string>();
  const authored = level.layers.find((l) => l.name === "light_sources")?.tiles ?? [];
  if (authored.length === 0) return out;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * ZONE_TILES + (ZONE_TILES - 1) / 2;
      const cy = row * ZONE_TILES + (ZONE_TILES - 1) / 2;
      for (const t of authored) {
        const reach = lightStatsFor(t.components).radius;
        const dx = t.x - cx;
        const dy = t.y - cy;
        if (dx * dx + dy * dy <= reach * reach) {
          out.add(key(col, row));
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Where a zone's light hangs: its centre, or the nearest spot a player could stand.
 *
 * `spreadAround` with one point at zero radius is the existing nudge-to-open-cell —
 * the same call `openCentre` makes — so a light never ends up inside the wall that
 * happens to run through the middle of its zone. Returns undefined for a zone with
 * no reachable floor within the spiral's reach, which is the signal to skip it.
 */
function zoneAnchor(
  level: GameLevel,
  standable: (p: TilePos) => boolean,
  col: number,
  row: number,
): TilePos | undefined {
  const ideal = {
    x: Math.min(level.width - 1, Math.round(col * ZONE_TILES + (ZONE_TILES - 1) / 2)),
    y: Math.min(level.height - 1, Math.round(row * ZONE_TILES + (ZONE_TILES - 1) / 2)),
  };
  const found = spreadAround(ideal, 1, 0, standable)[0];
  // The spiral is allowed to wander out of the zone to find floor; a light that
  // landed in the neighbouring room would be lighting somebody else's circuit.
  if (!found || zoneOf(found) !== `${col},${row}`) return undefined;
  return found;
}

/**
 * Where a zone's switch goes: standable floor with a wall next to it, nearest the
 * centre. A plate is mounted on something.
 *
 * Walks the zone's own cells rather than spiralling, so the switch is always inside
 * the zone it throws — a plate in the next room would be a lie about what it does.
 */
function switchAnchor(
  level: GameLevel,
  standable: (p: TilePos) => boolean,
  col: number,
  row: number,
): TilePos | undefined {
  const cx = col * ZONE_TILES + (ZONE_TILES - 1) / 2;
  const cy = row * ZONE_TILES + (ZONE_TILES - 1) / 2;
  let best: TilePos | undefined;
  let bestD = Infinity;

  for (let y = row * ZONE_TILES; y < Math.min(level.height, (row + 1) * ZONE_TILES); y++) {
    for (let x = col * ZONE_TILES; x < Math.min(level.width, (col + 1) * ZONE_TILES); x++) {
      const p = { x, y };
      if (!standable(p)) continue;
      // Orthogonally against something solid. Diagonals don't count: a plate reads
      // as mounted on the wall it touches, and a corner touch doesn't look mounted.
      const mounted =
        !standable({ x: x - 1, y }) ||
        !standable({ x: x + 1, y }) ||
        !standable({ x, y: y - 1 }) ||
        !standable({ x, y: y + 1 });
      if (!mounted) continue;
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

/**
 * A derived fixture.
 *
 * A `marker` rather than a clone of some placed tile, and that is safe here in a way
 * it would not be for a wall: `light_overhead*` resolves to the editor's 1×1
 * transparent placeholder anyway, and `TileBake` skips a frameless tile — so a light
 * has no art to get wrong. What draws is the pool, and `Lighting` draws that.
 */
function derivedLight(zone: string, at: TilePos): GameTile {
  return { ...marker(zone, at.x, at.y), components: lightComponent() };
}

/** The lamp a switched-off zone falls back to — see {@link EMERGENCY_RADIUS_TILES}. */
function derivedEmergency(zone: string, at: TilePos): GameTile {
  return {
    ...marker(emergencyRef(zone), at.x, at.y),
    components: [
      {
        type: "light_source",
        values: {
          Radius: String(EMERGENCY_RADIUS_TILES),
          DetectionMultiplier: String(EMERGENCY_MULTIPLIER),
          Brightness: String(EMERGENCY_BRIGHTNESS),
          // Guttering, because the art is: `light_switch.aseprite` labels the
          // emergency frames `BLINK` and `FLASH`, and a steady fallback lamp would
          // be the one part of that plate the world underneath it contradicts.
          type: "FLICKER",
        },
      },
    ],
  };
}

function derivedSwitch(zone: string, at: TilePos): GameTile {
  return {
    ...marker(`${zone}_switch`, at.x, at.y),
    // The plate's footprint, which `LightSwitch` draws to the way `Breaker` draws to
    // its cabinet's. It has to live on the *tile* rather than as a constant in the
    // entity: that is what keeps it answerable from the map, and a constant is
    // exactly what drifted from the sprite spec the first time round.
    //
    colSpan: SWITCH_TILES,
    rowSpan: SWITCH_TILES,
    entityType: LIGHT_SWITCH_COMPONENT,
    components: [{ type: LIGHT_SWITCH_COMPONENT, values: { Target: zone, state: "CLOSED" } }],
  };
}

/**
 * The light's tuning, written out rather than left to the defaults.
 *
 * Values are strings because that is what the loader produces for every authored
 * component, and `EntityStats.num` parses them the same way either way. Note it
 * treats `0` as unset — never emit one here.
 */
function lightComponent(): ComponentData[] {
  return [
    {
      type: "light_source",
      values: { Radius: String(DERIVED_RADIUS_TILES), type: "STATIC" },
    },
  ];
}

const key = (col: number, row: number): string => `${col},${row}`;

const zoneOf = (p: TilePos): string =>
  key(Math.floor(p.x / ZONE_TILES), Math.floor(p.y / ZONE_TILES));
