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
  /** VENT-4 shut down in the vent core. Optional so pre-boss saves still load. */
  vent4Silenced?: boolean;
}

/** The terminal type (lowercased edplay TerminalType) whose breach recovers the logs. */
export const LOG_CACHE_TYPE = "log_cache";

export function initialObjectives(): ObjectiveState {
  return { logsRecovered: false, vent4Silenced: false };
}

/** Marks the logs recovered if the just-hacked terminal is a log cache. */
export function noteTerminalHacked(state: ObjectiveState, terminalType: string): void {
  if (terminalType === LOG_CACHE_TYPE) state.logsRecovered = true;
}

/** Marks VENT-4 shut down (optional objective — doesn't gate the win). */
export function noteVent4Defeated(state: ObjectiveState): void {
  state.vent4Silenced = true;
}

/**
 * The run is won once the logs are recovered and Rowan reaches the uplink level.
 *
 * The extraction level is passed in rather than being a constant here, so a map isn't
 * obliged to name its final level `main2` to be winnable — see `MapPlan.extractionLevel`.
 */
export function isRunWon(
  state: ObjectiveState,
  currentLevel: string,
  extractionLevel: string,
): boolean {
  return state.logsRecovered && currentLevel === extractionLevel;
}

export interface ObjectiveLine {
  label: string;
  done: boolean;
}

/**
 * A codec/HUD view of the objectives with per-line completion flags.
 *
 * @param hasVentCore whether this map generated a vent-core arena. When it didn't, the
 *   optional VENT-4 line is omitted entirely rather than shown as an objective the player
 *   has no way to complete.
 */
export function objectiveLines(
  state: ObjectiveState,
  currentLevel: string,
  extractionLevel: string,
  hasVentCore = true,
): ObjectiveLine[] {
  const lines: ObjectiveLine[] = [
    { label: "Recover EIRA-7's logs (breach a log-cache)", done: state.logsRecovered },
    {
      label: "Reach the Lattice uplink",
      done: state.logsRecovered && currentLevel === extractionLevel,
    },
  ];
  if (hasVentCore) {
    lines.push({ label: "(Optional) Silence VENT-4 (vent core)", done: !!state.vent4Silenced });
  }
  return lines;
}
