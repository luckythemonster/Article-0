/** The subset of the BeepBox v9 JSON export format this player actually reads. */

export interface FilterPoint {
  type: "low-pass" | "high-pass" | "peak";
  cutoffHz: number;
  linearGain: number;
}

export interface EnvelopeAssignment {
  target: "noteFilterAllFreqs" | "operatorAmplitude" | "feedbackAmplitude";
  /** e.g. "swell 2", "twang 3", "flare 1", "decay 2". */
  envelope: string;
  /** Which operator this targets, for operatorAmplitude assignments. */
  index?: number;
}

export interface Operator {
  /** A ratio string like "4×" or a detuned variant like "~1×". */
  frequency: string;
  amplitude: number;
}

export interface Drum {
  filterEnvelope: string;
  spectrum: number[];
}

export interface Instrument {
  type: "FM" | "Picked String" | "spectrum" | "harmonics" | "drumset";
  volume: number;
  eqFilter: FilterPoint[];
  effects: string[];
  noteFilter?: FilterPoint[];
  chorus?: number;
  reverb?: number;
  fadeInSeconds: number;
  fadeOutTicks: number;
  algorithm?: string;
  feedbackType?: string;
  feedbackAmplitude?: number;
  operators?: Operator[];
  envelopes: EnvelopeAssignment[];
  harmonics?: number[];
  stringSustain?: number;
  vibrato?: string;
  chord?: string;
  spectrum?: number[];
  drums?: Drum[];
}

export interface Point {
  tick: number;
  pitchBend: number;
  volume: number;
}

export interface Note {
  pitches: number[];
  points: Point[];
  continuesLastPattern?: boolean;
}

export interface Pattern {
  notes: Note[];
  /** 1-indexed positions into the channel's instruments[]. */
  instruments: number[];
}

export interface Channel {
  type: "pitch" | "drum";
  instruments: Instrument[];
  patterns: Pattern[];
  /** Bar-by-bar pattern index: 0 = silent bar, N>0 = patterns[N-1]. */
  sequence: number[];
}

export interface Song {
  format: "BeepBox";
  version: number;
  introBars: number;
  loopBars: number;
  beatsPerBar: number;
  ticksPerBeat: number;
  beatsPerMinute: number;
  channels: Channel[];
}
