/**
 * Shared shape for an encounter's claim on the interact key.
 *
 * `Vent4Boss`, `BossCore` and `RoofRelay` each declared this identically —
 * a prompt, an arbitration distance, whether the hold is consuming E this
 * frame, and whatever transition a completed hold produced — differing only
 * in which transition type `T` they carry. `Encounters` (the collaborator
 * that drives all three) needs one name for it regardless of which encounter
 * is live, so it lives here rather than three times.
 */
export interface EncounterInteractResult<T> {
  /** Prompt to show if this is the nearest interactable (undefined = none). */
  label?: string;
  /** Distance to the encounter's target, in tiles (for prompt arbitration). */
  dist: number;
  /** True while this hold is consuming E — a chest search must not run. */
  consumedHold: boolean;
  transition: T | null;
}
