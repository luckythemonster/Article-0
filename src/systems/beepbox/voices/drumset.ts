import { envelopeGainAt, parseEnvelope } from "../envelopes";
import { playSpectrumLike } from "./spectrum";
import type { VoiceInputs } from "./types";

/** A drum-channel note's pitch (0-11) selects which of the instrument's 12 `drums[]` slots plays. */
export function playDrumset({ ctx, instrument, chain, pitch, noiseBuffer }: VoiceInputs): void {
  const drum = instrument.drums?.[pitch];
  if (!drum) return;

  const shapedGain = ctx.createGain();
  shapedGain.connect(chain.input);

  const shape = parseEnvelope(drum.filterEnvelope);
  const duration = Math.max(0.01, chain.stopTime - chain.startTime);
  const steps = 20;
  shapedGain.gain.setValueAtTime(0.0001, chain.startTime);
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * duration;
    shapedGain.gain.linearRampToValueAtTime(Math.max(0.0001, envelopeGainAt(shape, t, duration)), chain.startTime + t);
  }

  playSpectrumLike({ ctx, chain: { ...chain, input: shapedGain }, noiseBuffer }, drum.spectrum);
}
