import { describe, it, expect } from "vitest";
import { buildTimeline, secondsPerTickFor, ticksPerBarFor, strumOffsetSeconds } from "./schedule";
import type { Channel, Pattern, Song } from "./types";

/** beatsPerBar=4, ticksPerBeat=4 -> ticksPerBar=16; bpm=120 -> secondsPerTick=0.125, barSeconds=2. */
function songWith(channels: Channel[], introBars: number, loopBars: number): Song {
  return {
    format: "BeepBox",
    version: 9,
    introBars,
    loopBars,
    beatsPerBar: 4,
    ticksPerBeat: 4,
    beatsPerMinute: 120,
    channels,
  };
}

function pattern(instruments: number[], notes: Pattern["notes"]): Pattern {
  return { instruments, notes };
}

function note(pitches: number[], ticks: [number, number]) {
  return {
    pitches,
    points: [
      { tick: ticks[0], pitchBend: 0, volume: 100 },
      { tick: ticks[1], pitchBend: 0, volume: 100 },
    ],
  };
}

describe("secondsPerTickFor / ticksPerBarFor", () => {
  it("derives tick timing from bpm/beatsPerBar/ticksPerBeat", () => {
    const song = songWith([], 1, 1);
    expect(ticksPerBarFor(song)).toBe(16);
    expect(secondsPerTickFor(song)).toBeCloseTo(0.125, 5);
  });
});

describe("buildTimeline", () => {
  it("treats sequence value 0 as a silent bar", () => {
    const channel: Channel = {
      type: "pitch",
      instruments: [],
      patterns: [pattern([1], [note([60], [0, 8])])],
      sequence: [1, 0],
    };
    const timeline = buildTimeline(songWith([channel], 1, 1));
    expect(timeline.channels[0].introNotes).toHaveLength(1);
    expect(timeline.channels[0].loopNotes).toHaveLength(0);
  });

  it("maps sequence value N to patterns[N-1]", () => {
    const channel: Channel = {
      type: "pitch",
      instruments: [],
      patterns: [pattern([1], [note([60], [0, 8])]), pattern([1], [note([48], [0, 16])])],
      sequence: [1, 2],
    };
    const timeline = buildTimeline(songWith([channel], 1, 1));
    expect(timeline.channels[0].introNotes[0].pitches).toEqual([60]);
    expect(timeline.channels[0].loopNotes[0].pitches).toEqual([48]);
  });

  it("ignores sequence bars beyond introBars+loopBars", () => {
    const channel: Channel = {
      type: "pitch",
      instruments: [],
      patterns: [pattern([1], [note([60], [0, 8])]), pattern([1], [note([48], [0, 8])])],
      // 4 entries, but introBars+loopBars = 2: the trailing "1, 1" must never be scheduled.
      sequence: [1, 2, 1, 1],
    };
    const timeline = buildTimeline(songWith([channel], 1, 1));
    expect(timeline.channels[0].introNotes).toHaveLength(1);
    expect(timeline.channels[0].loopNotes).toHaveLength(1);
    expect(timeline.channels[0].loopNotes[0].pitches).toEqual([48]);
  });

  it("pads a sequence shorter than introBars+loopBars as silent", () => {
    const channel: Channel = {
      type: "pitch",
      instruments: [],
      patterns: [pattern([1], [note([60], [0, 8])])],
      sequence: [1], // no entry for the loop bar
    };
    const timeline = buildTimeline(songWith([channel], 1, 1));
    expect(timeline.channels[0].introNotes).toHaveLength(1);
    expect(timeline.channels[0].loopNotes).toHaveLength(0);
  });

  it("computes absolute-tick timing relative to each bar's own segment", () => {
    const channel: Channel = {
      type: "pitch",
      instruments: [],
      patterns: [pattern([1], [note([60], [0, 8])]), pattern([1], [note([48], [0, 8])])],
      sequence: [1, 2],
    };
    const timeline = buildTimeline(songWith([channel], 1, 1));
    // Intro bar 0: local tick 0 -> 0s, tick 8 -> 1s (8 * 0.125).
    expect(timeline.channels[0].introNotes[0].points[0].seconds).toBeCloseTo(0, 5);
    expect(timeline.channels[0].introNotes[0].points[1].seconds).toBeCloseTo(1, 5);
    // Loop bar (absolute bar 1) is time-based relative to the loop's own start, not bar 1's
    // absolute position, so it also starts at 0s within the loop segment.
    expect(timeline.channels[0].loopNotes[0].points[0].seconds).toBeCloseTo(0, 5);
    expect(timeline.introSeconds).toBeCloseTo(2, 5);
    expect(timeline.loopSeconds).toBeCloseTo(2, 5);
  });

  it("preserves multiple simultaneous instruments on a pattern", () => {
    const channel: Channel = {
      type: "pitch",
      instruments: [],
      patterns: [pattern([1, 2], [note([60], [0, 8])])],
      sequence: [1, 0],
    };
    const timeline = buildTimeline(songWith([channel], 1, 1));
    expect(timeline.channels[0].introNotes[0].instrumentIndices).toEqual([0, 1]);
  });
});

describe("strumOffsetSeconds", () => {
  it("staggers later chord pitches later, starting at zero", () => {
    expect(strumOffsetSeconds(0)).toBe(0);
    expect(strumOffsetSeconds(1)).toBeGreaterThan(strumOffsetSeconds(0));
    expect(strumOffsetSeconds(2)).toBeGreaterThan(strumOffsetSeconds(1));
  });
});
