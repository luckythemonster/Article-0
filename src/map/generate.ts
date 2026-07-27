import type { ComponentData, GameLayer, GameLevel, GameMap, GameTile } from "./types";

/**
 * Shared machinery for the levels and fixtures the engine builds itself.
 *
 * Four things are generated at boot rather than authored in `edplay.json`: the VENT-4
 * arena, the crawlspace log-cache node, the NW-SMAC-01 vault, and the rooftop relay.
 * They all obey the same rule, and it is the important one:
 *
 * > **Every placed tile must be a clone of a tile already placed somewhere in the
 * > parsed map.**
 *
 * `SpriteAtlas` registers exactly the frames the parse found in use, so a generator
 * that invented a `SpriteFrame` would place a tile whose texture frame does not exist —
 * which fails at draw time, in the running game, not at boot. Cloning is what makes
 * that impossible by construction, and each generator's test asserts it.
 *
 * The second shared rule is that **a generator is allowed to decline**. These graft
 * onto authored levels and borrow their art, so a map that has no suitable host or no
 * prototype to clone should simply not get that act — not take the whole boot down.
 * {@link MissingProto} is the channel for that: throw it from anywhere inside a build
 * and let the entry point turn it into a `false` return.
 *
 * Pure — no Phaser — so every generator unit-tests against the real shipped map.
 */

/**
 * Thrown when the map can't supply a prototype tile a generator needs. Caught at each
 * generator's entry point, which skips generation rather than failing the boot.
 */
export class MissingProto extends Error {}

/** Finds a placed tile to clone, optionally filtered by level and ref. */
export function protoTile(
  map: GameMap,
  layerName: string,
  refMatch?: (ref: string) => boolean,
  levelName?: string,
): GameTile | undefined {
  for (const level of map.levels) {
    if (levelName !== undefined && level.name !== levelName) continue;
    const layer = level.layers.find((l) => l.name === layerName);
    if (!layer) continue;
    for (const t of layer.tiles) {
      if (!refMatch || refMatch(t.ref)) return t;
    }
  }
  return undefined;
}

/**
 * {@link protoTile}, but falling back to any tile on that board across the whole map
 * before giving up — a generator asking for a *specific* wall would rather have some
 * other wall than no level at all.
 */
export function mustProto(
  map: GameMap,
  layerName: string,
  refMatch?: (ref: string) => boolean,
  levelName?: string,
): GameTile {
  const t = protoTile(map, layerName, refMatch, levelName) ?? protoTile(map, layerName);
  if (!t) throw new MissingProto(`no proto tile found on any "${layerName}" board`);
  return t;
}

/** Clones a placed tile to a new coordinate (frame objects are shared, read-only). */
export function cloneTile(
  proto: GameTile,
  x: number,
  y: number,
  components?: ComponentData[],
): GameTile {
  return { ...proto, x, y, components: components ?? proto.components };
}

/**
 * Clones a tile, rewriting one component's fields.
 *
 * The way a generated fixture gets non-default behaviour — the vent-core chest's loot,
 * the crawlspace terminal's `LOG_CACHE_BETA` type — without hand-editing the map.
 */
export function cloneWithComponent(
  proto: GameTile,
  x: number,
  y: number,
  type: string,
  values: Record<string, string>,
): GameTile {
  return cloneTile(
    proto,
    x,
    y,
    proto.components.map((c) =>
      c.type === type ? { type: c.type, values: { ...c.values, ...values } } : c,
    ),
  );
}

/** A frameless marker tile (never painted; consumed by entity spawners). */
export function marker(ref: string, x: number, y: number): GameTile {
  return {
    x,
    y,
    handle: 0,
    ref,
    colSpan: 1,
    rowSpan: 1,
    offsetX: 0,
    offsetY: 0,
    components: [],
  };
}

export interface TilePos {
  x: number;
  y: number;
}

