import { doorIsLocked, doorStatsFor, restrictedStatsFor } from "../systems/EntityStats";
import {
  emptyClearanceMap,
  NO_CLEARANCE,
  requireClearance,
  type ClearanceMap,
} from "../systems/Clearance";
import { footprintCells } from "./footprint";
import { deckCells, deckPlaneAt } from "./planes";
import { blockingLayerNames, type GameLevel, type GameMap, type GameTile } from "./types";

/**
 * Ground the facility does not admit staff to, derived so a level doesn't have to
 * declare it by hand.
 *
 * ### Why this exists
 *
 * Restriction was expressed exactly one way before this: a door with a numeric `key`,
 * which is a *threshold* rather than a place. Walk round it, or through it behind
 * somebody, and the far side reads the same as the corridor — the map had no way to say
 * "this room is not yours" at all. Meanwhile the prologue roster had already said it:
 * *"STAFF clearance admits the holder to every deck on which the holder has work. It
 * does not admit the holder to a terminal, a rack, or a vault."*
 *
 * `public/assets/edplay.json` is the tile editor's export, committed verbatim and never
 * hand-edited, so the shipped decks cannot simply be annotated. This derives their
 * restricted ground from what they already say about themselves, exactly as
 * {@link ./AutoLight} derives their lighting — and for the same reason: between "annotate
 * nine levels by hand" and "the mechanic never appears" there was no third option.
 *
 * ### The three sources
 *
 * **Declared** — a {@link RESTRICTED_BOARD} board, whose tiles carry a `restricted`
 * component naming a clearance. Nothing on the shipped map authors one; this is the path
 * a *future* export uses to state its areas rather than have them inferred. A level that
 * declares one is not derived at all — see {@link autoClearanceLevel} for why.
 *
 * **Sealed** — the space behind a door that already names a clearance. An unbounded
 * flood fill, with every door treated as a wall so it cannot leak out through some other
 * doorway, and the smaller of the two sides taken as "behind".
 *
 * **Posted** — the ground around a terminal or a silicate rack, which is what the roster
 * sentence actually names. A flood fill bounded to {@link POSTED_RADIUS_TILES} steps.
 *
 * ### Why posted areas are a bounded fill and not the enclosing room
 *
 * "The room the terminal stands in" was the first thing tried and it does not work on
 * this map. Measured against the real export, a terminal's enclosing region is **48% to
 * 99% of its deck** — these levels are open-plan, and there is no small room around the
 * equipment to find. Whole decks reading as restricted is a worse outcome than none.
 *
 * Bounding the fill instead does two jobs with one mechanism. It cannot leak a deck,
 * because the step limit caps it structurally rather than by a threshold somebody has to
 * keep tuned. And because walls still stop it, it clips to the room it starts in instead
 * of bleeding a disc through the wall into the corridor behind — which a plain radius
 * check would do, and which would restrict ground the player has no way to associate
 * with the terminal they cannot see.
 *
 * ### What it will not do
 *
 * It will not restrict ground it cannot justify. Every guard here fails *closed*: a fill
 * that comes back too small ({@link MIN_SEALED_TILES}) or too large
 * ({@link MAX_SEALED_FRACTION}) is discarded rather than trimmed, and a door that turns
 * out to separate nothing is skipped. The five elevator-car doors on the shipped map are
 * dropped by the size floor alone, without this file needing to know what an elevator is.
 *
 * Pure — no Phaser — like everything else under `src/map/`, so it tests against the real
 * shipped map rather than a fixture built to flatter it.
 */

/**
 * The board a map declares its own restricted areas on.
 *
 * `snake_case` per `docs/NAMING.md`, and plural because one board holds every area on
 * the level rather than one board per area — unlike an entity board, these tiles are not
 * one thing's route, they are a stencil.
 */
export const RESTRICTED_BOARD = "restricted_areas";

