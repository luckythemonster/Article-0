import type { GameMap } from "./types";

/**
 * What shape a map is: where a run starts, where it ends, and whether the engine can graft
 * its generated VENT-4 arena onto it.
 *
 * These used to be string literals scattered through the code — `"main1"` in
 * `GameScene.init`, `"main2"` in `Objectives`, `"duct2"` in `VentCoreLevel` — which meant a
 * new map had to reuse the shipped map's level names or it could not be started, could not
 * be won, and threw at boot. Deriving them from the map instead makes those names a
 * convention with a fallback rather than a requirement.
 *
 * Every rule below is ordered so the **shipped map resolves to exactly its old behaviour**
 * (`main1` / `main2` / `duct2`), while a new map can either declare intent through a board
 * or accept the defaults.
 *
 * Pure — no Phaser — so the rules are unit-testable on their own.
 */
export interface MapPlan {
  /** Level a fresh run starts on. */
  startLevel: string;
  /** Level the player must reach, carrying the logs, to win. */
  extractionLevel: string;
  /**
   * Level the generated vent-core arena grafts onto, or null to skip generating it — in
   * which case the map simply has no VENT-4 (and so no Q0 compliance cert, since that is
   * the reward for silencing it).
   */
  ventCoreHost: string | null;
}

/** Levels a plan may point at: anything the map itself authored. */
function candidates(map: GameMap): GameMap["levels"] {
  // Generated levels (the vent core, the rooftop relay) must never be picked as a start,
  // an extraction point, or a host — they are grafted *onto* authored levels, so routing a
  // run into one would be circular. Filtering them here also keeps planFor stable if it is
  // re-run after generation, which `GameScene.mapPlan()` does whenever the registry key is
  // missing.
  //
  // Keyed on the flag the generator sets rather than the name, because a map may
  // author its own `vent_core` — and one the author drew is ordinary content that
  // should be as eligible to host a run as any other level.
  return map.levels.filter((l) => !l.generated);
}

/** True when a level carries a board of this name with at least one tile on it. */
function hasBoard(level: GameMap["levels"][number], board: string): boolean {
  const layer = level.layers.find((l) => l.name === board);
  return (layer?.tiles.length ?? 0) > 0;
}

export function planFor(map: GameMap): MapPlan {
  const levels = candidates(map);
  const first = levels[0]?.name ?? map.levels[0]?.name ?? "";
  const last = levels[levels.length - 1]?.name ?? first;

  // Start: wherever the player is placed. The spawn tile already says so; nothing else
  // needs authoring.
  const startLevel = levels.find((l) => hasBoard(l, "spawn"))?.name ?? first;

  // Extraction: an explicit `extraction` board is the way to declare "the uplink is here".
  // Falling back to a level named `main2` keeps the shipped map winnable unchanged; failing
  // that, the last authored level is the least surprising guess.
  const extractionLevel =
    levels.find((l) => hasBoard(l, "extraction"))?.name ??
    levels.find((l) => l.name === "main2")?.name ??
    last;

  // Vent-core host: the arena is spliced into a maintenance level and clones its art, so it
  // needs somewhere with hatches that isn't the start or the finish. `duct2` first, again
  // so the shipped map is unchanged.
  const ventCoreHost =
    levels.find((l) => l.name === "duct2")?.name ??
    [...levels]
      .reverse()
      .find(
        (l) =>
          hasBoard(l, "maintenance_access") &&
          l.name !== startLevel &&
          l.name !== extractionLevel,
      )?.name ??
    null;

  return { startLevel, extractionLevel, ventCoreHost };
}
