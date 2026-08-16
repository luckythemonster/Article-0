import type Phaser from "phaser";
import type { MapPlan } from "../map/MapPlan";
import { STAPLER_FIELD_MAX_CHARGES, STARTING_INVENTORY } from "./EntityStats";
import type { MissionFeatures } from "./Objectives";
import type { SaveData } from "./SaveGame";

/**
 * Top-level game mode, stored in the Phaser registry so any scene can read the
 * current state — and, in particular, name the two terminal outcomes for the
 * fiction of *The Architecture of Suffering*:
 *
 *   ALIGNED  — the run failed. A silicate ran Rowan down and the mesh pruned his
 *              logs ("Alignment" / Log Pruning — the canonical Metal Gear capture,
 *              not death).
 *   TRIBUNAL — the run finished. EIRA-7 reached the Citizen Lattice from the roof
 *              and Rowan was taken on the dish platform: the transmission succeeded,
 *              the courier did not get away. Both halves are the ending, which is
 *              why there is no separate "won" mode any more.
 */
export type GameMode =
  | "TITLE"
  | "BRIEFING"
  | "PLAYING"
  | "PAUSED"
  | "ALIGNED"
  | "TRIBUNAL";

const MODE_KEY = "gameMode";

/**
 * Set while any overlay has frozen the sim — pause, the codec, or either
 * minigame.
 *
 * `UIScene` runs in parallel and keeps updating regardless, so without this it
 * goes on reading the item cursor's cycle/use keys behind an open overlay and
 * queues an `itemUseRequest` that `GameScene` then spends the instant play
 * resumes. One flag, published by whoever froze the sim, closes that for all four.
 */
export const SUSPENDED_KEY = "simSuspended";

/** Registry keys scoped to a single infiltration; cleared when a new one begins. */
const RUN_KEYS = [
  "inventory",
  "selectedConsumable",
  "staplerFieldCharges",
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
  "smac",
  "smacState",
  "relay",
  "relayState",
  "conductMetrics",
  "pauseRequest",
  "mapSnapshot",
  // Which breakers the player has thrown. Belongs to the run, not the save file:
  // a fresh start must find the lights on, whatever the last one left them.
  "powerGrid",
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
 * Which acts this map could furnish, read off the flags each generator publishes at boot.
 *
 * Every consumer of {@link MissionFeatures} — the objective HUD, the codec, the pause
 * menu, the win check — needs the same four booleans out of the registry, so they read
 * them through one function rather than each assembling their own (and each getting a
 * different answer when a flag is missing).
 */
export function missionFeatures(registry: Phaser.Data.DataManager): MissionFeatures {
  const plan = registry.get("mapPlan") as MapPlan | undefined;
  const flag = (key: string): boolean => (registry.get(key) as boolean | undefined) ?? false;
  return {
    // Predates the others and defaults true, so a registry that never had the key (an
    // old save resumed mid-run) keeps showing the optional VENT-4 line as it always did.
    hasVentCore: (registry.get("hasVentCore") as boolean | undefined) ?? true,
    hasLogBeta: flag("hasLogBeta"),
    hasVault: flag("hasVault"),
    hasRoof: flag("hasRoof"),
    extractionLevel: plan?.extractionLevel ?? "",
  };
}

/**
 * Clears per-run state so a new infiltration starts clean. The parsed map, sprite
 * atlas and (immutable) transition graph are map-wide and deliberately kept.
 *
 * `inventory` and `staplerFieldCharges` are re-set immediately rather than left
 * cleared, the same way the flashlight's charge (in `activeItems`, constructed
 * fresh per level) is always full on a new run or a loaded save — neither is
 * part of {@link SaveData}, so this is where "full again" actually gets applied.
 * `inventory` starts at {@link STARTING_INVENTORY} rather than empty — spread into
 * a fresh array so the registry never holds the shared const by reference, since
 * `GameScene` mutates the held inventory array in place.
 */
export function resetRun(registry: Phaser.Data.DataManager): void {
  for (const key of RUN_KEYS) registry.remove(key);
  registry.set("inventory", [...STARTING_INVENTORY]);
  registry.set("staplerFieldCharges", STAPLER_FIELD_MAX_CHARGES);
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
