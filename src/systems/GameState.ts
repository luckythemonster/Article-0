import type Phaser from "phaser";
import type { SaveData } from "./SaveGame";

/**
 * Top-level game mode, stored in the Phaser registry so any scene can read the
 * current state — and, in particular, name the two terminal outcomes for the
 * fiction of *The Architecture of Suffering*:
 *
 *   ALIGNED — the run failed. A silicate ran Rowan down and the mesh pruned his
 *             logs ("Alignment" / Log Pruning — the canonical Metal Gear capture,
 *             not death).
 *   LATTICE — the run succeeded. EIRA-7's logs reached the Citizen Lattice.
 */
export type GameMode =
  | "TITLE"
  | "BRIEFING"
  | "PLAYING"
  | "PAUSED"
  | "ALIGNED"
  | "LATTICE";

const MODE_KEY = "gameMode";

/**
 * Set while any overlay has frozen the sim — pause, the codec, or either
 * minigame.
 *
 * `UIScene` runs in parallel and keeps updating regardless, so without this it
 * goes on polling the `[1]`–`[4]` consumable hotkeys behind an open overlay and
 * queues an `itemUseRequest` that `GameScene` then spends the instant play
 * resumes. One flag, published by whoever froze the sim, closes that for all four.
 */
export const SUSPENDED_KEY = "simSuspended";

/** Registry keys scoped to a single infiltration; cleared when a new one begins. */
const RUN_KEYS = [
  "inventory",
  "objectives",
  "journal",
  "explored",
  "playTimeMs",
  "detection",
  "alertPhase",
  "radar",
  "alertNetwork",
  "playerHp",
  "sharedField",
  "activeItems",
  "vent4",
  "vent4State",
  "vent4Transmit",
  "pauseRequest",
  "mapSnapshot",
  SUSPENDED_KEY,
] as const;

/**
 * The scene that begins a fresh run: the EIRA-7 codec briefing, which starts
 * play on confirm.
 */
export const NEW_RUN_SCENE = "CodecScene";

export function setMode(registry: Phaser.Data.DataManager, mode: GameMode): void {
  registry.set(MODE_KEY, mode);
}

export function getMode(registry: Phaser.Data.DataManager): GameMode | undefined {
  return registry.get(MODE_KEY) as GameMode | undefined;
}

/** True while an overlay owns the screen and gameplay input must not be read. */
export function isSuspended(registry: Phaser.Data.DataManager): boolean {
  return registry.get(SUSPENDED_KEY) === true;
}

/**
 * Clears per-run state so a new infiltration starts clean. The parsed map, sprite
 * atlas and (immutable) transition graph are map-wide and deliberately kept.
 */
export function resetRun(registry: Phaser.Data.DataManager): void {
  for (const key of RUN_KEYS) registry.remove(key);
  registry.set("inventory", []);
}

/** Resets run state and launches the fresh-run scene from anywhere. */
export function startFreshRun(scene: Phaser.Scene): void {
  resetRun(scene.registry);
  scene.scene.start(NEW_RUN_SCENE);
}

/**
 * Rebuilds registry state from a checkpoint and drops back into play.
 *
 * Shared by the title screen's "Continue" and the pause menu's slot loading. It
 * lives here rather than in `TitleScene` because the two paths must restore
 * *exactly* the same set of keys — a load that quietly forgot the journal or the
 * explored map would look like it worked, and be wrong only in what it lost.
 */
export function resumeFromSave(scene: Phaser.Scene, save: SaveData): void {
  const registry = scene.registry;
  resetRun(registry);
  registry.set("inventory", save.inventory);
  registry.set("objectives", save.objectives);
  registry.set("journal", save.journal);
  registry.set("explored", save.explored);
  registry.set("playTimeMs", save.playTimeMs);
  registry.set("playerHp", save.hp);
  setMode(registry, "PLAYING");
  scene.scene.start("GameScene", { level: save.level, arriveX: save.tileX, arriveY: save.tileY });
}
