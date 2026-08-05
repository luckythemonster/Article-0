/**
 * Player preferences — currently just audio.
 *
 * Deliberately kept in its own localStorage key rather than inside the save file:
 * settings are not run state. Clearing a save on victory, or starting a fresh
 * infiltration, must not reset the player's volume, and a settings blob that fails
 * to parse must not be able to take a save down with it.
 *
 * Same defensive posture as {@link ./SaveGame}: every access is wrapped, and junk
 * degrades to defaults rather than throwing.
 */

export interface Settings {
  /** 0..1, applied on top of the mixer's own headroom. */
  masterVolume: number;
  muted: boolean;
}

const KEY = "article-zero-settings";

export const DEFAULT_SETTINGS: Settings = { masterVolume: 1, muted: false };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeSettings(settings)));
  } catch {
    /* storage unavailable — the session keeps the setting, the next one won't */
  }
}

/**
 * Coerces anything into a usable Settings: clamps the volume into range and drops
 * non-finite or non-boolean fields back to their defaults. Applied on both read
 * and write, so a hand-edited blob can't put the mixer somewhere it can't recover
 * from — a stored `masterVolume: -3` would otherwise be silent forever with a
 * slider that looks fine.
 */
export function normalizeSettings(v: unknown): Settings {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    return { ...DEFAULT_SETTINGS };
  }

  // Guard against prototype pollution or unexpected lookup of inherited properties by using hasOwnProperty
  const hasOwn = Object.prototype.hasOwnProperty;
  const masterVolume = hasOwn.call(v, "masterVolume") ? (v as any).masterVolume : undefined;
  const muted = hasOwn.call(v, "muted") ? (v as any).muted : undefined;

  const volume = Number(masterVolume);
  return {
    masterVolume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : DEFAULT_SETTINGS.masterVolume,
    muted: typeof muted === "boolean" ? muted : DEFAULT_SETTINGS.muted,
  };
}
