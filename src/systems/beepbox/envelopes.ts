/**
 * BeepBox envelope names ("swell 2", "twang 3", "flare 1", "decay 2") name a
 * curve family plus an intensity/speed level. Used both for instrument-level
 * `envelopes[]` (animating a note filter cutoff or an FM operator's
 * amplitude) and for a drumset slot's `filterEnvelope`. Exact time constants
 * are a by-ear tuning choice, not a literal reproduction of BeepBox's own
 * curves — each family just needs a distinct, musically sensible shape.
 */

export type EnvelopeFamily = "decay" | "twang" | "flare" | "swell";

export interface EnvelopeShape {
  family: EnvelopeFamily;
  level: number;
}

export function parseEnvelope(name: string): EnvelopeShape {
  const [familyRaw, levelRaw] = name.trim().split(/\s+/);
  return { family: familyRaw as EnvelopeFamily, level: Number(levelRaw) || 1 };
}

/**
 * A [0, 1] gain-style multiplier at `t` seconds since note-on, for a note
 * lasting `duration` seconds.
 */
export function envelopeGainAt(shape: EnvelopeShape, t: number, duration: number): number {
  const level = Math.max(1, shape.level);
  switch (shape.family) {
    case "decay": {
      const rate = 1.5 + level * 1.5;
      return Math.exp(-rate * Math.max(0, t));
    }
    case "twang": {
      const attack = 0.01;
      const rate = 2 + level * 2.5;
      if (t < attack) return Math.max(0, t / attack);
      return Math.exp(-rate * (t - attack));
    }
    case "flare": {
      const riseTime = Math.max(0.02, 0.18 - level * 0.04);
      const decayRate = 1 + level * 1.2;
      if (t < riseTime) return Math.max(0, t / riseTime);
      return Math.exp(-decayRate * (t - riseTime));
    }
    case "swell": {
      const riseTime = Math.max(0.05, 0.9 - level * 0.25);
      return Math.min(1, Math.max(0, t / riseTime));
    }
    default:
      return duration > 0 ? 1 : 0;
  }
}
