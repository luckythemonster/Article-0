import type { ObjectiveState } from "./Objectives";

/**
 * Checkpoint persistence via localStorage. A checkpoint is written on entry to
 * each level (see GameScene), capturing enough to resume the run: the level and
 * arrival tile, bio-integrity, inventory and mission progress. The title screen
 * offers "Continue" when a save exists. All access is wrapped so a missing or
 * blocked localStorage (or a stale schema version) degrades to "no save".
 */
export interface SaveData {
  version: number;
  level: string;
  tileX: number;
  tileY: number;
  hp: number;
  inventory: string[];
  objectives: ObjectiveState;
}

const KEY = "article-zero-save";
const VERSION = 1;

export function saveGame(data: Omit<SaveData, "version">): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, ...data }));
  } catch {
    /* storage unavailable — skip */
  }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return isValidSave(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Strict shape + range check for a persisted checkpoint. Beyond basic types this
 * rejects values that would resume a broken run — non-finite or negative HP,
 * off-grid or fractional tile coordinates, non-string inventory entries, or a
 * malformed objectives record — so a corrupted or hand-edited localStorage blob
 * degrades to "no save" rather than a wedged or out-of-bounds game state.
 */
function isValidSave(v: Partial<SaveData>): v is SaveData {
  return (
    v.version === VERSION &&
    typeof v.level === "string" &&
    v.level.length > 0 &&
    Number.isInteger(v.tileX) &&
    (v.tileX as number) >= 0 &&
    Number.isInteger(v.tileY) &&
    (v.tileY as number) >= 0 &&
    Number.isFinite(v.hp) &&
    (v.hp as number) >= 0 &&
    Array.isArray(v.inventory) &&
    v.inventory.every((i) => typeof i === "string") &&
    isObjectiveState(v.objectives)
  );
}

/** Narrow check for the persisted objective record. */
function isObjectiveState(o: unknown): o is ObjectiveState {
  return typeof o === "object" && o !== null && typeof (o as ObjectiveState).logsRecovered === "boolean";
}

export function hasSave(): boolean {
  return loadGame() !== null;
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
