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
 * voice.** It is the one parameter here that runs backwards, and reading it
 * forwards is not a hypothetical mistake: the two guard presets shipped with
 * their speeds the wrong way round for exactly that reason, described and
 * asserted as the opposite of what they did. Check a change by ear, or by the
 * length of the buffer it renders.
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
 * thing is about to come round the corner. An enforcer is the bigger chassis and
 * gets the lower, slower, chestier voice; a drone is small and quick. Both are
 * deliberately further apart than SAM's own defaults would put them.
 *
 * **Their speeds were the wrong way round until now.** `speed` is a
 * frame-duration multiplier — higher is slower — and the two were assigned as if
 * higher meant faster, so the drone was the *slower* of the pair by about 15%
 * for the length of a line while every comment and the test said otherwise. The
 * values are the two the pair was authored with; only which guard gets which has
 * changed, so the pair is exactly as far apart as it was meant to be.
 *
 * `SilicateBarks` re-exports exactly these two, so the warm-up sweep that
 * pre-renders every bark keeps rendering twelve short lines in two voices and
 * does not touch EIRA-7's.
 *
 * **EIRA-7 is deliberately the same synthesiser.** She is the same technology as
 * the things hunting Rowan, and the run's whole question is what separates them;
 * giving her a different instrument would answer it in the sound design before
 * the Tribunal got to. What separates her is the register — she speaks in
 * sentences, says "I", uses contractions, asks questions — and a voice you can
 * tell from a guard's inside a syllable:
 *
 * - **faster than either guard** (60 against 82 and 96 — lower is faster), because
 *   she talks in paragraphs and they talk in stamped phrases;
 * - **throat and mouth both at the ceiling** (255, against the enforcer's
 *   190/120 and the drone's 150/200). Those two are SAM's formant frequencies,
 *   so maxing both is the largest, most open vocal tract the synthesiser has.
 *   Next to it the guards are narrow and clipped — which is the distinction
 *   doing the work here: hers is the one voice in the game shaped like a body
 *   rather than like an announcement;
 * - **pitched up** (66), above the enforcer's 50 and under the drone's 78 —
 *   between an appliance announcing itself and someone talking.
 *
 * Tuned by ear across two passes: `68/58/120/150` first, then `60/66/95/150`,
 * which took the resonance out rather than opening it up and turned out to be
 * the wrong end of the dial. These four numbers are the whole performance, so
 * they are the thing to move if she is still not right — nothing else about the
 * narration needs to change with them, and nothing else in the audio path reads
 * them.
 */
export const SYNTH_VOICES: Record<SynthVoice, VoicePreset> = {
  enforcer: { speed: 96, pitch: 50, throat: 190, mouth: 120 },
  drone: { speed: 82, pitch: 78, throat: 150, mouth: 200 },
  eira: { speed: 60, pitch: 66, throat: 255, mouth: 255 },
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