/** The component a declared tile carries, naming the clearance it demands. */
export const RESTRICTED_COMPONENT = "restricted";

/**
 * How far a terminal or rack's restricted ground reaches, in tiles.
 *
 * Four is close enough that the fixture is obviously the reason — you can see what you
 * are standing next to — and short enough that a deck full of them still leaves lanes
 * through. It also gives the player a tile or two inside the boundary to notice the
 * readout change before they are at the equipment, which a tighter apron does not.
 *
 * It is a **step count through open floor, not a radius**, measured from the fixture
 * itself: four steps round a corner is four tiles of walking, and ground on the far
 * side of a wall is not four steps away however close it looks. That distinction is
 * the whole reason this is a bounded fill rather than a distance check.
 *
 * It is the single number that decides how this feels, and it is expected to move —
 * `AutoClearance.test.ts` pins the per-deck coverage it produces, so moving it has to
 * be a decision rather than a side effect.
 */
export const POSTED_RADIUS_TILES = 4;

/**
 * The clearance a posted area demands.
 *
 * Deliberately the same number the shipped map's own locked doors use, so **one
 * credential answers the whole facility**: the card that opens the six doors is the card
 * that clears the terminals. Splitting them would mean two collectibles to place and a
 * player who found one and still could not tell why the readout was still amber.
 */
export const POSTED_CLEARANCE = 2;

/**
 * Smallest sealed region worth calling an area, in tiles.
 *
 * Four, because the thing this is really rejecting is a lift car. Five of the six locked
 * doors on the shipped map are elevator doors sealing a **single tile**, and an area you
 * cannot stand in without already being inside the thing is not a place. A floor rejects
 * them without this file hardcoding a board name, so it keeps working when the next map
 * calls its lift something else — and it still admits a genuinely small locked cupboard.
 */
export const MIN_SEALED_TILES = 4;

/**
 * Largest sealed region worth calling an area, as a fraction of the deck's open ground.
 *
 * The backstop for a fill that leaked — a door left off the `doors` board, a wall with a
 * gap in it — where the "smaller side" is still most of the level. A third of a deck is
 * already a very large room, and past that the likeliest explanation is that the
 * derivation is wrong rather than that the author sealed half the floor.
 */
export const MAX_SEALED_FRACTION = 0.35;

/** Component types whose ground is posted, per the roster: a terminal, or a rack. */
const POSTED_COMPONENTS = ["terminal", "silicate"];

/** Derives every level's restricted ground, in place. */
export function autoClearance(map: GameMap): void {
  for (const level of map.levels) autoClearanceLevel(level, map.tileWidth);
}

/**
 * Derives one level's restricted ground.
 *
 * **A declared board suppresses derivation entirely**, rather than merging with it. The
 * two would otherwise mix on the same deck and leave "why is this room restricted?"
 * unanswerable from the map — the author would be looking at ground they did not mark
 * and could not unmark. Hand placement is the override, not an addition, which is the
 * same posture `AutoLight.suppressedZones` takes towards a hand-placed light.
 */
export function autoClearanceLevel(level: GameLevel, tileSize: number): void {
  const declared = tilesOn(level, RESTRICTED_BOARD);
  const map = emptyClearanceMap(level.width, level.height);

  if (declared.length > 0) {
    applyDeclared(level, map, declared, tileSize);
  } else {
    const world = buildWorld(level, tileSize);
    applySealed(world, map);
    applyPosted(world, map);
  }

  level.restricted = map;
}

/**
 * A level flattened into what a flood fill needs: which cells stop it, which plane each
 * cell belongs to, and how much open ground there is to measure a region against.
 */
interface FillWorld {
  level: GameLevel;
  tileSize: number;
  width: number;
  height: number;
  /** Cells a fill cannot enter: anything solid, plus every door. */
  wall: Uint8Array;
  /** The upper-deck mask, so a fill stays on the surface it started from. */
  deck: Uint8Array;
  /** Open cells per plane, for {@link MAX_SEALED_FRACTION}. */
  openOn: (plane: number) => number;
}

