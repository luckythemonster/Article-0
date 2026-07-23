/**
 * Adaptive audio, synthesised with the Web Audio API so the game ships no audio
 * assets (none exist in the repo). Two continuous music layers — a calm
 * "sneaking" pad and a pulsed "red alert" klaxon — crossfade with the alert
 * mood, and short enveloped tones cover the gameplay SFX. EIRA-7's presence is
 * felt as a faint 37 Hz sub under the calm layer (her carrier-wave signature).
 *
 * Browsers gate audio behind a user gesture, so the context starts suspended
 * and is resumed on the first key/pointer input (and defensively before each
 * SFX). A single instance lives for the app's lifetime — use {@link getAudio}.
 */
export type MusicMood = "calm" | "search" | "alert" | "none";

class AudioDirector {
  private readonly ctx?: AudioContext;
  private readonly master?: GainNode;
  private calmGain?: GainNode;
  private alertGain?: GainNode;
  private started = false;
  private mood: MusicMood | null = null;
  private noiseBuffer?: AudioBuffer;
  private suctionGain?: GainNode;
  private suctionOn = false;
  private purgeGain?: GainNode;
  private purgeOn = false;

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
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
      const resume = (): void => void this.ctx?.resume();
      window.addEventListener("keydown", resume);
      window.addEventListener("pointerdown", resume);
    } catch {
      this.ctx = undefined;
    }
  }

  /** Crossfades the music layers to match the current alert mood. */
  setMood(mood: MusicMood): void {
    if (!this.ctx || !this.master) return;
    this.ensureMusic();
    if (mood === this.mood) return;
    this.mood = mood;
    const [calm, alert] =
      mood === "calm" ? [0.5, 0] : mood === "search" ? [0.2, 0.18] : mood === "alert" ? [0.05, 0.5] : [0, 0];
    const ramp = mood === "alert" ? 0.25 : 1.2;
    this.ramp(this.calmGain, calm, ramp);
    this.ramp(this.alertGain, alert, ramp);
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
