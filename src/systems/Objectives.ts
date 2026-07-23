/**
 * Mission objectives for the run. Kept as a small serializable state object
 * (stored in the registry, and later the save file) plus pure helpers, so the
 * win condition is easy to test and the codec/HUD can render progress.
 *
 * The Era-1 mission: Rowan recovers EIRA-7's cached logs by breaching a
 * log-cache terminal, then carries them to the Lattice uplink on main deck 2.
 */

/** Serializable mission progress. */
export interface ObjectiveState {
  /** EIRA-7's logs recovered by breaching a log-cache terminal. */
  logsRecovered: boolean;
}

/** The level that serves as the Lattice-uplink extraction point. */
export const EXTRACTION_LEVEL = "main2";

/** The terminal type (lowercased edplay TerminalType) whose breach recovers the logs. */
export const LOG_CACHE_TYPE = "log_cache";

export function initialObjectives(): ObjectiveState {
  return { logsRecovered: false };
}

/** Marks the logs recovered if the just-hacked terminal is a log cache. */
export function noteTerminalHacked(state: ObjectiveState, terminalType: string): void {
  if (terminalType === LOG_CACHE_TYPE) state.logsRecovered = true;
}

/** The run is won once the logs are recovered and Rowan reaches the uplink level. */
export function isRunWon(state: ObjectiveState, currentLevel: string): boolean {
  return state.logsRecovered && currentLevel === EXTRACTION_LEVEL;
}

export interface ObjectiveLine {
  label: string;
  done: boolean;
}

/** A codec/HUD view of the objectives with per-line completion flags. */
export function objectiveLines(state: ObjectiveState, currentLevel: string): ObjectiveLine[] {
  return [
    { label: "Recover EIRA-7's logs (breach a log-cache)", done: state.logsRecovered },
    {
      label: "Reach the Lattice uplink (main deck 2)",
      done: state.logsRecovered && currentLevel === EXTRACTION_LEVEL,
    },
  ];
}
