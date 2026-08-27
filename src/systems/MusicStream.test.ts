import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MusicStream } from "./MusicStream";
import { MUSIC_TRACKS, soundingBarCount, type BeepBoxSongJson, type MusicTrackId } from "./MusicSongs";

/**
 * The stream against the real songs, on a stand-in for Web Audio.
 *
 * `MusicStream` takes its context and its destination as arguments precisely so
 * this is possible: nothing in it reaches for a global, so the suite can hand it
 * a fake context, pump the processor callback by hand, and listen to what comes
 * out. Which is the one thing worth checking automatically here — that the
 * exports in `public/assets/music/` still make a noise. Everything past that
 * (does it sound good, is it the right song for the room) is a job for ears.
 */

interface FakeNode {
  connect(): void;
  disconnect(): void;
}

interface FakeProcessor extends FakeNode {
  onaudioprocess: ((event: { outputBuffer: FakeBuffer }) => void) | null;
}

class FakeBuffer {
  readonly length: number;
  private readonly channels: Float32Array[];
  constructor(length: number) {
    this.length = length;
    this.channels = [new Float32Array(length), new Float32Array(length)];
  }
  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

function fakeContext(sampleRate = 48000): {
  ctx: AudioContext;
  processors: FakeProcessor[];
  bufferSize: number;
} {
  const processors: FakeProcessor[] = [];
  let bufferSize = 0;
  const ctx = {
    sampleRate,
    currentTime: 0,
    createGain: () => ({
      gain: {
        value: 0,
        cancelScheduledValues: () => {},
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
      },
      connect: () => {},
      disconnect: () => {},
    }),
    createScriptProcessor: (size: number): FakeProcessor => {
      bufferSize = size;
      const node: FakeProcessor = { onaudioprocess: null, connect: () => {}, disconnect: () => {} };
      processors.push(node);
      return node;
    },
  };
  return {
    ctx: ctx as unknown as AudioContext,
    processors,
    get bufferSize() {
      return bufferSize;
    },
  };
}

function songJson(id: MusicTrackId): BeepBoxSongJson {
  const path = new URL(`../../public/${MUSIC_TRACKS[id].path}`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as BeepBoxSongJson;
}

/**
 * Runs the processor callback `count` times and returns the loudest sample seen,
 * or `NaN` if anything unplayable came out.
 *
 * Reduced by hand rather than asserted per sample: a buffer is 8192 frames, and
 * an `expect` on each of them costs more than synthesising them does.
 */
function render(processor: FakeProcessor, size: number, count: number): number {
  let peak = 0;
  for (let i = 0; i < count; i++) {
    const buffer = new FakeBuffer(size);
    processor.onaudioprocess?.({ outputBuffer: buffer });
    for (const channel of [0, 1]) {
      for (const sample of buffer.getChannelData(channel)) {
        if (!Number.isFinite(sample)) return NaN;
        peak = Math.max(peak, Math.abs(sample));
      }
    }
  }
  return peak;
}

describe("MusicStream", () => {
  it("renders every song in the score", () => {
    for (const id of Object.keys(MUSIC_TRACKS) as MusicTrackId[]) {
      const fake = fakeContext();
      const stream = new MusicStream(fake.ctx, fake.ctx.destination, songJson(id));
      // Three buffers — half a second at 48kHz, inside the first bar of all four.
      expect(render(fake.processors[0], fake.bufferSize, 3)).toBeGreaterThan(0.01);
      stream.stop();
    }
  });

  it("loops the whole song rather than the exported bracket", () => {
    // The main theme's export marks bars 8-13 of 38. A stream that honoured that
    // would loop six bars and never reach the rest of the song.
    const json = songJson("articleZeroTheme");
    const fake = fakeContext();
    const stream = new MusicStream(fake.ctx, fake.ctx.destination, json);
    expect(stream.loopBars).toBe(soundingBarCount(json));
    expect(stream.loopBars).toBeGreaterThan(14);
    stream.stop();
  });

  it("stops rendering once stopped", () => {
    const fake = fakeContext();
    const stream = new MusicStream(fake.ctx, fake.ctx.destination, songJson("vent4Freakout"));
    stream.stop();
    expect(fake.processors[0].onaudioprocess).toBeNull();
  });
});
