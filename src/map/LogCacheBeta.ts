import type { GameMap, GameTile } from "./types";
import {
  cloneTile,
  cloneWithComponent,
  ensureLayer,
  hasTileAt,
  MissingProto,
  mustProto,
  blockedTiles,
  type TilePos,
} from "./generate";

/**
 * Log-cache node BETA — the second half of EIRA-7's cache, injected into the
 * maintenance crawlspace at boot.
 *
 * The shipped map places all thirteen of its terminals on `main1`, every one of them
 * typed `LOG_CACHE`, and leaves the crawlspaces with nothing but floor, walls and
 * hatches. So the ALPHA/BETA split cannot be authoring — one node is *designated* out
 * of the terminals `main1` already has (`GameScene.designateLogCacheNodes`) and the
 * other is placed here, the same way the VENT-4 arena places its fixtures.
 *
 * ### Why it sits in a corridor rather than a room
 *
 * `duct2` looks roomy — a flood fill from its hatch says otherwise. Of its 1,800 floor
 * tiles exactly **34** are reachable: a single one-tile-wide run along `y = 34`, from
 * the hatch at x=2 to the hatch at x=35, with the vent core's injected hatch at x=18 in
 * between. Everything else on that level is sealed dead space behind walls. A node
 * placed in the big open chamber to the north would have been unreachable, and nothing
 * in the engine would have said so.
 *
 * That constraint turns out to be the better level design anyway: a crawlway with no
 * room to dodge is exactly where a pulsing beam is frightening, so the node sits
 * between two of them and every approach has to cross at least one.
 */

/** The BETA terminal, mid-corridor between the two beams. */
export const BETA_TERMINAL: TilePos = { x: 27, y: 34 };

/**
 * Trip beams flanking the node.
 *
 * `laser_red_flashing_horizontal0` is a 3×1 footprint, so each lies *along* the
 * crawlway rather than across it — three tiles of corridor you have to be clear of when
 * the pulse comes back on. Both are placed on the one `lasers` board and share the
 * beam cadence, so they blink together and there is one window to read rather than two.
 */
export const BETA_BEAMS: TilePos[] = [
  { x: 23, y: 34 },
  { x: 31, y: 34 },
];

/** The edplay `TerminalType` value that marks this terminal as node BETA. */
const BETA_TYPE = "LOG_CACHE_BETA";

/**
 * Injects node BETA into `host`. Idempotent, and silent when it can't run.
 *
 * @param host the crawlspace level to place it in — `MapPlan.ventCoreHost`, since the
 *   maintenance deck that can host the arena is the same one that can host this. Null
 *   skips generation.
 * @returns whether the node is present afterwards.
 */
export function appendLogCacheBeta(map: GameMap, host: string | null): boolean {
  if (host === null) return false;
  const hostLevel = map.levels.find((l) => l.name === host);
  if (!hostLevel) return false;

  const terminals = ensureLayer(hostLevel, "terminals");
  if (hasTileAt(terminals, BETA_TERMINAL.x, BETA_TERMINAL.y)) return true;

  try {
    // Every fixture has to land on floor the player can stand on. On the shipped map
    // these coordinates are the crawlway; on someone else's map they may well be solid,
    // and placing a mission-critical terminal inside a wall is worse than not placing it.
    const blocked = blockedTiles(hostLevel);
    for (const p of [BETA_TERMINAL, ...BETA_BEAMS]) {
      if (blocked.has(`${p.x},${p.y}`)) {
        throw new MissingProto(`(${p.x},${p.y}) is blocked on "${host}"`);
      }
    }

    const terminalProto = mustProto(map, "terminals", (r) => r === "terminal0");
    const beamProto = mustProto(map, "doors", (r) => r.toLowerCase().includes("laser"));

    terminals.tiles.push(
      cloneWithComponent(terminalProto, BETA_TERMINAL.x, BETA_TERMINAL.y, "terminal", {
        type: BETA_TYPE,
      }),
    );

    const lasers = ensureLayer(hostLevel, "lasers");
    for (const b of BETA_BEAMS) {
      if (!hasTileAt(lasers, b.x, b.y)) lasers.tiles.push(cloneTile(beamProto, b.x, b.y) as GameTile);
    }
    return true;
  } catch (e) {
    if (e instanceof MissingProto) return false; // map can't furnish it; skip
    throw e;
  }
}
