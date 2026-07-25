import { describe, it, expect } from "vitest";
import { pitchToFrequency } from "./pitch";

describe("pitchToFrequency", () => {
  it("maps pitch 69 to A4 (440Hz)", () => {
    expect(pitchToFrequency(69)).toBeCloseTo(440, 5);
  });

  it("maps pitch 60 to middle C (~261.63Hz)", () => {
    expect(pitchToFrequency(60)).toBeCloseTo(261.6256, 3);
  });

  it("doubles frequency per octave (12 semitones)", () => {
    expect(pitchToFrequency(81)).toBeCloseTo(pitchToFrequency(69) * 2, 5);
  });

  it("applies a pitch bend in semitones", () => {
    expect(pitchToFrequency(69, 12)).toBeCloseTo(880, 5);
    expect(pitchToFrequency(69, -12)).toBeCloseTo(220, 5);
  });
});
