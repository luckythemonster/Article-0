import { parseAlgorithm, parseFeedback, parseOperatorRatio } from "../algorithm";
import { applyVibrato } from "../effects";
import { envelopeGainAt, parseEnvelope } from "../envelopes";
import { pitchToFrequency } from "../pitch";
import type { VoiceInputs } from "./types";

/**
 * A multi-operator FM voice built from the instrument's `algorithm` (which
 * operators are carriers vs modulators), `feedbackType` (self-modulating
 * operators) and `operators[]` (frequency ratio + amplitude). Modulation
 * depth (amplitude -> real Hz deviation) is an empirical scalar tuned by
 * ear, not a literal reproduction of BeepBox's own DSP.
 */
export function playFM({ ctx, instrument, chain, pitch }: VoiceInputs): void {
  const baseFreq = pitchToFrequency(pitch);
  const graph = parseAlgorithm(instrument.algorithm ?? "1");
  const feedbackOps = parseFeedback(instrument.feedbackType ?? "");
  const operators = instrument.operators ?? [];

  const oscillators = new Map<number, OscillatorNode>();
  const ampGains = new Map<number, GainNode>();
  const feedbackGains = new Map<number, GainNode>();

  operators.forEach((op, i) => {
    const opIndex = i + 1;
    const { ratio, detuned } = parseOperatorRatio(op.frequency);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = baseFreq * ratio + (detuned ? 0.6 : 0);
    const amp = ctx.createGain();
    amp.gain.value = op.amplitude;
    osc.connect(amp);
    oscillators.set(opIndex, osc);
    ampGains.set(opIndex, amp);
  });

  for (const opIndex of feedbackOps) {
    const osc = oscillators.get(opIndex);
    const amp = ampGains.get(opIndex);
    if (!osc || !amp) continue;
    const feedbackDepth = ctx.createGain();
    feedbackDepth.gain.value = (instrument.feedbackAmplitude ?? 0) * baseFreq * 0.06;
    const loopDelay = ctx.createDelay(0.01);
    loopDelay.delayTime.value = 0;
    amp.connect(loopDelay);
    loopDelay.connect(feedbackDepth);
    feedbackDepth.connect(osc.frequency);
    feedbackGains.set(opIndex, feedbackDepth);
  }

  for (const [modOp, targets] of graph.modulates) {
    const modAmp = ampGains.get(modOp);
    if (!modAmp) continue;
    const modDepthScale = ctx.createGain();
    modDepthScale.gain.value = baseFreq * 0.5;
    modAmp.connect(modDepthScale);
    for (const targetOp of targets) {
      const targetOsc = oscillators.get(targetOp);
      if (targetOsc) modDepthScale.connect(targetOsc.frequency);
    }
  }

  const duration = Math.max(0.01, chain.stopTime - chain.startTime);
  for (const assignment of instrument.envelopes ?? []) {
    if (assignment.target !== "operatorAmplitude" && assignment.target !== "feedbackAmplitude") continue;
    const shape = parseEnvelope(assignment.envelope);
    const targets =
      assignment.target === "feedbackAmplitude"
        ? [...feedbackGains.values()]
        : [ampGains.get((assignment.index ?? 0) + 1)].filter((g): g is GainNode => !!g);
    const steps = 16;
    for (const target of targets) {
      const base = target.gain.value;
      target.gain.cancelScheduledValues(chain.startTime);
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * duration;
        target.gain.linearRampToValueAtTime(base * (0.15 + 0.85 * envelopeGainAt(shape, t, duration)), chain.startTime + t);
      }
    }
  }

  const carrierMix = ctx.createGain();
  carrierMix.gain.value = 1 / Math.max(1, graph.carriers.length);
  for (const carrier of graph.carriers) {
    const amp = ampGains.get(carrier);
    if (amp) amp.connect(carrierMix);
  }
  carrierMix.connect(chain.input);

  const vibratoTarget = oscillators.get(graph.carriers[0] ?? 1) ?? [...oscillators.values()][0];
  const vibrato = vibratoTarget ? applyVibrato(ctx, instrument, vibratoTarget, chain.startTime) : undefined;

  for (const osc of oscillators.values()) {
    osc.start(chain.startTime);
    osc.stop(chain.stopTime);
  }
  vibrato?.stop(chain.stopTime);
}
