/**
 * Adaptive audio, synthesised end to end — the game ships no recorded sound.
 * Short enveloped tones cover the gameplay SFX, and above them sit two kinds of
 * music: the score, four BeepBox songs played live by BeepBox's own synthesiser
 * ({@link AudioDirector.setTrack}, `src/systems/MusicStream.ts`), and the two
 * continuous drones that came before it — a calm "sneaking" pad and a pulsed
 * "red alert" klaxon. EIRA-7's presence is felt as a faint 37 Hz sub under the
 * calm layer (her carrier-wave signature).
 *
 * A song, while one is playing, *is* the calm bed: the pad drops to nothing
 * under it and the mood ducks the song in its place, while the klaxon still
 * rises over the top so a full alert reads as one. Where no song is mapped — the
 * Act III vault — or where one failed to load, the pad comes back and the mixer
 * behaves as it did before there was a score.
 *
 * The silicate barks are synthesised too, by SAM — the 1982 Commodore 64 formant
 * synthesiser, via the `sam-js` port — and rendered to buffers that play through
 * this same mixer. See {@link AudioDirector.bark} and
 * `src/systems/SilicateBarks.ts`.
 *
 * Volume and mute come from {@link ./Settings} — loaded at construction and
 * written back whenever the pause menu's SETTINGS tab changes them.
 *
 * Browsers gate audio behind a user gesture, so the context starts suspended
 * and is resumed on the first key/pointer input (and defensively before each
 * SFX). A single instance lives for the app's lifetime — use {@link getAudio}.
 */
import SamJs from "sam-js";
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, saveSettings, type Settings } from "./Settings";
import { allBarkLines, VOICE_PRESETS, type SilicateVoice } from "./SilicateBarks";
import {
  sanitizeForSam,
  SPEAKER_VOICES,
  SYNTH_VOICES,
  type CodecUtterance,
  type SynthVoice,
} from "./SamSpeech";
import { MUSIC_TRACKS, type BeepBoxSongJson, type MusicTrackId } from "./MusicSongs";
import type { MusicStream } from "./MusicStream";

export type MusicMood = "calm" | "search" | "alert" | "none";

/**
 * The mixer's own headroom. Every voice routes through the master gain at this
 * level; the player's volume preference scales it, so a setting of 1.0 is the
 * mix as tuned rather than a boost into clipping.
 */
const HEADROOM = 0.22;

/**
 * SAM renders at 22.05 kHz and says so nowhere in its own types.
 *
 * `buf32` hands back a bare `Float32Array` with no rate attached, so the buffer
 * it is copied into has to be created at the rate it was rendered at or every
 * line plays at the wrong pitch and speed — the context's own `sampleRate` is
 * usually 44.1 or 48 kHz, which would run the voice at roughly double.
 */
const SAM_SAMPLE_RATE = 22050;

/** How loud a bark sits under the music, before the master gain. */
const BARK_GAIN = 0.9;

/**
 * How loud EIRA-7 sits when she is narrating the codec, before the master gain.
 *
 * Above a bark, because the codec is a modal with the game frozen behind it and
 * she is the only thing happening.
 */
const NARRATION_GAIN = 1.0;

/** Silence between one utterance and the next, in seconds. */
const NARRATION_GAP = 0.25;

/**
 * Lead-in before the first utterance, in seconds.
 *
 * The whole transmission is rendered and scheduled in one synchronous pass, and
 * that pass costs ~90ms for a briefing. Scheduling the first source at
 * `currentTime` would put its start time in the past by the time the last one is
 * built, and clip the opening syllable.
 */
const NARRATION_LEAD = 0.2;

/**
 * EIRA-7's carrier, in Hz — the same 37 the calm pad already hums for her.
 *
 * That sub is described where it is created as her presence being *felt*. Under
 * the codec it is the one place it resolves into words, so it runs for the whole
 * transmission rather than per utterance: the carrier is her holding the
 * channel, which is why the mesh's interjection rides over it rather than
 * interrupting it.
 */
const CARRIER_HZ = 37;

