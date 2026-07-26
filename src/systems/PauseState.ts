/**
 * The contract between the pause menu and the running game.
 *
 * The menu is a DOM overlay in its own scene: it can read the registry, but it
 * has no access to the player's position, the collision grid or the scene stack.
 * So the two halves talk through these two shapes — a snapshot of the level
 * pushed *out* when the game freezes, and a request posted *back* when the player
 * chooses something. Same registry-flag handshake the codec's transmit finisher
 * and both minigame overlays already use.
 */

import type { ExploredMap } from "./Explored";
import type { SlotId } from "./SaveGame";

/** Registry key carrying the player's choice from the pause menu to GameScene. */
export const PAUSE_REQUEST_KEY = "pauseRequest";

/** Registry key GameScene echoes a completed save on, so the menu can re-list. */
export const SAVE_WRITTEN_KEY = "saveWritten";

/** Registry key carrying the level snapshot the MAP tab draws. */
export const MAP_SNAPSHOT_KEY = "mapSnapshot";

/**
 * What the player asked for. `load` and `save` name a slot; the rest are verbs.
 * `resume` exists so the menu's own Resume item goes through the same path as
 * Esc rather than reaching into the scene.
 */
export type PauseRequest =
  | { kind: "resume" }
  | { kind: "save"; slot: SlotId }
  | { kind: "load"; slot: SlotId }
  | { kind: "quit" };

/** Everything the MAP tab needs to draw the current level. */
export interface MapSnapshot {
  level: string;
  width: number;
  height: number;
  /** One byte per tile, row-major: 1 where movement is blocked. */
  walls: Uint8Array;
  /** Which of those tiles the player has actually seen. */
  explored: ExploredMap;
  player: { tx: number; ty: number };
  /** Stairs, hatches and ladders off this level, labelled with their destination. */
  exits: { tx: number; ty: number; label: string }[];
}
