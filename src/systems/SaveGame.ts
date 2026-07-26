import { initialJournal, isJournalState, sanitizeJournal, type JournalState } from "./Journal";
import { initialExplored, isExploredState, type ExploredState } from "./Explored";
import type { ObjectiveState } from "./Objectives";

/**
 * Checkpoint persistence via localStorage.
 *
 * There are four slots. `auto` is the checkpoint the engine writes on entry to
 * each level — the original behaviour, unchanged — and `1`–`3` are written by the
 * player from the pause menu's SYSTEM tab. They are stored under separate keys so
 * a level transition can never clobber a save the player made deliberately.
 *
 * All access is wrapped so a missing or blocked localStorage degrades to "no
 * save", and {@link isValidSave} does a strict shape + range check so a corrupt or
 * hand-edited blob does the same rather than resuming a broken run.
 *
 * **Version 2** added the journal, the explored-tile masks and the run clock. A v1
 * blob is *upgraded on read* rather than rejected: the previous version's
 * `version !== VERSION` check would have silently thrown away an in-progress run
 * the moment this shipped, which is the exact failure the strict validation exists
 * to prevent. v1 also had no per-slot key, so the unsuffixed legacy key is read as
 * the `auto` slot when no suffixed one exists.
 */

/** Save slots: the engine's rolling checkpoint plus three the player controls. */
export type SlotId = "auto" | "1" | "2" | "3";

/** The slots the pause menu offers for manual saving. */
export const MANUAL_SLOTS = ["1", "2", "3"] as const;

/** Every slot, in display order. */
export const SAVE_SLOTS: readonly SlotId[] = ["auto", ...MANUAL_SLOTS];

export interface SaveData {
  version: number;
  level: string;
  tileX: number;
  tileY: number;
  hp: number;
  inventory: string[];
  objectives: ObjectiveState;
  /** Journal entries written so far. */
  journal: JournalState;
  /** Per-level explored-tile masks, for the pause menu's map. */
  explored: ExploredState;
  /** Milliseconds of play in this run, for the STATUS tab's clock. */
  playTimeMs: number;
  /** Epoch ms the slot was written — drives slot listing and {@link newestSave}. */
  savedAt: number;
}

/** What a caller supplies; the version and timestamp are stamped on here. */
export type SavePayload = Omit<SaveData, "version" | "savedAt">;

const LEGACY_KEY = "article-zero-save";
const KEY_PREFIX = "article-zero-save-";
const VERSION = 2;

function keyFor(slot: SlotId): string {
  return `${KEY_PREFIX}${slot}`;
}

export function saveGame(slot: SlotId, data: SavePayload): void {
  try {
    const blob: SaveData = { version: VERSION, savedAt: Date.now(), ...data };
    localStorage.setItem(keyFor(slot), JSON.stringify(blob));
  } catch {
    /* storage unavailable — skip */
  }
}

export function loadGame(slot: SlotId): SaveData | null {
  try {
    const raw = localStorage.getItem(keyFor(slot));
    // Pre-v2 saves had no slot suffix; adopt that blob as the checkpoint.
    const fallback = raw === null && slot === "auto" ? localStorage.getItem(LEGACY_KEY) : null;
    return parseSave(raw ?? fallback);
  } catch {
    return null;
  }
}

/** Every slot with its contents (or `null` when empty), in display order. */
export function listSaves(): { slot: SlotId; data: SaveData | null }[] {
  return SAVE_SLOTS.map((slot) => ({ slot, data: loadGame(slot) }));
}

/**
 * The most recently written save — what the title screen's "Continue" resumes.
 * Ties go to the earlier slot in display order, which puts `auto` first; a manual
 * save made in the same millisecond as a checkpoint is not a case worth ranking.
 */
export function newestSave(): { slot: SlotId; data: SaveData } | null {
  let best: { slot: SlotId; data: SaveData } | null = null;
  for (const { slot, data } of listSaves()) {
    if (!data) continue;
    if (!best || data.savedAt > best.data.savedAt) best = { slot, data };
  }
  return best;
}

export function hasAnySave(): boolean {
  return newestSave() !== null;
}

/** Clears one slot, or every slot (including the legacy key) when omitted. */
export function clearSave(slot?: SlotId): void {
  try {
    if (slot) {
      localStorage.removeItem(keyFor(slot));
      if (slot === "auto") localStorage.removeItem(LEGACY_KEY);
      return;
    }
    for (const s of SAVE_SLOTS) localStorage.removeItem(keyFor(s));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

// --- parsing / validation ------------------------------------------------

function parseSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isValidSave(parsed)) return null;

  const v = parsed as Partial<SaveData> & Record<string, unknown>;
  if (v.version === 1) return upgradeV1(v);
  if (v.version !== VERSION) return null;
  if (!isJournalState(v.journal) || !isExploredState(v.explored)) return null;
  if (!Number.isFinite(v.playTimeMs) || (v.playTimeMs as number) < 0) return null;
  if (!Number.isFinite(v.savedAt)) return null;

  return {
    ...(v as SaveData),
    // Drop entries authored by a build that isn't this one.
    journal: sanitizeJournal(v.journal),
  };
}

/**
 * A v1 checkpoint, brought forward: it predates the journal, the map and the run
 * clock, so those start empty. `savedAt` is 0 rather than "now" — the save is
 * genuinely old, and dating it to the moment of the upgrade would let it beat a
 * newer slot in {@link newestSave}.
 */
function upgradeV1(v: Partial<SaveData>): SaveData {
  return {
    version: VERSION,
    level: v.level as string,
    tileX: v.tileX as number,
    tileY: v.tileY as number,
    hp: v.hp as number,
    inventory: v.inventory as string[],
    objectives: v.objectives as ObjectiveState,
    journal: initialJournal(),
    explored: initialExplored(),
    playTimeMs: 0,
    savedAt: 0,
  };
}

/**
 * Strict shape + range check for the fields every version shares. Beyond basic
 * types this rejects values that would resume a broken run — non-finite or
 * negative HP, off-grid or fractional tile coordinates, non-string inventory
 * entries, or a malformed objectives record.
 */
function isValidSave(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<SaveData>;
  return (
    (s.version === 1 || s.version === VERSION) &&
    typeof s.level === "string" &&
    s.level.length > 0 &&
    Number.isInteger(s.tileX) &&
    (s.tileX as number) >= 0 &&
    Number.isInteger(s.tileY) &&
    (s.tileY as number) >= 0 &&
    Number.isFinite(s.hp) &&
    (s.hp as number) >= 0 &&
    Array.isArray(s.inventory) &&
    s.inventory.every((i) => typeof i === "string") &&
    isObjectiveState(s.objectives)
  );
}

/** Narrow check for the persisted objective record. */
function isObjectiveState(o: unknown): o is ObjectiveState {
  return typeof o === "object" && o !== null && typeof (o as ObjectiveState).logsRecovered === "boolean";
}

/** A payload with everything new to v2 empty — for a run that hasn't got one yet. */
export function emptyProgress(): Pick<SaveData, "journal" | "explored" | "playTimeMs"> {
  return { journal: initialJournal(), explored: initialExplored(), playTimeMs: 0 };
}
