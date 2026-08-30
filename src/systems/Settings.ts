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
  /**
   * Whether EIRA-7's codec is spoken aloud as well as printed.
   *
   * Its own preference rather than a consequence of the volume, because it is a
   * question of pacing rather than of loudness: a briefing is ~25 seconds of
   * synthesised speech, and a player rereading one they already know should be
   * able to skip that without turning the game silent.
   */
  narrateCodec: boolean;
}

const KEY = "article-zero-settings";

export const DEFAULT_SETTINGS: Settings = { masterVolume: 1, muted: false, narrateCodec: true };

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
  const rawVolume = hasOwn.call(v, "masterVolume") ? (v as Record<string, unknown>).masterVolume : undefined;
  const rawMuted = hasOwn.call(v, "muted") ? (v as Record<string, unknown>).muted : undefined;
  const rawNarrate = hasOwn.call(v, "narrateCodec")
    ? (v as Record<string, unknown>).narrateCodec
    : undefined;

  const volume = typeof rawVolume === "number" && Number.isFinite(rawVolume) ? rawVolume : undefined;
  const muted = typeof rawMuted === "boolean" ? rawMuted : DEFAULT_SETTINGS.muted;
  // Absent for every settings blob written before narration existed, which is
  // the common case rather than the corrupt one — those players get it on.
  const narrateCodec =
    typeof rawNarrate === "boolean" ? rawNarrate : DEFAULT_SETTINGS.narrateCodec;

  // Fully reconstruct clean object field-by-field with validated primitive types,
  // completely ignoring prototype keys (__proto__, constructor) or unexpected fields.
  return {
    masterVolume: volume !== undefined ? Math.min(1, Math.max(0, volume)) : DEFAULT_SETTINGS.masterVolume,
    muted,
    narrateCodec,
  };
}