function buildWorld(level: GameLevel, tileSize: number): FillWorld {
  const { width, height } = level;
  const wall = new Uint8Array(width * height);
  const blocking = new Set(blockingLayerNames(level));

  for (const layer of level.layers) {
    const solid = blocking.has(layer.name);
    for (const tile of layer.tiles) {
      // Every door is a wall here, locked or not, and that is the whole trick that
      // makes a fill stay in one room: a fill seeded inside a room with two doors
      // would otherwise walk straight out of the one nobody locked.
      const isDoor = has(tile, "door");
      if (!solid && !isDoor) continue;
      for (const cell of footprintCells(tile, tileSize)) {
        if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue;
        wall[cell.y * width + cell.x] = 1;
      }
    }
  }

  const deck = deckCells(level, tileSize);
  const open = [0, 0];
  for (let i = 0; i < wall.length; i++) {
    if (wall[i] === 1) continue;
    open[deck[i] === 1 ? 1 : 0]++;
  }

  return {
    level,
    tileSize,
    width,
    height,
    wall,
    deck,
    openOn: (plane) => open[plane === 1 ? 1 : 0],
  };
}

/**
 * Flood fill from `seeds`, staying on `plane` and stopping at walls.
 *
 * `maxSteps` bounds it by distance from the seeds — that is what separates a posted
 * apron from a sealed room, and it is the same fill either way rather than two
 * near-identical ones that could drift apart.
 *
 * Confined to one plane because a level's two walk surfaces are separate rooms that
 * happen to share coordinates (the rule `Sensing.canSense` already applies to sight):
 * without it, an apron round a terminal on a gantry would spill onto the floor below it,
 * which is ground the player cannot see the terminal from.
 */
function fill(
  world: FillWorld,
  seeds: readonly (readonly [number, number])[],
  plane: number,
  maxSteps = Infinity,
): Set<number> {
  const seen = new Set<number>();
  const queue: number[] = [];
  const depth: number[] = [];

  const passable = (i: number): boolean =>
    world.wall[i] !== 1 && (world.deck[i] === 1 ? 1 : 0) === plane;

  // Seeds carry their own starting depth, which is what lets a posted apron measure
  // its reach from the *fixture* rather than from the floor tile beside it. A terminal
  // usually stands in a solid cell, so its own tile is never walkable and the fill has
  // to start from its neighbours — but those neighbours are already one step away, and
  // seeding them at zero would quietly make every apron a tile wider than the constant
  // that names its size.
  for (const [seed, from] of seeds) {
    if (seen.has(seed) || !passable(seed)) continue;
    seen.add(seed);
    queue.push(seed);
    depth.push(from);
  }

  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const d = depth[head];
    if (d >= maxSteps) continue;
    const x = i % world.width;
    const y = (i - x) / world.width;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
      const ni = ny * world.width + nx;
      if (seen.has(ni) || !passable(ni)) continue;
      seen.add(ni);
      queue.push(ni);
      depth.push(d + 1);
    }
  }
  return seen;
}

/**
 * Four-connected, not eight. A fill that cut diagonally would slip between two walls
 * that meet at a corner — through a join the player has to walk around — and put
 * restricted ground on the far side of a wall nobody opened.
 */
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** A posted fixture's seeds: its own cell at no cost, its neighbours at one step. */
const SEED_OFFSETS: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  ...NEIGHBOURS.map(([dx, dy]) => [dx, dy, 1] as const),
];

