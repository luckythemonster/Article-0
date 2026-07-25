import type { EnvelopeAssignment, FilterPoint, Instrument } from "./types";
import type { ScheduledPoint } from "./schedule";
import { envelopeGainAt, parseEnvelope } from "./envelopes";

export interface EffectsContext {
  ctx: AudioContext;
  instrument: Instrument;
  destination: AudioNode;
  reverbNode: ConvolverNode;
  secondsPerTick: number;
}

/** The per-note audio graph: where a raw voice generator should connect, its timing, and how to cut it short. */
export interface NoteChain {
  input: AudioNode;
  startTime: number;
  /** When the note's own volume automation ends (its sustain point) — voices sustain up to roughly here. */
  noteEnd: number;
  /** When the release tail finishes and the generator should have fully stopped. */
  stopTime: number;
  release: (at: number) => void;
  /** Disconnects every node this chain allocated. Safe to call once, after stopTime. */
  dispose: () => void;
}

function biquadType(type: FilterPoint["type"]): BiquadFilterType {
  return type === "low-pass" ? "lowpass" : type === "high-pass" ? "highpass" : "peaking";
}

function buildFilterChain(
  ctx: AudioContext,
  filters: FilterPoint[] | undefined,
  input: AudioNode,
): { output: AudioNode; nodes: BiquadFilterNode[] } {
  let node: AudioNode = input;
  const nodes: BiquadFilterNode[] = [];
  for (const f of filters ?? []) {
    const biquad = ctx.createBiquadFilter();
    biquad.type = biquadType(f.type);
    biquad.frequency.value = f.cutoffHz;
    if (biquad.type === "peaking") biquad.gain.value = 20 * Math.log10(Math.max(0.0001, f.linearGain));
    node.connect(biquad);
    node = biquad;
    nodes.push(biquad);
  }
  return { output: node, nodes };
}

function findEnvelope(instrument: Instrument, target: EnvelopeAssignment["target"]): EnvelopeAssignment | undefined {
  return instrument.envelopes?.find((e) => e.target === target);
}

/**
 * Builds one note's full playback chain: an amplitude envelope (fadeIn, the
 * note's own point-volume automation, a fadeOut release), its eq/note
 * filters (optionally animated by a `noteFilterAllFreqs` envelope), and
 * chorus/reverb sends into `destination`. `points` are the segment-relative
 * timings schedule.ts produces; `segmentAnchor` is the absolute AudioContext
 * time the note's segment (intro, or this loop iteration) begins at, and
 * `staggerSeconds` shifts the whole note for a "strum" chord pitch.
 */
export function buildNoteChain(
  { ctx, instrument, destination, reverbNode, secondsPerTick }: EffectsContext,
  segmentAnchor: number,
  points: ScheduledPoint[],
  staggerSeconds = 0,
): NoteChain {
  const first = points[0];
  const last = points[points.length - 1];
  const startTime = segmentAnchor + first.seconds + staggerSeconds;
  const noteEnd = segmentAnchor + last.seconds + staggerSeconds;

  const fadeIn = Math.max(0, instrument.fadeInSeconds ?? 0);
  const releaseSeconds = Math.max(1, instrument.fadeOutTicks ?? 0) * secondsPerTick;
  const stopTime = Math.max(noteEnd + releaseSeconds, startTime + 0.02);

  const disposables: AudioNode[] = [];

  const gain = ctx.createGain();
  disposables.push(gain);
  const firstVolume = Math.max(0.0001, first.volume);
  gain.gain.setValueAtTime(0.0001, startTime);
  if (fadeIn > 0.001) gain.gain.linearRampToValueAtTime(firstVolume, startTime + fadeIn);
  else gain.gain.setValueAtTime(firstVolume, startTime);
  for (const p of points) {
    const t = segmentAnchor + p.seconds + staggerSeconds;
    if (t > startTime + fadeIn + 0.0001) gain.gain.linearRampToValueAtTime(Math.max(0.0001, p.volume), t);
  }
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), noteEnd);
  gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

  const { output: eqOut, nodes: eqNodes } = buildFilterChain(ctx, instrument.eqFilter, gain);
  disposables.push(...eqNodes);

  let postFilter = eqOut;
  if (instrument.effects?.includes("note filter") && instrument.noteFilter?.length) {
    const { output: noteOut, nodes: noteNodes } = buildFilterChain(ctx, instrument.noteFilter, eqOut);
    disposables.push(...noteNodes);
    postFilter = noteOut;

    const filterEnvelope = findEnvelope(instrument, "noteFilterAllFreqs");
    if (filterEnvelope) {
      const shape = parseEnvelope(filterEnvelope.envelope);
      const duration = Math.max(0.01, stopTime - startTime);
      const steps = 24;
      for (const node of noteNodes) {
        const base = node.frequency.value;
        node.frequency.cancelScheduledValues(startTime);
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * duration;
          const level = 0.3 + 0.7 * envelopeGainAt(shape, t, duration);
          node.frequency.linearRampToValueAtTime(Math.max(20, base * level), startTime + t);
        }
      }
    }
  }

  const volumeGain = ctx.createGain();
  disposables.push(volumeGain);
  volumeGain.gain.value = (instrument.volume ?? 80) / 100;
  postFilter.connect(volumeGain);
  volumeGain.connect(destination);

  if (instrument.effects?.includes("chorus") && instrument.chorus) {
    const chorusMix = instrument.chorus / 100;
    for (const detuneMs of [6, -9]) {
      const delay = ctx.createDelay(0.05);
      delay.delayTime.value = 0.015 + Math.abs(detuneMs) / 4000;
      const chorusGain = ctx.createGain();
      chorusGain.gain.value = chorusMix * 0.5;
      volumeGain.connect(delay);
      delay.connect(chorusGain);
      chorusGain.connect(destination);
      disposables.push(delay, chorusGain);
    }
  }

  if (instrument.effects?.includes("reverb") && instrument.reverb) {
    const send = ctx.createGain();
    send.gain.value = (instrument.reverb / 100) * 0.6;
    volumeGain.connect(send);
    send.connect(reverbNode);
    disposables.push(send);
  }

  return {
    input: gain,
    startTime,
    noteEnd,
    stopTime,
    release: (at: number) => {
      const v = Math.max(0.0001, gain.gain.value);
      gain.gain.cancelScheduledValues(at);
      gain.gain.setValueAtTime(v, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.02);
    },
    dispose: () => {
      for (const node of disposables) node.disconnect();
    },
  };
}

/** Applies vibrato (a detune LFO) to one oscillator, if the instrument has it. Returns a handle to stop the LFO. */
export function applyVibrato(
  ctx: AudioContext,
  instrument: Instrument,
  oscillator: OscillatorNode,
  startTime: number,
): { stop: (at: number) => void } | undefined {
  if (!instrument.effects?.includes("vibrato") || !instrument.vibrato) return undefined;
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = instrument.vibrato === "shaky" ? 7 : 5.5;
  const depth = ctx.createGain();
  const targetDepth = instrument.vibrato === "shaky" ? 25 : 18;
  if (instrument.vibrato === "delayed") {
    depth.gain.setValueAtTime(0, startTime);
    depth.gain.linearRampToValueAtTime(targetDepth, startTime + 0.4);
  } else {
    depth.gain.setValueAtTime(targetDepth, startTime);
  }
  lfo.connect(depth);
  depth.connect(oscillator.detune);
  lfo.start(startTime);
  return {
    stop: (at: number) => {
      try {
        lfo.stop(at);
      } catch {
        // already stopped
      }
    },
  };
}
