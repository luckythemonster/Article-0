import { applyVibrato } from "../effects";
import { pitchToFrequency } from "../pitch";
import type { Instrument } from "../types";
import type { VoiceInputs } from "./types";

/** BeepBox's `harmonics[]` are literally per-partial amplitudes, so this maps directly onto createPeriodicWave. */
const waveCache = new WeakMap<Instrument, PeriodicWave>();

function getPeriodicWave(ctx: AudioContext, instrument: Instrument): PeriodicWave {
  const cached = waveCache.get(instrument);
  if (cached) return cached;
  const harmonics = instrument.harmonics ?? [];
  const real = new Float32Array(harmonics.length + 1);
  const imag = new Float32Array(harmonics.length + 1);
  for (let i = 0; i < harmonics.length; i++) imag[i + 1] = harmonics[i] / 100;
  const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  waveCache.set(instrument, wave);
  return wave;
}

export function playHarmonics({ ctx, instrument, chain, pitch }: VoiceInputs): void {
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(getPeriodicWave(ctx, instrument));
  osc.frequency.value = pitchToFrequency(pitch);
  osc.connect(chain.input);
  const vibrato = applyVibrato(ctx, instrument, osc, chain.startTime);
  osc.start(chain.startTime);
  osc.stop(chain.stopTime);
  vibrato?.stop(chain.stopTime);
}
