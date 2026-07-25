import type { NoteChain } from "../effects";
import type { Instrument } from "../types";

export interface VoiceInputs {
  ctx: AudioContext;
  instrument: Instrument;
  chain: NoteChain;
  /** The resolved base pitch for this voice (a chord's pitches are played as independent voices). */
  pitch: number;
  noiseBuffer: AudioBuffer;
}
