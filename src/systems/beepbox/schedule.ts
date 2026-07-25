import type { Channel, Song } from "./types";

export interface ScheduledPoint {
  /** Seconds since the start of the segment (intro, or this loop iteration) this note belongs to. */
  seconds: number;
  pitchBend: number;
  /** Normalized 0-1 (BeepBox's own point volume is 0-100). */
  volume: number;
}

export interface ScheduledNote {
  channelIndex: number;
  channelType: "pitch" | "drum";
  /** 0-based indices into the channel's instruments[]. */
  instrumentIndices: number[];
  pitches: number[];
  /** At least 2 points: the note's first (onset) and last (release) automation checkpoints. */
  points: ScheduledPoint[];
}

export interface ChannelTimeline {
  channelIndex: number;
  channelType: "pitch" | "drum";
  introNotes: ScheduledNote[];
  loopNotes: ScheduledNote[];
}

export interface Timeline {
  ticksPerBar: number;
  secondsPerTick: number;
  introSeconds: number;
  loopSeconds: number;
  channels: ChannelTimeline[];
}

export function secondsPerTickFor(song: Song): number {
  return 60 / song.beatsPerMinute / song.ticksPerBeat;
}

export function ticksPerBarFor(song: Song): number {
  return song.beatsPerBar * song.ticksPerBeat;
}

/** Fixed per-pitch onset stagger for a "strum" chord, in seconds. */
export function strumOffsetSeconds(pitchIndex: number, staggerSeconds = 0.02): number {
  return pitchIndex * staggerSeconds;
}

function scheduleSegment(
  channel: Channel,
  channelIndex: number,
  barFrom: number,
  barTo: number,
  segmentBarOffset: number,
  ticksPerBar: number,
  secondsPerTick: number,
): ScheduledNote[] {
  const notes: ScheduledNote[] = [];
  for (let bar = barFrom; bar < barTo; bar++) {
    const seqVal = channel.sequence[bar] ?? 0;
    if (!seqVal) continue;
    const pattern = channel.patterns[seqVal - 1];
    if (!pattern) continue;
    const barOffsetSeconds = (bar - segmentBarOffset) * ticksPerBar * secondsPerTick;
    const instrumentIndices = pattern.instruments.map((i) => i - 1);
    for (const note of pattern.notes) {
      if (note.points.length === 0) continue;
      notes.push({
        channelIndex,
        channelType: channel.type,
        instrumentIndices,
        pitches: note.pitches,
        points: note.points.map((p) => ({
          seconds: barOffsetSeconds + p.tick * secondsPerTick,
          pitchBend: p.pitchBend,
          volume: p.volume / 100,
        })),
      });
    }
  }
  return notes;
}

/**
 * Resolves a song's `sequence`/`patterns` into concrete note timings, split
 * into the intro (bars [0, introBars), played once) and the loop (bars
 * [introBars, introBars+loopBars), repeated forever). Any sequence bars past
 * introBars+loopBars are unused; any channel whose sequence is shorter than
 * that is padded as silent.
 */
export function buildTimeline(song: Song): Timeline {
  const ticksPerBar = ticksPerBarFor(song);
  const secondsPerTick = secondsPerTickFor(song);
  const introBars = song.introBars;
  const loopBars = song.loopBars;

  const channels: ChannelTimeline[] = song.channels.map((channel, channelIndex) => ({
    channelIndex,
    channelType: channel.type,
    introNotes: scheduleSegment(channel, channelIndex, 0, introBars, 0, ticksPerBar, secondsPerTick),
    loopNotes: scheduleSegment(
      channel,
      channelIndex,
      introBars,
      introBars + loopBars,
      introBars,
      ticksPerBar,
      secondsPerTick,
    ),
  }));

  return {
    ticksPerBar,
    secondsPerTick,
    introSeconds: introBars * ticksPerBar * secondsPerTick,
    loopSeconds: loopBars * ticksPerBar * secondsPerTick,
    channels,
  };
}
