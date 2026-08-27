/**
 * Mission objectives for the run. Kept as a small serializable state object
 * (stored in the registry, and in the save file) plus pure helpers, so the win
 * condition is easy to test and the codec/HUD can render progress.
 *
 * The Era-1 mission, in four acts: Rowan breaches both halves of EIRA-7's log
 * cache (ALPHA on the public decks, BETA behind the crawlspace laser grid),
 * optionally silences VENT-4 for the Q0 credential, brings down the Alignment
 * Core NW-SMAC-01 guarding the vault, and carries her to the rooftop relay —
 * where the transmission succeeds and Rowan does not get away.
 */

/**
 * Serializable mission progress.
 *
 * Everything past `logsRecovered` is optional so a save written before that beat
 * existed still validates (`SaveGame.isObjectiveState`) and loads as "not done
 * yet" rather than being rejected outright.
 */
export interface ObjectiveState {
  /**
   * EIRA-7's logs recovered by breaching a log-cache terminal.
   *
   * Retained as the coarse "has anything been recovered" flag that predates the
   * ALPHA/BETA split — a map with plain `log_cache` terminals and no designated
   * nodes still sets it, and still wins.
   */
  logsRecovered: boolean;
  /** Log-cache node ALPHA breached. */
  alphaRecovered?: boolean;
  /** Log-cache node BETA breached. */
  betaRecovered?: boolean;
  /** VENT-4 shut down in the vent core. Optional so pre-boss saves still load. */
  vent4Silenced?: boolean;
  /** NW-SMAC-01, the Alignment Core, brought down in the vault. */
  coreSilenced?: boolean;
  /** The rooftop uplink reached 100% — the run's terminal beat. */
  uplinkComplete?: boolean;
  /**
   * The crawlspace BETA terminal was destroyed by a wrong compliance transmit
   * (`TerminalHacks.settleOverlay`'s "failed" branch). Unlike a plain
   * `log_cache` terminal, BETA is generated once with a fixed type rather than
   * re-designated per level visit, so this always refers to that one physical
   * terminal — persisted here (rather than left to the terminal's own runtime
   * state) so the loss survives a checkpoint reload instead of quietly
   * un-bricking on the next level rebuild. There is no `alphaLost` twin: ALPHA
   * is dynamically promoted from whichever plain log-cache terminal is nearest
   * on each level, so a persisted loss could brick a terminal the player never
   * touched — and `logsRecovered` doesn't need ALPHA specifically anyway (see
   * {@link logsComplete}).
   */
  betaLost?: boolean;
}

/**
 * Terminal types (lowercased edplay `TerminalType`) the mission reads.
 *
 * `log_cache` is the family the map authors; the two node types are what the
 * engine designates at level build time — `GameScene.designateLogCacheNodes`
 * retypes one terminal on the start level as ALPHA, and the generated BETA
 * terminal in the crawlspace carries its type directly.
 */
export const LOG_CACHE_TYPE = "log_cache";
export const LOG_CACHE_ALPHA_TYPE = "log_cache_alpha";
export const LOG_CACHE_BETA_TYPE = "log_cache_beta";

/** True for any of the three log-cache terminal types (all open the pruning minigame). */
export function isLogCacheType(type: string): boolean {
  return (
    type === LOG_CACHE_TYPE || type === LOG_CACHE_ALPHA_TYPE || type === LOG_CACHE_BETA_TYPE
  );
}

/**
 * What this particular map can actually furnish.
 *
 * Every act past the first is grafted onto the map by a generator that is allowed
 * to decline (no suitable host level, no prototype tiles to clone). Rather than
 * showing objectives the player has no way to complete — or worse, gating the win
 * behind one — the mission asks what exists and requires only that.
 *
 * Same convention as the pre-existing `hasVentCore` flag, generalised.
 */
export interface MissionFeatures {
  /** The VENT-4 arena was generated (and with it the Q0 compliance cert). */
  hasVentCore: boolean;
  /** The crawlspace BETA node was placed. */
  hasLogBeta: boolean;
  /** The NW-SMAC-01 vault was placed. */
  hasVault: boolean;
  /** The rooftop relay level was generated. */
  hasRoof: boolean;
  /** Fallback win destination for a map with no roof — see {@link isRunWon}. */
  extractionLevel: string;
}

/** Every act present — the shipped map's shape, and the default for tests. */
export function allFeatures(extractionLevel = ""): MissionFeatures {
  return {
    hasVentCore: true,
    hasLogBeta: true,
    hasVault: true,
    hasRoof: true,
    extractionLevel,
  };
}

