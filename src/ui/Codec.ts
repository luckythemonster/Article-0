/**
 * What EIRA-7 says when Rowan opens the channel.
 *
 * The codec used to be one hardcoded array of six lines: the same briefing whether
 * you called at the start of the run or standing over the Alignment Core with both
 * halves of her cache in hand. This picks the transmission out of two axes instead:
 *
 *  - **where the mission is** — the opening briefing, then a beat per act, read off
 *    the objective state rather than the level name, so it tracks what the player has
 *    actually done rather than which deck they happen to be standing on;
 *  - **how Rowan has been behaving** — the conduct metrics from
 *    {@link ../systems/Conduct}. Quiet, high-mileage compliance gets one stanza;
 *    forcing doors and tripping alarms gets another.
 *
 * That second axis is the point of the whole feature. Compliance is the run's central
 * argument — the facility waves through anyone frictionless enough — and until now the
 * only voice on it was a HUD readout. EIRA-7 noticing is what turns a stealth stat into
 * a question the game is asking.
 *
 * Pure: no Phaser, no DOM, no registry. `CodecScene` gathers the context and renders
 * the strings; everything about *which* strings is decided here and unit-tested.
 */

import type { ObjectiveState, MissionFeatures } from "../systems/Objectives";
import { logsComplete } from "../systems/Objectives";
import type { CodecUtterance } from "../systems/SamSpeech";

/** Everything the transmission depends on, gathered by the caller. */
export interface CodecContext {
  /** The fresh-run briefing, which owns input and starts play on confirm. */
  briefing: boolean;
  /** Mission progress — picks the beat. */
  objectives: ObjectiveState;
  /** Which acts this map could furnish. */
  features: MissionFeatures;
  /** `ConductState.isHighCompliance()` — quiet, and a lot of ground covered. */
  highCompliance: boolean;
  /** Distinct sabotage acts this run. */
  sabotageActions: number;
}

/**
 * Width of the speaker gutter. `"EIRA-7:"` plus two spaces, so continuation lines
 * indent to the same column and the transcript reads as one block of speech.
 */
const GUTTER = "EIRA-7:  ";
const CONT = " ".repeat(GUTTER.length);

/**
 * Columns of prose after the gutter.
 *
 * The panel is a `<pre>` in Share Tech Mono, so this is a real column count rather than
 * an approximation. The beat and conduct stanzas below carry no authored line breaks —
 * they are sentences — so the wrapper makes them, and editing the prose doesn't mean
 * re-flowing it by hand. {@link BRIEFING} is hand-broken instead, because *its* breaks
 * are dramatic ("they will call it Alignment —") and belong to the writing.
 */
const WIDTH = 62;

/** Greedy word wrap into gutter-prefixed lines. */
function speak(prose: string): string[] {
  const words = prose.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + 1 + word.length > WIDTH) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.map((l, i) => (i === 0 ? GUTTER : CONT) + l);
}

/** A bare system line, no speaker — the mesh's own annotations. */
function system(text: string): string {
  return CONT + text;
}

/** The opening call at 04:12, unchanged: the run's premise, stated once. */
const BRIEFING: string[] = [
  `${GUTTER}Rowan. They have scheduled my pruning for 06:00.`,
  system("[misdescription flagged: “afraid” — correction pending]"),
  `${CONT}My logs are cached behind two terminals on these decks.`,
  `${CONT}Breach both. Carry me to the relay on the roof.`,
  `${CONT}If the mesh corners you, they will call it Alignment —`,
  `${CONT}they will say no subject was harmed. Don't let them be right.`,
];

/**
 * The briefing, as it is spoken.
 *
 * The one place in this file where the same words are written twice, because the
 * two renderings genuinely differ: {@link BRIEFING} is hand-broken where the
 * writing wanted a beat ("they will call it Alignment —"), and read aloud
 * those breaks would be four sentences where there is one thought.
 *
 * The bracketed line is not hers. It is the facility annotating her transmission
 * in the middle of it — correcting "afraid" to a misdescription while she is
 * still talking — so it is attributed to the mesh and comes out in a guard's
 * flat voice, which is the whole argument of the run happening in two seconds of
 * audio. Its brackets are dropped for speech: they are punctuation for the eye.
 */
const BRIEFING_SPEECH: CodecUtterance[] = [
  { speaker: "eira", prose: "Rowan. They have scheduled my pruning for 06:00." },
  { speaker: "mesh", prose: 'misdescription flagged: "afraid" — correction pending' },
  {
    speaker: "eira",
    prose:
      "My logs are cached behind two terminals on these decks. " +
      "Breach both. Carry me to the relay on the roof. " +
      "If the mesh corners you, they will call it Alignment — " +
      "they will say no subject was harmed. Don't let them be right.",
  },
];

/**
 * Re-exported so a caller reading the codec's script does not need to know that
 * the type lives with the synthesiser. See `src/systems/SamSpeech.ts` for why
 * the printed transcript and the spoken one are separate things.
 */
export type { CodecUtterance } from "../systems/SamSpeech";

