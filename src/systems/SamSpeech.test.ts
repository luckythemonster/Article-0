import { describe, expect, it } from "vitest";
import { sanitizeForSam, SPEAKER_VOICES, SYNTH_VOICES } from "./SamSpeech";

/**
 * The exact lines that rendered as silence before the sanitiser existed, taken
 * off `src/ui/Codec.ts` rather than invented — each one carries an em dash, and
 * two of them state the run's premise.
 */
const PREVIOUSLY_SILENT = [
  "misdescription flagged: “afraid” — correction pending",
  "If the mesh corners you, they will call it Alignment — they will say no subject was harmed.",
  "Node ALPHA is on the main deck — BETA is further down.",
];

describe("sanitizeForSam", () => {
  it("turns a dash into the pause it was doing", () => {
    // A comma, not a deletion: read aloud, "call it Alignment, they will say"
    // is the line as written.
    expect(sanitizeForSam("call it Alignment — they will say")).toBe(
      "call it Alignment, they will say",
    );
    expect(sanitizeForSam("a – b")).toBe("a, b");
  });

  it("straightens curly quotes rather than dropping the word inside them", () => {
    expect(sanitizeForSam("“afraid”")).toBe('"afraid"');
    expect(sanitizeForSam("‘afraid’")).toBe("'afraid'");
  });

  it("ends a sentence an ellipsis was trailing", () => {
    expect(sanitizeForSam("erased… but why")).toBe("erased. but why");
  });

  it("drops any other non-ASCII rather than trusting the list to be complete", () => {
    // SAM refuses the whole line for one stray glyph, so anything unmapped has
    // to go — the header's own decoration included.
    expect(sanitizeForSam("◎ CODEC · 140.85")).toBe("CODEC 140.85");
  });

  it("collapses the whitespace a dropped glyph leaves behind", () => {
    expect(sanitizeForSam("  a  ▸  b  ")).toBe("a b");
  });

  it("leaves ASCII punctuation alone, because SAM accepts all of it", () => {
    const punctuated = "Warning: your profile is irregular; you force doors (loudly), 06:00. Why?";
    expect(sanitizeForSam(punctuated)).toBe(punctuated);
  });

  it("returns pure ASCII for every line SAM used to refuse", () => {
    for (const line of PREVIOUSLY_SILENT) {
      const spoken = sanitizeForSam(line);
      expect(spoken).toMatch(/^[\x20-\x7E]*$/);
      expect(spoken.length).toBeGreaterThan(0);
    }
  });
});

describe("the voices", () => {
  it("gives EIRA-7 the same synthesiser as the things hunting Rowan", () => {
    // The point, not an economy: a different instrument would settle the run's
    // question in the sound design before the Tribunal got to it.
    for (const preset of Object.values(SYNTH_VOICES)) {
      for (const value of Object.values(preset)) {
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(255);
      }
    }
  });

  it("makes her tellable from a guard inside a syllable", () => {
    const { eira, enforcer, drone } = SYNTH_VOICES;
    // `speed` is a frame-duration multiplier, so lower is faster: she talks in
    // paragraphs where they talk in stamped phrases.
    expect(eira.speed).toBeLessThan(enforcer.speed);
    expect(eira.speed).toBeLessThan(drone.speed);
    // The most open vocal tract in the game — SAM's two formant frequencies both
    // at the ceiling, where the guards are narrow and clipped. Hers is the one
    // voice shaped like a body rather than like an announcement.
    expect(eira.throat).toBeGreaterThan(enforcer.throat);
    expect(eira.throat).toBeGreaterThan(drone.throat);
    expect(eira.mouth).toBeGreaterThan(drone.mouth);
    // Pitched up, but still under the drone — an appliance announcing itself
    // against someone talking.
    expect(eira.pitch).toBeGreaterThan(enforcer.pitch);
    expect(eira.pitch).toBeLessThan(drone.pitch);
    // Wider than the enforcer, because diction has to survive full sentences.
    expect(eira.mouth).toBeGreaterThan(enforcer.mouth);
    // And within the byte SAM masks every parameter down to.
    for (const value of Object.values(eira)) expect(value).toBeLessThanOrEqual(255);
  });

  it("hands the mesh a guard's voice when it cuts into her transmission", () => {
    expect(SPEAKER_VOICES.mesh).toBe("enforcer");
    expect(SPEAKER_VOICES.eira).toBe("eira");
  });
});
