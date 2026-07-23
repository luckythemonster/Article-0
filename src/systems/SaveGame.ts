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
    if (
      parsed.version !== VERSION ||
      typeof parsed.level !== "string" ||
      typeof parsed.tileX !== "number" ||
      typeof parsed.tileY !== "number" ||
      typeof parsed.hp !== "number" ||
      !Array.isArray(parsed.inventory) ||
      typeof parsed.objectives !== "object" ||
      parsed.objectives === null
    ) {
      return null;
    }
    return parsed as SaveData;
  } catch {
    return null;
  }
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