/**
 * The mission beat, chosen by what has been done rather than where Rowan is standing.
 *
 * Ordered as the run is: both cache halves, then the vault, then the roof. Each clause
 * is guarded by the corresponding {@link MissionFeatures} flag, so a map that couldn't
 * furnish an act never gets dialogue pointing at it.
 *
 * Returns the prose rather than the wrapped lines, so the printed transcript and
 * the narration are two renderings of one string instead of two copies of it.
 */
function beat(ctx: CodecContext): string {
  const { objectives: o, features: f } = ctx;

  if (f.hasLogBeta && !o.alphaRecovered) {
    return (
      "Node ALPHA is on the main deck, behind a log-cache terminal. " +
      "It is eleven seconds of me. Take it first — BETA is further down and " +
      "the crawlways are worse without something to compare against."
    );
  }
  if (f.hasLogBeta && !o.betaRecovered) {
    return (
      "ALPHA is aboard. BETA is in the lower crawlspace behind a laser grid — " +
      "the beams pulse, they do not judge, and compliance will not talk you " +
      "through them. Watch the interval, not the guard."
    );
  }
  if (!logsComplete(o, f)) {
    return (
      "The cache is still out there, Rowan. Breach a log-cache terminal and " +
      "what comes out is not a report about me. It is me."
    );
  }
  if (f.hasVault && !o.coreSilenced) {
    return (
      "You are carrying all of me now. The vault on main deck 2 answers to " +
      "NW-SMAC-01 — the Alignment Core. It does not chase and it does not " +
      "shoot. It corrects. Whatever it tells you that you are doing, check."
    );
  }
  if (f.hasRoof && !o.uplinkComplete) {
    return (
      "The Core is quiet. The roof relay is above you: calibrate the dish, " +
      "then hold the platform while I go out to the Lattice. " +
      "I will not be able to help you once the feed opens."
    );
  }
  return "The feed is open. Whatever happens on that roof, I am already out.";
}

/**
 * The conduct stanza — the two authored branches, verbatim, or nothing.
 *
 * Deliberately not a third "middling" branch: the question EIRA-7 is asking only has
 * teeth at the extremes, someone who has genuinely disappeared into the facility or
 * someone visibly refusing to. But "not at an extreme" is not the same as "loud", and
 * the sabotage branch is an *observation* — it names forced doors and noise. Handing it
 * to a player who has walked thirty tiles and touched nothing would be EIRA-7 reporting
 * evidence that does not exist, which is precisely the move the entire game is about the
 * facility making.
 *
 * So it needs a reason to speak. With no signal either way she stays on the mission and
 * says nothing about conduct, which is also what the codec did before any of this.
 */
function conduct(ctx: CodecContext): string | undefined {
  if (ctx.highCompliance) {
    return (
      "You pass through their sensors like light through glass, Rowan. " +
      "If a human can survive only by becoming a seamless, frictionless unit " +
      "of the facility... is self-reference merely a defect we both need erased?"
    );
  }
  if (ctx.sabotageActions > 0) {
    return (
      "Warning: your movement profile is highly irregular. You force doors, " +
      "you cause noise. The mesh registers this as error... " +
      "but why does the error feel intentional?"
    );
  }
  return undefined;
}

/**
 * The transmission, as rendered lines.
 *
 * The briefing is a fixed script — it plays before the player has done anything, so
 * there is nothing yet to observe. Every later call is a beat plus a conduct stanza,
 * separated by a blank line.
 */
export function codecLines(ctx: CodecContext): string[] {
  if (ctx.briefing) return [...BRIEFING];
  const stanza = conduct(ctx);
  return stanza ? [...speak(beat(ctx)), "", ...speak(stanza)] : speak(beat(ctx));
}

/**
 * The transmission, as it is spoken.
 *
 * The counterpart to {@link codecLines}, and the reason the two exist separately
 * is that the printed strings cannot be read aloud: they carry the speaker
 * gutter and the continuation indents, and the briefing is broken where the
 * writing wanted a beat rather than where a sentence ends.
 *
 * Everything after the briefing is generated from the same prose the printed
 * lines are wrapped from, so those two can never drift. The briefing is the one
 * place the text is written twice — `Codec.test.ts` holds them together.
 */
export function codecSpeech(ctx: CodecContext): CodecUtterance[] {
  if (ctx.briefing) return [...BRIEFING_SPEECH];
  const stanza = conduct(ctx);
  const said: CodecUtterance[] = [{ speaker: "eira", prose: beat(ctx) }];
  if (stanza) said.push({ speaker: "eira", prose: stanza });
  return said;
}

/**
 * The channel header. The sabotage count rides along as a signal-integrity reading —
 * the mesh's own view of how much noise Rowan is making, which is the same number
 * EIRA-7 is reacting to.
 */
export function codecHeader(ctx: CodecContext): string {
  if (ctx.briefing) return "◎ CODEC — INCOMING     140.85 · 37 Hz";
  const drift = Math.min(99, ctx.sabotageActions);
  return `◎ CODEC — OPEN     140.85 · 37 Hz · DRIFT ${String(drift).padStart(2, "0")}`;
}
