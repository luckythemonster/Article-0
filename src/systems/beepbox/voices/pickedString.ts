import { pitchToFrequency } from "../pitch";
import type { VoiceInputs } from "./types";

/**
 * A real Karplus-Strong plucked string: a short noise burst excites a
 * delay-line feedback loop (delay = 1/frequency) with a lowpass damping the
 * loop each pass, `stringSustain` controlling the feedback gain and so how
 * long the string rings.
 */
export function playPickedString({ ctx, instrument, chain, pitch, noiseBuffer }: VoiceInputs): void {
  const freq = Math.max(20, pitchToFrequency(pitch));
  const delay = ctx.createDelay(1);
  delay.delayTime.value = Math.min(1, 1 / freq);

  const damping = ctx.createBiquadFilter();
  damping.type = "lowpass";
  damping.frequency.value = Math.min(9000, freq * 10 + 1500);

  const sustain = instrument.stringSustain ?? 70;
  const feedbackGain = ctx.createGain();
  feedbackGain.gain.value = Math.min(0.995, 0.9 + (sustain / 100) * 0.095);

  const excitation = ctx.createBufferSource();
  excitation.buffer = noiseBuffer;
  const excitationGain = ctx.createGain();
  excitationGain.gain.setValueAtTime(0, chain.startTime);
  excitationGain.gain.linearRampToValueAtTime(1, chain.startTime + 0.002);
  excitationGain.gain.linearRampToValueAtTime(0, chain.startTime + 0.012);

  excitation.connect(excitationGain);
  excitationGain.connect(delay);
  delay.connect(damping);
  damping.connect(feedbackGain);
  feedbackGain.connect(delay);
  damping.connect(chain.input);

  excitation.start(chain.startTime);
  excitation.stop(chain.startTime + 0.02);
}
