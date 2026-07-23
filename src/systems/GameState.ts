import type Phaser from "phaser";

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

/** Registry keys scoped to a single infiltration; cleared when a new one begins. */
const RUN_KEYS = [
  "inventory",
  "objectives",
  "detection",
  "alertPhase",
  "radar",
  "alertNetwork",
  "playerHp",
] as const;

/**
 * The scene that begins a fresh run: the EIRA-7 codec briefing, which starts
 * play on confirm.
 */
export const NEW_RUN_SCENE = "CodecScene";

export function setMode(registry: Phaser.Data.DataManager, mode: GameMode): void {
  registry.set(MODE_KEY, mode);
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
