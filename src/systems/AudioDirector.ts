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

  // --- internals ---

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
