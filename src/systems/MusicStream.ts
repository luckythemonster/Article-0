/**
 * One playing song: a BeepBox `Synth` rendered into the game's own mixer.
 *
 * **Not `Synth.play()`.** That builds a second `AudioContext` and wires a
 * `ScriptProcessorNode` straight to its destination, which would sail past the
 * master gain and mean a muted player still heard the music — the same trap
 * {@link ./AudioDirector.bark} documents for SAM's `speak()`. So this owns the
 * node instead: a processor on the context the rest of the game mixes into,
 * feeding a gain the mood crossfade can ride.
 *
 * The synth is otherwise entirely headless — the only `window` in BeepBox's
 * synthesiser is inside the `activateAudio()` this never calls.
 */
import { Config, Song, Synth } from "beepbox";
import { soundingBarCount, type BeepBoxSongJson } from "./MusicSongs";

/**
 * The processor's buffer, in samples — 171ms at 48kHz, against BeepBox's own
 * choice of 2048.
 *
 * Steady-state a buffer costs 3-6ms to render, but the first time each
 * instrument sounds the engine compiles a synthesis function for it, and those
 * spikes measured up to ~92ms. A callback that overruns its buffer is a dropout,
 * so the buffer has to be long enough to swallow the worst of them: at 8192 the
 * budget is 171ms and they fit; at 4096 it is 85ms and they would not.
 *
 * The latency this buys is of no consequence — nothing here is a sound effect,
 * and the mood crossfades ride the gain node, which stays sample-accurate
 * whatever the buffer length.
 */
const BUFFER_SAMPLES = 8192;

/** BeepBox's own delay-line sizing, which it keeps to itself (`private`). */
function fittingPowerOfTwo(x: number): number {
  return 1 << (32 - Math.clz32(Math.ceil(x) - 1));
}

export class MusicStream {
  /** The level to mix this song in at — the mood crossfade's handle on it. */
  readonly gain: GainNode;
  /**
   * How many bars of the song this stream loops — its own, not the export's.
   * See {@link ./MusicSongs.soundingBarCount} for why those differ.
   */
  readonly loopBars: number;
  private readonly synth: Synth;
  private readonly node: ScriptProcessorNode;
  private readonly left = new Float32Array(BUFFER_SAMPLES);
  private readonly right = new Float32Array(BUFFER_SAMPLES);

  /**
   * Builds the song and starts rendering it, silently — the caller ramps
   * {@link gain} up.
   *
   * Throws if the context cannot make a processor node, which is the caller's
   * cue to go back to the synthesised drones.
   */
  constructor(ctx: AudioContext, destination: AudioNode, json: BeepBoxSongJson) {
    const song = new Song();
    song.fromJsonObject(json);
    // Loop the whole song rather than the exported bracket — see `soundingBarCount`.
    const bars = soundingBarCount(json);
    if (bars > 0) {
      song.loopStart = 0;
      song.loopLength = bars;
    }
    this.loopBars = song.loopLength;

    this.synth = new Synth(song);
    this.synth.samplesPerSecond = ctx.sampleRate;
    // The constructor sized the panning and chorus delay lines off the default
    // 44.1kHz, and the method that does it is private — so re-derive them here
    // for the rate this context actually runs at. Idle at 48kHz, where the
    // fitting power of two comes out the same; at 96kHz the stale mask wraps the
    // delay line early and the chorus turns to artefacts.
    this.synth.panningDelayBufferSize = fittingPowerOfTwo(ctx.sampleRate * Config.panDelaySecondsMax);
    this.synth.panningDelayBufferMask = this.synth.panningDelayBufferSize - 1;
    this.synth.chorusDelayBufferSize = fittingPowerOfTwo(ctx.sampleRate * Config.chorusMaxDelay);
    this.synth.chorusDelayBufferMask = this.synth.chorusDelayBufferSize - 1;
    // -1 is what makes `synthesize` wrap at the loop point forever instead of
    // reaching the end of the song and pausing itself.
    this.synth.loopRepeatCount = -1;
    this.synth.volume = 1;

    // One render up front, then rewound: it compiles what the opening bars need
    // and clears the limiter and the delay lines, so the expensive first buffer
    // is paid here — on the thread that asked for the track — rather than in the
    // audio callback, where it would be a dropout.
    this.synth.synthesize(this.left, this.right, BUFFER_SAMPLES, true);
    this.synth.snapToStart();
    this.synth.resetEffects();

    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(destination);

    this.node = ctx.createScriptProcessor(BUFFER_SAMPLES, 0, 2);
    this.node.onaudioprocess = (event: AudioProcessingEvent): void => {
      const out = event.outputBuffer;
      const l = out.getChannelData(0);
      const r = out.getChannelData(1);
      // Cleared first, always: instruments *add* into these buffers, and browsers
      // disagree about whether a processor's output arrives zeroed. BeepBox
      // carries a runtime probe for that; two `fill`s cost less and are never
      // wrong.
      l.fill(0);
      r.fill(0);
      this.synth.synthesize(l, r, out.length, true);
    };
    this.node.connect(this.gain);
  }

  /**
   * Stops rendering and unhooks the node.
   *
   * The callback is cleared as well as disconnected: a disconnected processor
   * stops being pulled, but dropping the reference is what lets the synth — and
   * the song behind it — be collected rather than kept alive by the graph.
   */
  stop(): void {
    this.node.onaudioprocess = null;
    this.node.disconnect();
    this.gain.disconnect();
  }
}