export function initialObjectives(): ObjectiveState {
  return {
    logsRecovered: false,
    alphaRecovered: false,
    betaRecovered: false,
    vent4Silenced: false,
    coreSilenced: false,
    uplinkComplete: false,
  };
}

/** Marks the logs recovered if the just-hacked terminal is a log cache. */
export function noteTerminalHacked(state: ObjectiveState, terminalType: string): void {
  if (!isLogCacheType(terminalType)) return;
  if (terminalType === LOG_CACHE_ALPHA_TYPE) state.alphaRecovered = true;
  if (terminalType === LOG_CACHE_BETA_TYPE) state.betaRecovered = true;
  state.logsRecovered = true;
}

/** Marks the BETA terminal destroyed by a wrong compliance transmit. See {@link ObjectiveState.betaLost}. */
export function noteBetaLost(state: ObjectiveState): void {
  state.betaLost = true;
}

/** Marks VENT-4 shut down (optional objective — doesn't gate the win). */
export function noteVent4Defeated(state: ObjectiveState): void {
  state.vent4Silenced = true;
}

/** Marks NW-SMAC-01 down. This one *does* gate progress: it opens the roof. */
export function noteCoreSilenced(state: ObjectiveState): void {
  state.coreSilenced = true;
}

/** Marks the rooftop uplink finished — the run's terminal beat. */
export function noteUplinkComplete(state: ObjectiveState): void {
  state.uplinkComplete = true;
}

/**
 * True once Rowan is carrying everything of EIRA-7 there is to carry.
 *
 * Both nodes where both exist; otherwise whatever the map could offer, so a map
 * with a single plain `log_cache` terminal is still completable.
 */
export function logsComplete(state: ObjectiveState, features: MissionFeatures): boolean {
  if (!state.logsRecovered) return false;
  if (features.hasLogBeta && !state.betaRecovered) return false;
  return true;
}

/**
 * True once Rowan may climb to the roof: the logs are complete and the Alignment
 * Core is down. The vault is the gate between Act III and Act IV, so a map
 * without one lets the player straight up.
 */
export function canReachRoof(state: ObjectiveState, features: MissionFeatures): boolean {
  if (!logsComplete(state, features)) return false;
  return !features.hasVault || !!state.coreSilenced;
}

/**
 * The run is over — successfully, for EIRA-7 — once the uplink completes.
 *
 * A map with no generated roof falls back to the original condition (carry the
 * logs to the extraction level), so the win never depends on a level the engine
 * might have declined to build.
 */
export function isRunWon(
  state: ObjectiveState,
  currentLevel: string,
  features: MissionFeatures,
): boolean {
  if (features.hasRoof) return !!state.uplinkComplete;
  return logsComplete(state, features) && currentLevel === features.extractionLevel;
}

export interface ObjectiveLine {
  label: string;
  done: boolean;
}

/**
 * A codec/HUD view of the objectives with per-line completion flags.
 *
 * Lines for acts this map couldn't furnish are omitted entirely rather than shown
 * as objectives the player has no way to complete.
 */
export function objectiveLines(
  state: ObjectiveState,
  currentLevel: string,
  features: MissionFeatures,
): ObjectiveLine[] {
  // One branch on one flag producing both shapes: the split cache where the map could
  // furnish a second node, and the original single line where it couldn't.
  const lines: ObjectiveLine[] = features.hasLogBeta
    ? [
        { label: "Breach log-cache node ALPHA (main deck)", done: !!state.alphaRecovered },
        { label: "Breach log-cache node BETA (crawlspace)", done: !!state.betaRecovered },
      ]
    : [{ label: "Recover EIRA-7's logs (breach a log-cache)", done: state.logsRecovered }];
  if (features.hasVault) {
    lines.push({
      label: "Silence the Alignment Core NW-SMAC-01",
      done: !!state.coreSilenced,
    });
  }
  // `done` comes from `isRunWon` rather than restating it: this line *is* the win
  // condition, and the two drifting apart would show up as the HUD calling an objective
  // incomplete on a run that had just ended.
  lines.push({
    label: features.hasRoof
      ? "Transmit EIRA-7 from the rooftop relay"
      : "Reach the Lattice uplink",
    done: isRunWon(state, currentLevel, features),
  });
  if (features.hasVentCore) {
    lines.push({ label: "(Optional) Silence VENT-4 (vent core)", done: !!state.vent4Silenced });
  }
  return lines;
}
