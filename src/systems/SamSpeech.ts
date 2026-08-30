/**
 * Everything about SAM the synthesiser, as opposed to what any one speaker says.
 *
 * `src/systems/SilicateBarks.ts` owns a guard's lines and which of the two guard
 * voices says them; `src/ui/Codec.ts` owns EIRA-7's. Both end up here, because
 * the voice parameters and the text SAM can actually pronounce are properties of
 * the 1982 synthesiser rather than of either speaker.
 *
 * Pure and headless, like everything else under `src/systems/` —
 * `src/systems/AudioDirector.ts` is what makes a noise.
 */

/**
 * SAM's four voice parameters. Named exactly as `sam-js` takes them so this can
 * be handed over unchanged — see the `SamJsOptions` in its `index.d.ts`.
 *
 * **`speed` is a frame-duration multiplier, so a higher number is a *slower*
 * voice.** Easy to read backwards, and worth checking against
 * `SilicateBarks.VOICE_PRESETS` before assuming the numbers there mean what
 * their comment says.
 */
export interface VoicePreset {
  speed: number;
  pitch: number;
  throat: number;
  mouth: number;
}

/** Every voice in the game: the two silicate guards, and EIRA-7. */
export type SynthVoice = "enforcer" | "drone" | "eira";

/**
 * The voices.
 *
 * The guard pair is picked so it is tellable apart with eyes shut — you hear one
 * of these from off-screen and the only question that matters is which kind of
 * thing is about to come round the corner. `SilicateBarks` re-exports exactly
 * those two, so the warm-up sweep that pre-renders every bark keeps rendering
 * twelve short lines in two voices and does not touch EIRA-7's.
 *
 * **EIRA-7 is deliberately the same synthesiser.** She is the same technology as
 * the things hunting Rowan, and the run's whole question is what separates them;
 * giving her a different instrument would answer it in the sound design before
 * the Tribunal got to. What separates her is the register — she speaks in
 * sentences, says "I", uses contractions, asks questions — and a voice you can
 * tell from a guard's inside a syllable:
 *
 * - **faster than either guard** (68 against 82 and 96 — lower is faster), because
 *   she talks in paragraphs and they talk in stamped phrases;
 * - **pitched under the drone** (58), because 25 seconds of a shrill voice is a
 *   punishment rather than a performance;
 * - **a wider mouth than the enforcer** (150 against 120), which is diction: it
 *   has to survive full sentences, not four words of compliance-speak.
 */
export const SYNTH_VOICES: Record<SynthVoice, VoicePreset> = {
  enforcer: { speed: 82, pitch: 50, throat: 190, mouth: 120 },
  drone: { speed: 96, pitch: 78, throat: 150, mouth: 200 },
  eira: { speed: 68, pitch: 58, throat: 120, mouth: 150 },
};

/**
 * The typographic characters the game's prose actually uses, and what SAM should
 * be handed instead.
 *
 * A dash becomes a comma rather than nothing because the comma *is* the pause the
 * dash was doing — "they will call it Alignment, they will say no subject was
 * harmed" reads aloud the way the line is written.
 */
const TRANSLITERATIONS: readonly (readonly [RegExp, string])[] = [
  // The space *before* the mark is eaten with it: prose spaces a dash on both
  // sides, and a comma that keeps the left one reads as " , " — which SAM will
  // happily pronounce as a pause in the wrong place.
  [/\s*[—–]\s*/g, ", "], // em dash, en dash
  [/\s*…/g, "."], // ellipsis
  [/[“”]/g, '"'], // curly double quotes
  [/[‘’]/g, "'"], // curly single quotes / apostrophe
];

/**
 * Rewrites text into something SAM's reciter will actually pronounce.
 *
 * **SAM rejects every non-ASCII character**, and it does it silently: `buf32`
 * hands back `false` for the whole line rather than skipping the offending
 * glyph, so one em dash costs the entire sentence. Probed character by character
 * against `sam-js@0.3.1`: `—` `–` `“` `”` `‘` `’` `…` `·` are all refused, while
 * every ASCII punctuation mark it was tried with — `-` `:` `;` `(` `)` `"` `'`
 * `,` `.` `?` `!` `/` and the digits — is accepted.
 *
 * That is not a hypothetical. Three of the codec's lines carry an em dash or a
 * curly quote, including the two that state the run's premise, and every one of
 * them rendered as silence before this existed.
 *
 * So: transliterate what the prose uses, drop whatever is still outside ASCII
 * rather than trusting the list to be complete, and collapse the whitespace that
 * leaves behind.
 */
export function sanitizeForSam(text: string): string {
  let out = text;
  for (const [pattern, replacement] of TRANSLITERATIONS) out = out.replace(pattern, replacement);
  // Anything still outside printable ASCII would take its whole line down.
  out = out.replace(/[^\x20-\x7E]/g, " ");
  out = out.replace(/\s+/g, " ");
  // A dropped glyph can leave a comma orphaned at the front, or floated off the
  // word it belonged to.
  return out.replace(/\s+([,.])/g, "$1").replace(/^[\s,.]+/, "").trim();
}

/**
 * Who is speaking a line of the codec.
 *
 * `mesh` is the facility annotating EIRA-7's transmission from inside it, and it
 * covers exactly one line today. It is a speaker rather than a special case so
 * that neither the writing nor the mixer has to know which line that is.
 */
export type CodecSpeaker = "eira" | "mesh";

/** A single run of codec speech, and who says it. */
export interface CodecUtterance {
  speaker: CodecSpeaker;
  /** One unwrapped run of prose. Sanitised on the way to SAM, not here. */
  prose: string;
}

/**
 * Which synthesiser voice each codec speaker gets.
 *
 * The mesh borrows the enforcer's, and that is the point rather than a
 * convenience: when the facility cuts into her transmission to correct the word
 * "afraid", it does it in the voice of the things patrolling the corridor.
 */
export const SPEAKER_VOICES: Record<CodecSpeaker, SynthVoice> = {
  eira: "eira",
  mesh: "enforcer",
};
