import type { GameMap } from "./types";
import {
  blockedTiles,
  cloneTile,
  ensureLayer,
  hasTileAt,
  MissingProto,
  mustProto,
  protoTile,
  type TilePos,
} from "./generate";

/**
 * The NW-SMAC-01 vault — Act III's fixtures, grafted into the extraction level's
 * southern hall at boot.
 *
 * `main2` ships as an arrival hall and nothing else: stairs down from `main1`, four
 * security cameras, some cover, no terminals and no guards. Reaching it *was* the win.
 * Now it is the Alignment Core's room, so the encounter's furniture is placed here the
 * same way the VENT-4 arena's is — by cloning tiles the map already uses.
 *
 * The southern hall is the one part of `main2` big enough for a boss: a flood fill from
 * the arrival stairs at (19,22)/(20,22) reaches 1,154 tiles, of which `x 2..37, y 24..40`
 * is open floor with nothing on it. The core sits at its centre, ringed at distance by
 * the four correction nodes, with the silicate racks pushed out to the walls so that
 * charging the Shared Field means crossing the auditing beams rather than hugging one
 * spot.
 *
 * ### Boards
 *
 * - `vault_core` — the core itself. Rendered as art (it is not in `ENTITY_LAYERS`), with
 *   `BossCore` drawing its own glow over the top, exactly as `Vent4Boss` does for the hub.
 * - `vault_nodes` — the four hold-to-desync correction nodes. **In `ENTITY_LAYERS`**,
 *   because each becomes a `HoldTarget` that renders the tile's sprite itself; leaving it
 *   out would draw every node twice.
 * - `vault_racks` — silicate racks, the Shared Field witness anchors. Art only.
 */

/** The Alignment Core, centre of the southern hall. */
export const VAULT_CORE: TilePos = { x: 20, y: 33 };

/** Correction nodes, ringing the core at a distance you have to cross beams to close. */
export const VAULT_NODES: TilePos[] = [
  { x: 14, y: 29 },
  { x: 26, y: 29 },
  { x: 14, y: 37 },
  { x: 26, y: 37 },
];

/**
 * Silicate racks — stand near one to charge the Shared Field.
 *
 * Pushed out past the nodes to the four compass points, not clustered by the core: the
 * merge that gets you through an audit has to cost a walk across the room, and every one
 * of these is further from the core than the nearest correction node is. A test asserts
 * that ordering, because it is the whole reason they are where they are — an earlier
 * layout put the north and south racks a step *inside* the node ring and quietly made
 * the encounter's counter free.
 *
 * (20,41) is deliberately skipped even though it fits: the roof ladder lands there.
 */
export const VAULT_RACKS: TilePos[] = [
  { x: 8, y: 33 },
  { x: 32, y: 33 },
  { x: 20, y: 25 },
  { x: 20, y: 42 },
];

/** Low cover in the hall's corners: the only respite from a room-wide sweep. */
export const VAULT_COVER: TilePos[] = [
  { x: 8, y: 26 },
  { x: 32, y: 26 },
  { x: 8, y: 40 },
  { x: 32, y: 40 },
];

/**
 * Injects the vault fixtures into `host`. Idempotent, and silent when it can't run.
 *
 * @param host the level the core stands in — `MapPlan.extractionLevel`. Null skips it.
 * @returns whether the vault is present afterwards.
 */
export function appendAlignmentVault(map: GameMap, host: string | null): boolean {
  if (host === null) return false;
  const hostLevel = map.levels.find((l) => l.name === host);
  if (!hostLevel) return false;

  const core = ensureLayer(hostLevel, "vault_core");
  if (hasTileAt(core, VAULT_CORE.x, VAULT_CORE.y)) return true;

  try {
    const blocked = blockedTiles(hostLevel);
    for (const p of [VAULT_CORE, ...VAULT_NODES, ...VAULT_RACKS, ...VAULT_COVER]) {
      if (blocked.has(`${p.x},${p.y}`)) {
        throw new MissingProto(`(${p.x},${p.y}) is blocked on "${host}"`);
      }
    }

    // `alignment_terminal` is a six-keyframe fixture the map places on main1's
    // light_sources board and the engine has never used for anything. It is the one
    // piece of art in the whole export that looks like an Alignment apparatus, so the
    // Core gets it; the fallback keeps a map without it from losing the act.
    const coreProto =
      protoTile(map, "light_sources", (r) => r === "alignment_terminal") ??
      mustProto(map, "terminals", (r) => r === "terminal0");
    const nodeProto = mustProto(map, "terminals", (r) => r === "terminal0");
    const rackProto = mustProto(map, "cover", (r) => r === "cover0");
    const lightProto = mustProto(map, "light_sources", (r) => r.includes("light_source"));

    core.tiles.push(cloneTile(coreProto, VAULT_CORE.x, VAULT_CORE.y));

    const nodes = ensureLayer(hostLevel, "vault_nodes");
    for (const n of VAULT_NODES) nodes.tiles.push(cloneTile(nodeProto, n.x, n.y));

    const racks = ensureLayer(hostLevel, "vault_racks");
    for (const r of VAULT_RACKS) racks.tiles.push(cloneTile(rackProto, r.x, r.y));

    // Cover and light join the boards the level already has, so they behave exactly as
    // authored cover and authored fixtures do — no special-casing downstream.
    const cover = ensureLayer(hostLevel, "cover");
    for (const c of VAULT_COVER) {
      if (!hasTileAt(cover, c.x, c.y)) cover.tiles.push(cloneTile(rackProto, c.x, c.y));
    }
    const lights = ensureLayer(hostLevel, "light_sources");
    if (!hasTileAt(lights, VAULT_CORE.x, VAULT_CORE.y)) {
      lights.tiles.push(cloneTile(lightProto, VAULT_CORE.x, VAULT_CORE.y));
    }
    return true;
  } catch (e) {
    if (e instanceof MissingProto) return false;
    throw e;
  }
}
