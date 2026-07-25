/** A shared white-noise buffer, reused across every noise-based voice (mirrors AudioDirector's own noise() idiom). */
export function createNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** An algorithmic exponential-decay-noise impulse response, shared by every instrument's reverb send. */
export function createReverbImpulse(ctx: AudioContext, seconds = 1.8, decay = 3.5): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}