/** How loud the carrier sits under her voice. Felt, not heard. */
const CARRIER_GAIN = 0.35;

/** How loud a song sits in the mix, before the mood's duck and the master gain. */
const MUSIC_GAIN = 0.6;

/** The crossfade between two songs, and the fade in or out of one, in seconds. */
const MUSIC_FADE = 1.2;

/**
 * What each mood does to the three music layers.
 *
 * The pad and klaxon columns are what the mixer has always done. The `song`
 * column is the duck: a track keeps the floor to itself while Rowan is unseen,
 * gives ground as the facility starts looking, and sits well under the klaxon
 * once it is hunting — loud enough to still be there, quiet enough that the
 * alert is what the player hears.
 */
const MOOD_MIX: Record<MusicMood, { calm: number; alert: number; song: number }> = {
  calm: { calm: 0.5, alert: 0, song: 1 },
  search: { calm: 0.2, alert: 0.18, song: 0.75 },
  alert: { calm: 0.05, alert: 0.5, song: 0.35 },
  none: { calm: 0, alert: 0, song: 0 },
};

class AudioDirector {
  private readonly ctx?: AudioContext;
  private readonly master?: GainNode;
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private calmGain?: GainNode;
  private alertGain?: GainNode;
  private started = false;
  private mood: MusicMood | null = null;
  private track: MusicTrackId | null = null;
  private stream?: MusicStream;
  /**
   * Every song fetched this session, parsed once and kept.
   *
   * A track can be left and come back to — the VENT-4 theme either side of the
   * freakout, the main theme either side of both — and the JSON is ~40KB that
   * has already been paid for. What is *not* kept is the `MusicStream` built
   * from it: that owns a running processor node, so a track that is not playing
   * does not have one.
   */
  private readonly songs = new Map<MusicTrackId, BeepBoxSongJson>();
  /**
   * Which {@link setTrack} call is the current one.
   *
   * The fetch is async and the player is not waiting for it — walking into the
   * VENT-4 arena and straight back out asks for two tracks inside a second. The
   * token is how a load that lands after the request it belongs to was
   * superseded knows to drop what it built instead of starting it.
   */
  private trackToken = 0;
  /** So a missing or broken score says so once rather than on every level load. */
  private musicWarned = false;
  private noiseBuffer?: AudioBuffer;
  private suctionGain?: GainNode;
  private suctionOn = false;
  private purgeGain?: GainNode;
  private purgeOn = false;
  /**
   * Every silicate line, rendered once and kept.
   *
   * Keyed `<voice>:<line>`. `buf32` is synchronous and CPU-bound — it runs the
   * whole reciter and the formant renderer inline — so calling it on the frame a
   * guard spots you would drop that frame. The set of lines is fixed and small
   * (`allBarkLines`), so they are all rendered up front on the first bark and
   * every later one is a buffer that already exists.
   */
  private readonly barks = new Map<string, AudioBuffer>();
  private barksReady = false;
  /**
   * One reciter per voice, built on first use and kept.
   *
   * Shared by the warm-up pass and the on-demand fallback in {@link bark}, so
   * neither has to stand up a formant synthesiser of its own.
   */
  private readonly reciters = new Map<SynthVoice, SamJs>();
  /** So a broken SAM says so once rather than every time a guard changes state. */
  private samWarned = false;
  /**
   * Every source scheduled by the transmission currently being narrated.
   *
   * A bark is fire-and-forget because it is one second long and nothing can
   * outlive its own reason to exist. A codec transmission is half a minute, and
   * the player can close the channel on the first syllable — so these are held
   * to be stopped. See {@link narrate} and {@link stopNarration}.
   */
  private narrating: AudioBufferSourceNode[] = [];
  /** The narration's own bus, carrying her voice and her carrier together. */
  private narrationGain?: GainNode;
  /** The 37 Hz carrier oscillator, live only while she is speaking. */
  private carrier?: OscillatorNode;

