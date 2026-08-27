import type { GuardState } from "../entities/Enforcer";

/**
 * What a silicate says, and in whose voice.
 *
 * Headless and pure, like everything else under `src/systems/` — this module
 * picks a line and a voice preset, and `src/systems/AudioDirector.ts` is what
 * actually makes a noise. That split is what lets the selection be unit-tested
 * without an `AudioContext`.
 *
 * ### There were no lines before this
 *
 * Enforcers and drones carry an alert marker — the `!` over the head — and
 * nothing else. There is no bark system anywhere in the game and never has been,
 * so this adds the words as well as the voice. Orderlies have had speech markers
 * since the hold-up went in; those are people talking, they are deliberately not
 * routed through here, and the contrast is the point.
 *
 * ### Why it reads like a form
 *
 * A silicate is legally a non-subject and speaks as the apparatus rather than as
 * itself: no "I", no contractions, no urgency, and a procedure name where a
 * person would put a feeling. "CONTACT LOGGED" is what a thing says instead of
 * "hey!". The synth does half the work and the register has to do the other half,
 * or it is just a robot voice saying human sentences.
 *
 * Written in capitals because that is how they are drawn on the speech marker,
 * and SAM's reciter is case-insensitive, so the same string serves both.
 */

/** Which of the two silicate voices a guard speaks in. */
export type SilicateVoice = "enforcer" | "drone";

/**
 * SAM's four voice parameters. Named exactly as `sam-js` takes them so this can
 * be handed over unchanged — see the `SamJsOptions` in its `index.d.ts`.
 */
export interface VoicePreset {
  speed: number;
  pitch: number;
  throat: number;
  mouth: number;
}

/**
 * The two presets, picked so the pair is tellable apart with eyes shut.
 *
 * An enforcer is the bigger chassis and gets the lower, slower, chestier voice;
 * a drone is small and fast and sits close to SAM's own "Little Robot". Both are
 * deliberately further apart than the defaults would put them, because in play
 * you hear one of these from off-screen and the only question that matters is
 * which kind of thing is about to come round the corner.
 */
export const VOICE_PRESETS: Record<SilicateVoice, VoicePreset> = {
  enforcer: { speed: 82, pitch: 50, throat: 190, mouth: 120 },
  drone: { speed: 96, pitch: 78, throat: 150, mouth: 200 },
};

/**
 * The lines, by the state a guard has just entered.
 *
 * `PATROL` is absent on purpose. It is the state a guard returns to when nothing
 * is happening, and it is entered constantly — every search that comes up empty,
 * every level load, every guard that loses interest. A line there would be the
 * one the player hears most and the one that means least.
 */
const LINES: Partial<Record<GuardState, readonly string[]>> = {
  CAUTIOUS: ["RESUMING SWEEP", "MARGIN NOTED", "PATTERN IRREGULAR"],
  SUSPICIOUS: ["ANOMALY LOGGED", "VERIFYING", "READING UNCLEAR"],
  ALERT: ["CONTACT LOGGED", "SUBJECT NON COMPLIANT", "COMPLIANCE REQUIRED"],
  SEARCHING: ["CONTACT LOST", "EXPANDING SWEEP", "REPORT POSITION"],
};

/**
 * The line for entering `state`, or `undefined` where that state has none.
 *
 * `roll` is a 0..1 number the caller supplies rather than a `Math.random()` in
 * here, which is what keeps this pure and the test able to name which line it
 * expects. A value at or past 1 wraps to the last line rather than running off
 * the end.
 */
export function barkFor(state: GuardState, roll: number): string | undefined {
  const lines = LINES[state];
  if (!lines || lines.length === 0) return undefined;
  const i = Math.min(lines.length - 1, Math.max(0, Math.floor(roll * lines.length)));
  return lines[i];
}

/** Every line that can be spoken, for pre-rendering them all at boot. */
export function allBarkLines(): string[] {
  return [...new Set(Object.values(LINES).flat())];
}

/**
 * What a guard should do about having just entered a new state.
 *
 * Two fields rather than one, because "say nothing" has two meanings that must
 * not be confused. See {@link decideBark}.
 */
export interface BarkDecision {
  /** The line to speak now, or undefined when this change produces none. */
  line?: string;
  /**
   * Whether to record `next` as spoken-for.
   *
   * False means "come back to this" — the guard is still in a state it owes a
   * line for, and the caller must leave its record of the last spoken state
   * alone so the next frame asks again.
   */
  latch: boolean;
}

/**
 * Whether entering `next` speaks, and whether that answer is final.
 *
 * Pure, and given the roll rather than taking one, for the same reason
 * {@link barkFor} is: this is the whole trigger, and it belongs somewhere a test
 * can name the line it expects without an `AudioContext` or a Phaser scene.
 *
 * The distinction the `latch` field exists for is a bug this replaces. The
 * caller used to record the new state *before* checking the cooldown, so a line
 * held back by it was marked as already-said and never came out — and the
 * cooldown's whole purpose is the case where several guards enter `ALERT`
 * within a few frames of each other, which is exactly when it was eating them.
 * A suppressed line is deferred, not dropped: it speaks as soon as the cooldown
 * clears, provided the guard is still in the state that earned it.
 *
 * The two silent answers are therefore different. `PATROL` (and any state with
 * no lines) and a non-silicate speaker are *settled* silences — there is nothing
 * to come back for, so they latch. A cooldown is a *pending* one.
 */
export function decideBark(
  prev: GuardState | null,
  next: GuardState,
  cooldownLeft: number,
  roll: number,
  silicate: boolean,
): BarkDecision {
  // Nothing changed: no line, and the caller's record already says `next`.
  if (prev === next) return { latch: true };
  // A human security guard is silent here, and permanently so — these lines are
  // the apparatus talking about itself. See `Enforcer.barkOnStateChange`.
  if (!silicate) return { latch: true };
  const line = barkFor(next, roll);
  if (line === undefined) return { latch: true };
  if (cooldownLeft > 0) return { latch: false };
  return { line, latch: true };
}
