import { buildNoteChain, type NoteChain } from "./effects";
import { buildTimeline, strumOffsetSeconds, type ScheduledNote, type Timeline } from "./schedule";
import { createNoiseBuffer, createReverbImpulse } from "./shared";
import type { Song } from "./types";
import { playVoice } from "./voices";

/** How far ahead of a loop iteration's start we (re-)schedule it. */
const LOOKAHEAD_SECONDS = 2;

/**
 * Plays a BeepBox song live via the Web Audio API: schedules the intro once,
 * then loops the marked loop region forever using a look-ahead re-scheduler
 * (only needed because the loop repeats indefinitely — each individual
 * note's `AudioNode.start(when)` is scheduled exactly, arbitrarily far
 * ahead, same as everywhere else in this synth).
 */
export class BeepBoxSynth {
  private readonly timeline: Timeline;
  private readonly noiseBuffer: AudioBuffer;
  private readonly reverbNode: ConvolverNode;
  private readonly liveChains = new Set<NoteChain>();
  private timer: number | undefined;
  private anchor: number | undefined;
  private iteration = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
    private readonly song: Song,
  ) {
    this.timeline = buildTimeline(song);
    this.noiseBuffer = createNoiseBuffer(ctx);
    this.reverbNode = ctx.createConvolver();
    this.reverbNode.buffer = createReverbImpulse(ctx);
    this.reverbNode.connect(destination);
  }

  /** Starts playback from the intro. A no-op if already playing. */
  play(): void {
    if (this.anchor !== undefined) return;
    void this.ctx.resume();
    const t0 = this.ctx.currentTime + 0.05;
    this.anchor = t0;
    this.iteration = 0;

    this.scheduleIntro(t0);
    if (this.timeline.loopSeconds > 0) {
      this.scheduleLoopIteration(0);
      this.armNextIteration();
    }
  }

  /** Stops playback, releasing every currently-sounding note with a short fade to avoid a click. A no-op if not playing. */
  stop(): void {
    if (this.timer !== undefined) {
      window.clearTimeout(this.timer);
      this.timer = undefined;
    }
    const now = this.ctx.currentTime;
    for (const chain of this.liveChains) chain.release(now);
    this.liveChains.clear();
    this.anchor = undefined;
    this.iteration = 0;
  }

  private armNextIteration(): void {
    if (this.anchor === undefined || this.timeline.loopSeconds <= 0) return;
    const nextIteration = this.iteration + 1;
    const nextStart = this.anchor + this.timeline.introSeconds + nextIteration * this.timeline.loopSeconds;
    const delaySeconds = Math.max(0, nextStart - this.ctx.currentTime - LOOKAHEAD_SECONDS);
    this.timer = window.setTimeout(() => {
      if (this.anchor === undefined) return;
      void this.ctx.resume();
      this.iteration = nextIteration;
      this.scheduleLoopIteration(nextIteration);
      this.armNextIteration();
    }, delaySeconds * 1000);
  }

  private scheduleIntro(segmentAnchor: number): void {
    for (const channel of this.timeline.channels) {
      for (const note of channel.introNotes) this.scheduleNote(note, segmentAnchor);
    }
  }

  private scheduleLoopIteration(iteration: number): void {
    if (this.anchor === undefined) return;
    const segmentAnchor = this.anchor + this.timeline.introSeconds + iteration * this.timeline.loopSeconds;
    for (const channel of this.timeline.channels) {
      for (const note of channel.loopNotes) this.scheduleNote(note, segmentAnchor);
    }
  }

  private scheduleNote(note: ScheduledNote, segmentAnchor: number): void {
    const channelDef = this.song.channels[note.channelIndex];
    if (!channelDef) return;
    for (const instrumentIndex of note.instrumentIndices) {
      const instrument = channelDef.instruments[instrumentIndex];
      if (!instrument) continue;
      const strum = instrument.chord === "strum" && !!instrument.effects?.includes("chord type");
      note.pitches.forEach((pitch, pitchIndex) => {
        const stagger = strum ? strumOffsetSeconds(pitchIndex) : 0;
        const chain = buildNoteChain(
          {
            ctx: this.ctx,
            instrument,
            destination: this.destination,
            reverbNode: this.reverbNode,
            secondsPerTick: this.timeline.secondsPerTick,
          },
          segmentAnchor,
          note.points,
          stagger,
        );
        this.liveChains.add(chain);
        playVoice({ ctx: this.ctx, instrument, chain, pitch, noiseBuffer: this.noiseBuffer });

        const disposeDelayMs = Math.max(0, (chain.stopTime - this.ctx.currentTime) * 1000) + 80;
        window.setTimeout(() => {
          chain.dispose();
          this.liveChains.delete(chain);
        }, disposeDelayMs);
      });
    }
  }
}
