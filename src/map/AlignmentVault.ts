import { adoptAlignmentVault } from "./AdoptAuthored";
import type { GameLevel, GameMap } from "./types";
import {
  cloneTile,
  ensureLayer,
  hasTileAt,
  MissingProto,
  mustProto,
  openCentre,
  protoTile,
  requireClear,
  spreadAround,
  standableIn,
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

interface VaultLayout {
  core: TilePos;
  nodes: TilePos[];
  racks: TilePos[];
  cover: TilePos[];
}

/**
 * Where the vault's furniture goes on this particular host.
 *
 * The constants above describe a 40×45 deck, and every one of them was picked by
 * hand against it. Somewhere else they land in walls or — worse, and the actual
 * bug on NW-SMAC-01, whose `main2` is only 36 tall — off the map entirely, where
 * `requireClear` used to wave them through because nothing had put a wall out at
 * y=42. So: use the authored layout when it genuinely fits, and otherwise rebuild
 * the same *shape* around whatever open room the host does have.
 *
 * The one invariant the derived layout must keep is the one the fixed layout was
 * arranged for: **every rack further from the core than the nearest node**, so
 * charging the Shared Field costs a walk across the auditing beams instead of
 * being free next to the thing you are auditing.
 */
function vaultLayout(level: GameLevel, host: string): VaultLayout {
  const authored: VaultLayout = {
    core: VAULT_CORE,
    nodes: VAULT_NODES,
    racks: VAULT_RACKS,
    cover: VAULT_COVER,
  };
  try {
    requireClear(level, host, [
      authored.core,
      ...authored.nodes,
      ...authored.racks,
      ...authored.cover,
    ]);
    return authored;
  } catch (e) {
    if (!(e instanceof MissingProto)) throw e;
  }

  const centre = openCentre(level);
  if (!centre) throw new MissingProto(`"${host}" has nowhere open to stand the core`);
  const open = standableIn(level);
  const ring = (count: number, radius: number, phase: number): TilePos[] =>
    spreadAround(centre, count, radius, open, phase);

  // NODE_RING < COVER_RING < RACK_RING preserves the ordering the fixed layout
  // encodes; the phases stagger the three rings so they don't stack up on one axis.
  const layout: VaultLayout = {
    core: centre,
    nodes: ring(4, NODE_RING, Math.PI / 4),
    cover: ring(4, COVER_RING, 0),
    racks: ring(4, RACK_RING, Math.PI / 4),
  };
  if (layout.nodes.length === 0 || layout.racks.length === 0) {
    throw new MissingProto(`"${host}" has no room to ring the core`);
  }
  return layout;
}

/** Radii, in tiles, of the three rings a derived vault is laid out on. */
const NODE_RING = 4;
const COVER_RING = 6;
const RACK_RING = 8;

/**
 * Injects the vault fixtures into `host`. Idempotent, and silent when it can't run.
 *
 * @param host the level the core stands in — `MapPlan.vaultHost`. Null skips it.
 * @returns whether the vault is present afterwards.
 */
export function appendAlignmentVault(map: GameMap, host: string | null): boolean {
  if (host === null) return false;
  const hostLevel = map.levels.find((l) => l.name === host);
  if (!hostLevel) return false;

  // A map that drew its own vault keeps it; we wire that one up instead. Same
  // rule the arena and the roof already work under — see `AdoptAuthored`.
  if ((hostLevel.layers.find((l) => l.name === "EIRA-7")?.tiles.length ?? 0) > 0) {
    return adoptAlignmentVault(hostLevel);
  }

  const core = ensureLayer(hostLevel, "vault_core");
  // Keyed on the board having anything at all rather than on our coordinate: a map that
  // placed its own core elsewhere has declared its intent, and shouldn't get a second.
  if (core.tiles.length > 0) return true;

  try {
    const { core: coreAt, nodes: nodesAt, racks: racksAt, cover: coverAt } = vaultLayout(
      hostLevel,
      host,
    );

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

    core.tiles.push(cloneTile(coreProto, coreAt.x, coreAt.y));

    const nodes = ensureLayer(hostLevel, "vault_nodes");
    for (const n of nodesAt) nodes.tiles.push(cloneTile(nodeProto, n.x, n.y));

    const racks = ensureLayer(hostLevel, "vault_racks");
    for (const r of racksAt) racks.tiles.push(cloneTile(rackProto, r.x, r.y));

    // Cover and light join the boards the level already has, so they behave exactly as
    // authored cover and authored fixtures do — no special-casing downstream.
    const cover = ensureLayer(hostLevel, "cover");
    for (const c of coverAt) {
      if (!hasTileAt(cover, c.x, c.y)) cover.tiles.push(cloneTile(rackProto, c.x, c.y));
    }
    const lights = ensureLayer(hostLevel, "light_sources");
    if (!hasTileAt(lights, coreAt.x, coreAt.y)) {
      lights.tiles.push(cloneTile(lightProto, coreAt.x, coreAt.y));
    }
    return true;
  } catch (e) {
    if (e instanceof MissingProto) return false;
    throw e;
  }
}