  constructor() {
    const Ctor: typeof AudioContext | undefined =
      typeof window === "undefined"
        ? undefined
        : window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      // Adopt the stored preference before the first sound plays, so a muted
      // player never gets one frame of audio on reload.
      this.applySettings(loadSettings());
      // The same gesture that unlocks the context is where the voice set gets
      // rendered. It costs ~150ms of main thread, which is invisible at the title
      // screen and would be a dropped frame on the one where a guard first spots
      // you — and doing it in this constructor would charge it to every player
      // before the title has even drawn, whether or not a silicate ever speaks.
      const resume = (): void => {
        void this.ctx?.resume();
        this.ensureBarks();
      };
      window.addEventListener("keydown", resume);
      window.addEventListener("pointerdown", resume);
    } catch {
      this.ctx = undefined;
    }
  }

  /**
   * Speaks one silicate line.
   *
   * **Not `sam.speak()`.** That builds its own `AudioContext` and plays straight
   * to the speakers, which would sail past the master gain and mean a muted
   * player still heard every bark. Rendering to a buffer and playing it through
   * the same mixer as everything else is what makes the pause menu's volume
   * slider and mute govern it like they govern the door and the klaxon.
   *
   * A no-op when there is no audio context (headless, or a browser that refused
   * one) or when SAM fails on a line — a guard that cannot be heard still shows
   * its line on the speech marker, so the bark degrades to text rather than to
   * nothing.
   *
   * A line the warm-up does not already hold is rendered here rather than
   * skipped. That is a backstop, not the normal path: one line is a few
   * milliseconds against the whole set's ~100ms, and paying it beats the
   * alternative this replaces, where any warm-up that had not run — or had run
   * and failed — meant permanent silence with nothing on the console to say so.
   */
  bark(line: string, voice: SilicateVoice): void {
    if (!this.ctx || !this.master) return;
    void this.ctx.resume();
    this.ensureBarks();
    const buffer = this.barks.get(`${voice}:${line}`) ?? this.render(voice, line);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = BARK_GAIN;
    src.connect(g);
    g.connect(this.master);
    src.start();
  }

  /**
   * Speaks a whole codec transmission, in order.
   *
   * The codec is the one place EIRA-7 has a voice, and it was silent: the thing
   * arguing it is a subject was the only thing in the game that could not talk,
   * while the apparatus hunting Rowan barked at him all run.
   *
   * **Scheduled, not timed.** Every utterance is rendered and handed to
   * `start(when)` in one pass, with `when` accumulated from the buffers' own
   * durations, so the pacing is sample-accurate and survives a stalled frame.
   * The pass costs ~90ms for a ~25-second briefing, which is one frame inside a
   * modal that has already frozen the sim behind it.
   *
   * Both voices go through the same master gain as everything else, so mute and
   * the volume slider govern her exactly as they govern a door.
   *
   * A no-op when the player has turned narration off, so that setting is
   * enforced in one place rather than at each call site.
   */
  narrate(utterances: readonly CodecUtterance[]): void {
    this.stopNarration();
    if (!this.ctx || !this.master || !this.settings.narrateCodec) return;
    void this.ctx.resume();

    const bus = this.ctx.createGain();
    bus.gain.value = NARRATION_GAIN;
    bus.connect(this.master);
    this.narrationGain = bus;

    let when = this.ctx.currentTime + NARRATION_LEAD;
    for (const { speaker, prose } of utterances) {
      const buffer = this.render(SPEAKER_VOICES[speaker], prose);
      if (!buffer) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(bus);
      src.start(when);
      this.narrating.push(src);
      when += buffer.duration + NARRATION_GAP;
    }

    // Nothing rendered — a broken SAM, already warned about. Don't leave a
    // carrier humming under a transmission that is never going to arrive.
    if (this.narrating.length === 0) {
      this.stopNarration();
      return;
    }

    // Her carrier, under the whole transmission including the mesh's
    // interjection — see CARRIER_HZ.
    const carrier = this.ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = CARRIER_HZ;
    const carrierGain = this.ctx.createGain();
    carrierGain.gain.value = CARRIER_GAIN;
    carrier.connect(carrierGain);
    carrierGain.connect(bus);
    carrier.start();
    carrier.stop(when);
    this.carrier = carrier;
  }

  /**
   * Cuts the transmission off wherever it has got to.
   *
   * Called when the channel closes, whichever way it closed, and again by
   * {@link narrate} before it schedules anything, so reopening the codec never
   * lands a second voice on top of the first.
   *
   * `stop()` on a source that has already ended is legal and does nothing, which
   * is what lets this be indiscriminate rather than tracking which of thirty
   * seconds' worth has played.
   */
  stopNarration(): void {
    for (const src of this.narrating) {
      try {
        src.stop();
      } catch {
        // Already stopped, or never started. Either way it is not playing.
      }
      src.disconnect();
    }
    this.narrating = [];
    try {
      this.carrier?.stop();
    } catch {
      /* as above */
    }
    this.carrier?.disconnect();
    this.carrier = undefined;
    this.narrationGain?.disconnect();
    this.narrationGain = undefined;
  }

  /**
   * Renders every line in both voices, once.
   *
   * Driven off the first key or pointer event — see the constructor — so the cost
   * lands at the title screen rather than mid-game. {@link bark} calls it too, as
   * a backstop for any path that reaches a bark without one of those having
   * fired; it is idempotent, so the second call is a flag check.
   *
   * Both voices are rendered together rather than lazily per voice: they are
   * ~150ms and ~2.8MB between them, and splitting the cost would mean paying the
   * second half at the first moment a drone speaks, which is exactly the kind of
   * moment this is being kept away from.
   */
  private ensureBarks(): void {
    if (this.barksReady || !this.ctx) return;
    const lines = allBarkLines();
    for (const voice of Object.keys(VOICE_PRESETS) as SilicateVoice[]) {
      for (const line of lines) this.render(voice, line);
    }
    // Set *after* the sweep, not before it. The flag used to go up first, so a
    // SAM that threw on the very first voice latched the whole feature off for
    // the session — silently, since nothing logged. Latching unconditionally
    // here is still safe because recovery no longer depends on this pass: a
    // line the sweep failed to produce is retried, on its own, by {@link bark}.
    this.barksReady = true;
  }

  /**
   * Renders one line in one voice into the cache, and returns it.
   *
   * `undefined` when there is no context, when SAM cannot build the voice, or
   * when its reciter cannot make phonemes of the line — all of which are the
   * caller's cue to fall back to text.
   */
  private render(voice: SynthVoice, line: string): AudioBuffer | undefined {
    if (!this.ctx) return undefined;
    const key = `${voice}:${line}`;
    const cached = this.barks.get(key);
    if (cached) return cached;
    try {
      let sam = this.reciters.get(voice);
      if (!sam) {
        sam = new SamJs(SYNTH_VOICES[voice]);
        this.reciters.set(voice, sam);
      }
      // SAM refuses a line containing any non-ASCII character — not the
      // character, the whole line — so an em dash in the codec's prose is a
      // silent sentence. See `sanitizeForSam`.
      const rendered = sam.buf32(sanitizeForSam(line));
      // `buf32` is typed `Float32Array | Boolean` — it returns `false` for a
      // line its reciter cannot make phonemes of.
      if (!(rendered instanceof Float32Array) || rendered.length === 0) {
        this.warnSam(`SAM produced no audio for ${key}`);
        return undefined;
      }
      const buffer = this.ctx.createBuffer(1, rendered.length, SAM_SAMPLE_RATE);
      // Copied element-wise rather than through `copyToChannel`, whose type
      // insists on a `Float32Array<ArrayBuffer>` while SAM's is declared over
      // the wider `ArrayBufferLike`. A few thousand samples once per line at
      // boot is not worth a cast that would outlive the reason for it.
      buffer.getChannelData(0).set(rendered);
      this.barks.set(key, buffer);
      return buffer;
    } catch (err) {
      // One bad line must not cost the rest of the set.
      this.warnSam(`SAM failed on ${key}: ${String(err)}`);
      return undefined;
    }
  }

  /**
   * Says once, on the console, that the silicate voice is not working.
   *
   * Every failure in here is caught and degrades to text on purpose, which is
   * right for the player and was hopeless for anyone trying to find out why the
   * facility had gone quiet: three bare `catch` blocks meant a broken SAM looked
   * exactly like a SAM nobody had triggered. Once per session, because a guard
   * changing state must not be able to flood the console.
   */
  private warnSam(message: string): void {
    if (this.samWarned) return;
    this.samWarned = true;
    console.warn(`[AudioDirector] silicate barks are degrading to text — ${message}`);
  }

  /** The player's current audio preference. */
  getSettings(): Settings {
    return { ...this.settings };
  }

  /**
   * Applies a volume/mute preference to the master gain and persists it.
   *
   * Set directly rather than ramped: this is driven by a slider the player is
   * dragging, and a 20ms ramp per input event stacks into audible zipper noise.
   */
  applySettings(next: Settings): void {
    this.settings = normalizeSettings(next);
    saveSettings(this.settings);
    // Turning narration off mid-transmission has to take effect now. Muting
    // does not: mute is a volume, and the codec keeps its place behind it.
    if (!this.settings.narrateCodec) this.stopNarration();
    if (this.master) {
      this.master.gain.value = this.settings.muted ? 0 : HEADROOM * this.settings.masterVolume;
    }
  }

  /** Crossfades the music layers to match the current alert mood. */
  setMood(mood: MusicMood): void {
    if (!this.ctx || !this.master) return;
    this.ensureMusic();
    if (mood === this.mood) return;
    this.mood = mood;
    // Faster into an alert than out of one: the klaxon is information, and
    // information that arrives over a second and a half has already cost the
    // player the thing it was warning them about.
    this.applyMix(mood === "alert" ? 0.25 : MUSIC_FADE);
  }

  /**
   * Plays the score's `track`, crossfading out whatever was playing; `null`
   * stops the music.
   *
   * Safe to call every level load with the same track — the second call is an
   * equality check, so a scene restart does not re-cut the song. The song itself
   * is fetched on first use rather than at boot: the title screen only needs one
   * of the four, and the other three are ~110KB the player may never reach.
   *
   * Degrades to the synthesised drones, loudly on the console and silently in
   * the game, if there is no audio context, if the fetch fails, or if the JSON
   * will not build a song.
   */
  setTrack(track: MusicTrackId | null): void {
    if (track === this.track) return;
    this.track = track;
    if (!this.ctx || !this.master) return;
    this.retire(this.stream);
    this.stream = undefined;
    // The pad comes back the moment the song goes, rather than after the fetch
    // below resolves — so stopping the music leaves the mixer as it was.
    this.applyMix(MUSIC_FADE);
    if (!track) return;
    void this.startTrack(track, ++this.trackToken);
  }

  /**
   * Loads a track and starts it, unless a later {@link setTrack} got there first.
   *
   * The synthesiser is imported here rather than at the top of the file: it is
   * ~385KB that the title screen does not need before it draws, and this is the
   * first moment anything actually wants a song. Vite splits it into its own
   * chunk on the strength of that.
   */
  private async startTrack(track: MusicTrackId, token: number): Promise<void> {
    const json = await this.loadSong(track);
    if (!json || token !== this.trackToken || !this.ctx || !this.master) return;
    try {
      const { MusicStream } = await import("./MusicStream");
      if (token !== this.trackToken || !this.ctx || !this.master) return;
      this.stream = new MusicStream(this.ctx, this.master, json);
      this.applyMix(MUSIC_FADE);
    } catch (err) {
      this.warnMusic(`${MUSIC_TRACKS[track].title} would not start: ${String(err)}`);
    }
  }

  /** Which song is playing, for the debug overlay. */
  getTrack(): MusicTrackId | null {
    return this.track;
  }

  /**
   * Ramps all three music layers to the current mood and track.
   *
   * One place rather than one per caller, because the levels are not
   * independent: what the pad should be doing depends on whether a song is
   * playing, and what the song should be doing depends on the mood.
   */
  private applyMix(seconds: number): void {
    // A track can start before any mood has been set — the title screen never
    // sets one — and the title screen is not an alert.
    const mix = MOOD_MIX[this.mood ?? "calm"];
    this.ramp(this.calmGain, this.stream ? 0 : mix.calm, seconds);
    this.ramp(this.alertGain, mix.alert, seconds);
    this.ramp(this.stream?.gain, MUSIC_GAIN * mix.song, seconds);
  }

  /** Fades a song out and then tears its processor node down. */
  private retire(stream: MusicStream | undefined): void {
    if (!stream) return;
    this.ramp(stream.gain, 0, MUSIC_FADE);
    // Stopped rather than left silent: an idle stream still renders its song
    // into a buffer nobody hears, and two of those would be two songs' worth of
    // CPU spent on one that has already gone.
    window.setTimeout(() => stream.stop(), MUSIC_FADE * 1000 + 200);
  }

  /** The song behind a track — fetched and parsed once, then remembered. */
  private async loadSong(track: MusicTrackId): Promise<BeepBoxSongJson | undefined> {
    const cached = this.songs.get(track);
    if (cached) return cached;
    const { path, title } = MUSIC_TRACKS[track];
    try {
      const res = await fetch(path);
      if (!res.ok) {
        this.warnMusic(`${title} is missing at ${path} (${res.status})`);
        return undefined;
      }
      const json = (await res.json()) as BeepBoxSongJson;
      this.songs.set(track, json);
      return json;
    } catch (err) {
      this.warnMusic(`${title} would not load: ${String(err)}`);
      return undefined;
    }
  }

  /**
   * Says once, on the console, that the score is not playing.
   *
   * Same posture as {@link warnSam}: the game keeps running on the drones it had
   * before, and the one line is there so that "the music never started" is
   * something a developer can find out rather than guess at.
   */
  private warnMusic(message: string): void {
    if (this.musicWarned) return;
    this.musicWarned = true;
    console.warn(`[AudioDirector] the score is degrading to the synth drones — ${message}`);
  }

  door(): void {
    this.tone(620, 360, 0.08, "square", 0.35);
  }
  hack(): void {
    this.tone(500, 780, 0.18, "triangle", 0.4);
  }
  ping(): void {
    this.tone(920, 920, 0.07, "sine", 0.3);
  }
  pickup(): void {
    this.tone(680, 1020, 0.12, "triangle", 0.4);
  }
  select(): void {
    this.tone(320, 320, 0.03, "square", 0.2);
  }
  capture(): void {
    this.tone(300, 70, 0.6, "sawtooth", 0.5);
  }
  victory(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, f, 0.2, "triangle", 0.4, i * 0.12));
  }
  merge(): void {
    this.tone(300, 900, 0.5, "sine", 0.35);
    this.tone(450, 1350, 0.5, "triangle", 0.22, 0.03);
  }

  // --- VENT-4 encounter ---

  /** A short pressurized hiss (steam valve / grate ping). */
  steamHiss(): void {
    this.noiseBurst(0.45, 0.3, "bandpass", 3000);
  }

  /** The pneumatic rail-stapler firing: a pop with a metallic snap. */
  railStapler(): void {
    this.tone(1800, 300, 0.06, "square", 0.35);
    this.noiseBurst(0.05, 0.25, "highpass", 4000);
  }

  /** Heavy scrap hitting the intake — the turbine chokes. */
  jamClunk(): void {
    this.tone(160, 60, 0.25, "square", 0.5);
    this.noiseBurst(0.2, 0.2, "lowpass", 400, 0.02);
  }

  /** VENT-4's spin-down: the victory arpeggio's descending mirror. */
  vent4Shutdown(): void {
    const notes = [1046.5, 783.99, 659.25, 523.25, 261.63];
    notes.forEach((f, i) => this.tone(f, f * 0.98, 0.22, "triangle", 0.35, i * 0.14));
  }

  /**
   * The vacuum-surge wind layer: looped noise through a low rumble filter on
   * its own gain, independent of the mood crossfade.
   */
  setSuction(on: boolean): void {
    if (!this.ctx || !this.master || on === this.suctionOn) return;
    this.suctionOn = on;
    if (!this.suctionGain) {
      if (!on) return;
      this.suctionGain = this.ctx.createGain();
      this.suctionGain.gain.value = 0;
      this.suctionGain.connect(this.master);
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 300;
      filter.connect(this.suctionGain);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise();
      src.loop = true;
      src.connect(filter);
      src.start();
    }
    this.ramp(this.suctionGain, on ? 0.35 : 0, on ? 0.6 : 1.0);
  }

  /** The thermal-purge drone: a throbbing 55 Hz saw on its own gain. */
  setPurge(on: boolean): void {
    if (!this.ctx || !this.master || on === this.purgeOn) return;
    this.purgeOn = on;
    if (!this.purgeGain) {
      if (!on) return;
      this.purgeGain = this.ctx.createGain();
      this.purgeGain.gain.value = 0;
      this.purgeGain.connect(this.master);
      const throb = this.ctx.createGain();
      throb.gain.value = 0.6;
      throb.connect(this.purgeGain);
      const lfo = this.ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 1.8;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.35;
      lfo.connect(lfoGain);
      lfoGain.connect(throb.gain);
      lfo.start();
      this.drone("sawtooth", 55, throb, 0.7);
      this.drone("sine", 110, throb, 0.25);
    }
    this.ramp(this.purgeGain, on ? 0.4 : 0, on ? 0.8 : 1.2);
  }

  // --- internals ---

  /** A shared 1-second white-noise buffer (built lazily). */
  private noise(): AudioBuffer {
    if (!this.noiseBuffer && this.ctx) {
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer!;
  }

  /** An enveloped filtered-noise one-shot (hisses, snaps, thuds). */
  private noiseBurst(
    dur: number,
    gain: number,
    filterType: BiquadFilterType,
    freq: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.master) return;
    void this.ctx.resume();
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private ensureMusic(): void {
    if (this.started || !this.ctx || !this.master) return;
    this.started = true;
    const ctx = this.ctx;

    this.calmGain = ctx.createGain();
    this.calmGain.gain.value = 0;
    this.calmGain.connect(this.master);
    this.alertGain = ctx.createGain();
    this.alertGain.gain.value = 0;
    this.alertGain.connect(this.master);

    // Calm pad: a low triangle + a fifth, softened by a lowpass, plus EIRA-7's
    // faint 37 Hz sub.
    const calmFilter = ctx.createBiquadFilter();
    calmFilter.type = "lowpass";
    calmFilter.frequency.value = 700;
    calmFilter.connect(this.calmGain);
    this.drone("triangle", 110, calmFilter, 1);
    this.drone("sine", 164.81, calmFilter, 0.6);
    this.drone("sine", 37, this.calmGain, 0.5);

    // Alert klaxon: a saw + tritone-ish square, throbbing under a ~5 Hz LFO gate.
    const pulse = ctx.createGain();
    pulse.gain.value = 0.5;
    pulse.connect(this.alertGain);
    const lfo = ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain);
    lfoGain.connect(pulse.gain);
    lfo.start();
    this.drone("sawtooth", 220, pulse, 0.5);
    this.drone("square", 311.13, pulse, 0.3);
  }

  private drone(type: OscillatorType, freq: number, dest: AudioNode, gain = 1): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    o.connect(g);
    g.connect(dest);
    o.start();
  }

  private ramp(node: GainNode | undefined, target: number, seconds: number): void {
    if (!node || !this.ctx) return;
    const t = this.ctx.currentTime;
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(node.gain.value, t);
    node.gain.linearRampToValueAtTime(target, t + seconds);
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    void this.ctx.resume();
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

let instance: AudioDirector | null = null;

/** The shared AudioDirector (created lazily on first use). */
export function getAudio(): AudioDirector {
  if (!instance) instance = new AudioDirector();
  return instance;
}
