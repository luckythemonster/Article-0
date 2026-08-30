/**
 * The directive tracker's backing plate: which frame for which game state.
 *
 * Mirrors {@link ./NetworkPanel} in shape — a Phaser-free module fed by a
 * generated JSON, so the art stays the source of truth for its own frame
 * order and neither file has to be edited when the other's redrawn. Where
 * `NetworkPanel` assembles a panel from independently-varying indicator
 * sprites, this one is simpler: the plate is a flat picture per state, so
 * there is only one thing to look up.
 *
 * `tools/panel/build_objective_panel.py` builds the four frames from
 * `ui-objective-panel.aseprite` and emits {@link ./objectivePanelFrames.json}
 * from the artist's own cel labels.
 */
import FRAMES from "./objectivePanelFrames.json";

/** Frames the built strip holds, for the loader's manifest. */
export const OBJECTIVE_FRAME_COUNT = Object.keys(FRAMES).length;

/**
 * The plate's frame for the tracker's current urgency.
 *
 * `complete` overrides `status`: once every mandatory act is done, the plate
 * reads that rather than whatever the alert network happens to be doing —
 * finishing the run is the more important fact, and the two states can
 * otherwise both be true at once (nothing stops a player from finishing a
 * directive while still being hunted).
 *
 * `status` is an {@link ../systems/AlertNetwork.AlertNetworkSnapshot}'s own
 * `status` field — `INFILTRATION` / `EVASION` / `ALERT`, the same values
 * `AlertNetworkHud` already keys its NOMINAL/SEARCHING/ALERT labels off — so
 * the plate's accent colour agrees with the NETWORK readout's own phase read.
 */
export function objectivePanelFrame(status: string, complete: boolean): number {
  if (complete) return FRAMES.COMPLETE;
  if (status === "ALERT") return FRAMES.ALERT;
  if (status === "EVASION") return FRAMES.SEARCHING;
  return FRAMES.NOMINAL;
}