/** Marks the ground sealed behind each door that names a clearance. */
function applySealed(world: FillWorld, map: ClearanceMap): void {
  // Keyed by the region's lowest cell index, so several locked doors into one room
  // derive one area rather than the same area several times.
  const claimed = new Map<number, number>();

  for (const door of doorsOn(world.level)) {
    const stats = doorStatsFor(door.components);
    // `key: 0` with `state: "LOCKED"` names no clearance and is sealed outright — no
    // card could ever answer it, and an area nothing can clear is a wall with extra
    // steps. `doorIsLocked` covers both cases, so the clearance check is the filter.
    if (!doorIsLocked(stats) || stats.key === NO_CLEARANCE) continue;

    const cells = footprintCells(door, world.tileSize);
    const plane = planeOf(world, door.x, door.y);
    const regions = regionsAround(world, cells, plane);

    // One region means the door separates nothing — there is another way round, and
    // sealing what you can already walk into would restrict the corridor as well.
    if (regions.length !== 2) continue;

    regions.sort((a, b) => a.size - b.size);
    const behind = regions[0];
    if (behind.size < MIN_SEALED_TILES) continue;
    if (behind.size > world.openOn(plane) * MAX_SEALED_FRACTION) continue;

    const key = Math.min(...behind);
    claimed.set(key, Math.max(claimed.get(key) ?? 0, stats.key));
    for (const i of behind) {
      const x = i % world.width;
      requireClearance(map, x, (i - x) / world.width, stats.key);
    }
  }

  // A room reached by two doors of different clearance is as restricted as its
  // strictest way in, which `requireClearance` already resolves by taking the higher.
}

/** The distinct open regions touching a fixture's footprint, on one plane. */
function regionsAround(
  world: FillWorld,
  cells: readonly { x: number; y: number }[],
  plane: number,
): Set<number>[] {
  const regions: Set<number>[] = [];
  for (const cell of cells) {
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
      const ni = ny * world.width + nx;
      if (regions.some((r) => r.has(ni))) continue;
      const region = fill(world, [[ni, 0]], plane);
      if (region.size > 0) regions.push(region);
    }
  }
  return regions;
}

/** Marks the ground around each terminal and silicate rack. */
function applyPosted(world: FillWorld, map: ClearanceMap): void {
  for (const tile of world.level.layers.flatMap((l) => l.tiles)) {
    if (!POSTED_COMPONENTS.some((type) => has(tile, type))) continue;

    // Seed the fixture's own cells *and* their neighbours: a terminal is usually
    // against a wall, so its own tile is solid and seeding only that would find
    // nothing at all. The neighbours come in one step out, so the apron reaches
    // exactly POSTED_RADIUS_TILES from the fixture either way.
    const plane = planeOf(world, tile.x, tile.y);
    const seeds: [number, number][] = [];
    for (const cell of footprintCells(tile, world.tileSize)) {
      for (const [dx, dy, step] of SEED_OFFSETS) {
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
        seeds.push([ny * world.width + nx, step]);
      }
    }

    for (const i of fill(world, seeds, plane, POSTED_RADIUS_TILES)) {
      const x = i % world.width;
      requireClearance(map, x, (i - x) / world.width, POSTED_CLEARANCE);
    }
  }
}

/** Marks exactly what the map declared, and nothing else. */
function applyDeclared(
  level: GameLevel,
  map: ClearanceMap,
  tiles: readonly GameTile[],
  tileSize: number,
): void {
  for (const tile of tiles) {
    const clearance = restrictedStatsFor(tile.components).clearance;
    if (clearance <= NO_CLEARANCE) continue;
    for (const cell of footprintCells(tile, tileSize)) {
      requireClearance(map, cell.x, cell.y, clearance);
    }
  }
  void level;
}

const planeOf = (world: FillWorld, x: number, y: number): number =>
  deckPlaneAt(world.deck, world.level, x, y);

const has = (tile: GameTile, type: string): boolean =>
  tile.components.some((c) => c.type === type);

const tilesOn = (level: GameLevel, board: string): GameTile[] =>
  level.layers.find((l) => l.name === board)?.tiles ?? [];

const doorsOn = (level: GameLevel): GameTile[] =>
  level.layers.flatMap((l) => l.tiles).filter((t) => has(t, "door"));