/**
 * Up to `limit` distinct framed floor tiles, for texture variety.
 *
 * Generated floors cycle through these deterministically rather than picking at random,
 * so a level looks the same on every boot and its test can assert positions.
 *
 * Takes a list of levels and a `keep` predicate because the two callers want opposite
 * things from the same walk: the vent core wants "this level's floor, minus the grate",
 * the roof wants "the pavement family, wherever in the map it was placed".
 */
export function floorPalette(
  levels: readonly (GameLevel | undefined)[],
  limit = 6,
  keep?: (ref: string) => boolean,
): GameTile[] {
  const out: GameTile[] = [];
  const seen = new Set<string>();
  for (const level of levels) {
    for (const t of level?.layers.find((l) => l.name === "floor")?.tiles ?? []) {
      if (!t.frame || seen.has(t.ref) || keep?.(t.ref) === false) continue;
      seen.add(t.ref);
      out.push(t);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Deterministic variant pick, so a generated floor is stable across boots. */
export function variantAt(palette: GameTile[], x: number, y: number): GameTile {
  return palette[(x * 7 + y * 13) % palette.length];
}

/** Fills a solid rectangle of floor from a palette, inclusive of both corners. */
export function fillFloor(
  palette: GameTile[],
  min: TilePos,
  max: TilePos,
): GameTile[] {
  const tiles: GameTile[] = [];
  for (let x = min.x; x <= max.x; x++) {
    for (let y = min.y; y <= max.y; y++) tiles.push(cloneTile(variantAt(palette, x, y), x, y));
  }
  return tiles;
}

/** Draws a closed rectangular wall ring on the given bounds, inclusive. */
export function wallRing(proto: GameTile, min: TilePos, max: TilePos): GameTile[] {
  const tiles: GameTile[] = [];
  for (let x = min.x; x <= max.x; x++) {
    tiles.push(cloneTile(proto, x, min.y));
    tiles.push(cloneTile(proto, x, max.y));
  }
  for (let y = min.y + 1; y < max.y; y++) {
    tiles.push(cloneTile(proto, min.x, y));
    tiles.push(cloneTile(proto, max.x, y));
  }
  return tiles;
}

/** Finds a board on a level, or creates and appends an empty one. */
export function ensureLayer(level: GameLevel, name: string): GameLayer {
  const existing = level.layers.find((l) => l.name === name);
  if (existing) return existing;
  const created: GameLayer = { name, tiles: [] };
  level.layers.push(created);
  return created;
}

/** True when a board already carries a tile at this coordinate. */
export function hasTileAt(layer: GameLayer, x: number, y: number): boolean {
  return layer.tiles.some((t) => t.x === x && t.y === y);
}

/**
 * Asserts every one of `at` is standable on `level`, declining generation if not.
 *
 * The coordinates each generator uses are hand-verified against the shipped map. On
 * someone else's map they may well be solid, and placing a mission-critical terminal
 * inside a wall is worse than not placing it — so this throws {@link MissingProto},
 * which the entry point turns into "this map doesn't get that act".
 */
// (declared above blockedTiles, which it uses)

/**
 * Every tile coordinate a level treats as solid, for placement assertions.
 *
 * Generators use this to keep fixtures off walls; the shipped map's crawlspaces are
 * mazes, so "somewhere in the middle of the room" is not a safe assumption.
 */
export function requireClear(level: GameLevel, host: string, at: readonly TilePos[]): void {
  const blocked = blockedTiles(level);
  for (const p of at) {
    if (blocked.has(`${p.x},${p.y}`)) {
      throw new MissingProto(`(${p.x},${p.y}) is blocked on "${host}"`);
    }
  }
}

export function blockedTiles(level: GameLevel, boards = ["walls"]): Set<string> {
  const out = new Set<string>();
  for (const name of boards) {
    for (const t of level.layers.find((l) => l.name === name)?.tiles ?? []) {
      out.add(`${t.x},${t.y}`);
    }
  }
  return out;
}
