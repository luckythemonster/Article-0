import type { NoteChain } from "../effects";
import type { VoiceInputs } from "./types";

/** Representative band centers spanning a BeepBox 30-bin spectrum array's audible range. */
const BANDS = [180, 400, 900, 2000, 4500, 9000];

function bandWeight(spectrum: number[], centerIndex: number, spanBins: number): number {
  const from = Math.max(0, centerIndex - spanBins);
  const to = Math.min(spectrum.length - 1, centerIndex + spanBins);
  let sum = 0;
  let count = 0;
  for (let i = from; i <= to; i++) {
    sum += spectrum[i] ?? 0;
    count++;
  }
  return count > 0 ? sum / count / 100 : 0;
}

/**
 * Shapes one shared noise buffer through a handful of bandpass filters
 * weighted by a BeepBox spectrum array, instead of one real filter per
 * original 30-bin — cheap enough to use for both the `spectrum` instrument
 * type and each of a `drumset`'s 12 per-drum spectra.
 */
export function playSpectrumLike(
  { ctx, chain, noiseBuffer }: { ctx: AudioContext; chain: NoteChain; noiseBuffer: AudioBuffer },
  spectrum: number[],
): void {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;

  const binsPerBand = Math.max(1, Math.floor(spectrum.length / BANDS.length));
  let connected = false;
  BANDS.forEach((freq, i) => {
    const weight = bandWeight(spectrum, i * binsPerBand + Math.floor(binsPerBand / 2), Math.ceil(binsPerBand / 2));
    if (weight <= 0.01) return;
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = freq;
    bandpass.Q.value = 1.1;
    const bandGain = ctx.createGain();
    bandGain.gain.value = weight;
    source.connect(bandpass);
    bandpass.connect(bandGain);
    bandGain.connect(chain.input);
    connected = true;
  });
  if (!connected) source.connect(chain.input);

  source.start(chain.startTime);
  source.stop(chain.stopTime);
}

export function playSpectrum({ ctx, instrument, chain, noiseBuffer }: VoiceInputs): void {
  playSpectrumLike({ ctx, chain, noiseBuffer }, instrument.spectrum ?? []);
}
