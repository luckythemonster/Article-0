import type { EdPlayFile } from "./types";

/**
 * Attaches the export's own `Terminal` defaults to terminals it left inert.
 *
 * NW-SMAC-01 v0.4 files `main1`'s `terminal1` and `duct2`'s `terminal2` alone on
 * a board called `terminals` — v0.3 had them on `sensors`, and moving them was
 * the author acting on exactly this — but neither tile carries a `Terminal`
 * component, so the engine reads two pieces of scenery.
 *
 * They are the two terminals nearest the start, and both are load-bearing:
 * `GameScene.designateLogCacheNodes` promotes the nearest log cache on the start
 * level to node ALPHA and finds none, and `appendLogCacheBeta` looks for a cache
 * already on the crawlspace deck to promote in place, finds none, and falls
 * through to a coordinate off the edge of a 36×18 level. The run ends up with no
 * cache at all until `secret2`, most of the way through the map.
 *
 * ### Why this runs on the raw export
 *
 * A tile's components come from its `TileDef`, and an absent field there falls
 * back to the `DataStructure`'s declared default — which for `Terminal` is a
 * 2.2-second hack of a `LOG_CACHE`. Adding the empty component *before* parsing
 * therefore invents nothing: `EdplayLoader` fills it from the export's own
 * schema, with the export's own field naming, exactly as it does for every
 * terminal the author did wire up.
 *
 * ### When to delete this
 *
 * The day the export attaches the component. This is the same kind of escape
 * hatch as `EXTRA_SOLID_BOARDS` and carries the same instruction: it exists to
 * spare the author a re-export, not to override them. A tile that *does* carry a
 * `Terminal` component is never touched, so an author who types one of these as
 * something other than a log cache wins immediately.
 */

/** The board whose tiles the author is declaring to be terminals. */
const TERMINALS_BOARD = "terminals";

/**
 * Refs the rule applies to.
 *
 * Anchored and numeric-suffixed, so it catches the map's `terminal1`…`terminal12`
 * naming and nothing else. `security_node1` shares `main2vault`'s terminals board
 * and is scenery; it stays scenery.
 */
const TERMINAL_REF = /^terminal\d+$/i;

/** The `DataStructure` whose defaults an inert terminal is given. */
const TERMINAL_TYPE = "Terminal";

/**
 * Patches the raw export in place, before {@link EdplayLoader.parse}.
 *
 * @returns the refs it typed, in file order — empty when the export needs no
 *   help, which is the outcome to aim for.
 */
export function typeInertTerminals(raw: EdPlayFile): string[] {
  // No schema for a terminal means no defaults to hand out, and nothing this
  // could add would come from the map.
  if (!raw.DataTypes.DataStructures.some((d) => d.Name === TERMINAL_TYPE)) return [];

  // Only defs the author actually placed on a terminals board. A TileDef is
  // shared by every placement of it, so this must not fire on a `terminal4`
  // dropped somewhere as decoration.
  const onTerminalsBoard = new Set<number>();
  for (const level of raw.Levels) {
    for (const board of level.Boards) {
      if (board.Name !== TERMINALS_BOARD) continue;
      for (const t of board.Tiles) onTerminalsBoard.add(t.Handle);
    }
  }

  const typed: string[] = [];
  for (const def of raw.TileDefs) {
    if (!onTerminalsBoard.has(def.Handle)) continue;
    if (def.DataComponents.length > 0) continue;
    if (!TERMINAL_REF.test(def.Ref)) continue;
    // No variables: every field resolves to the DataStructure's own default.
    def.DataComponents.push({ DataType: TERMINAL_TYPE, Variables: [] });
    typed.push(def.Ref);
  }
  return typed;
}
