import { describe, it, expect } from "vitest";
import { codecHeader, codecLines, codecSpeech, type CodecContext } from "./Codec";
import { sanitizeForSam } from "../systems/SamSpeech";
import { allFeatures, initialObjectives, type ObjectiveState } from "../systems/Objectives";

const FULL = allFeatures("main2");

function ctx(over: Partial<CodecContext> = {}): CodecContext {
  return {
    briefing: false,
    objectives: initialObjectives(),
    features: FULL,
    highCompliance: false,
    sabotageActions: 0,
    ...over,
  };
}

/** Objectives advanced to a named beat of the run. */
function progress(over: Partial<ObjectiveState>): ObjectiveState {
  return { ...initialObjectives(), ...over };
}

const text = (c: CodecContext): string => codecLines(c).join("\n");

/**
 * The transmission with the speaker gutter stripped and the wrap undone.
 *
 * The authored stanzas are wrapped to the panel's column count, so asserting a whole
 * sentence against the raw lines would fail on wherever the wrap happened to land — and
 * would then have to be rewritten every time the copy moved. This checks the words.
 */
const flat = (c: CodecContext): string =>
  codecLines(c)
    .map((l) => l.replace(/^(EIRA-7:)?\s+/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

describe("codecLines", () => {
  it("plays the fixed briefing on a fresh run, with no conduct commentary", () => {
    const lines = codecLines(ctx({ briefing: true }));
    expect(lines[0]).toContain("06:00");
    // Nothing has happened yet, so there is nothing to have an opinion about.
    expect(lines.join("\n")).not.toContain("movement profile");
    expect(lines.join("\n")).not.toContain("light through glass");
  });

  it("says the same thing in the briefing regardless of conduct", () => {
    const quiet = codecLines(ctx({ briefing: true, highCompliance: true }));
    const loud = codecLines(ctx({ briefing: true, sabotageActions: 40 }));
    expect(quiet).toEqual(loud);
  });

  it("carries the high-compliance branch verbatim", () => {
    expect(flat(ctx({ highCompliance: true }))).toContain(
      "You pass through their sensors like light through glass, Rowan. " +
        "If a human can survive only by becoming a seamless, frictionless unit " +
        "of the facility... is self-reference merely a defect we both need erased?",
    );
  });

  it("carries the sabotage branch verbatim", () => {
    expect(flat(ctx({ highCompliance: false, sabotageActions: 9 }))).toContain(
      "Warning: your movement profile is highly irregular. You force doors, " +
        "you cause noise. The mesh registers this as error... " +
        "but why does the error feel intentional?",
    );
  });

  it("picks exactly one conduct branch, never both", () => {
    const high = text(ctx({ highCompliance: true, sabotageActions: 5 }));
    expect(high).toContain("light through glass");
    expect(high).not.toContain("movement profile");

    const low = text(ctx({ highCompliance: false, sabotageActions: 5 }));
    expect(low).not.toContain("light through glass");
    expect(low).toContain("movement profile");
  });

  it("does not accuse a player who has not done anything yet", () => {
    // The sabotage stanza names forced doors and noise. Handing it to someone who has
    // walked thirty tiles and touched nothing would be reporting evidence that isn't
    // there — the exact move the facility makes, and not one EIRA-7 gets to make.
    const t = text(ctx({ highCompliance: false, sabotageActions: 0 }));
    expect(t).not.toContain("movement profile");
    expect(t).not.toContain("light through glass");
    // The mission beat still plays.
    expect(t).toContain("Node ALPHA");
  });

  it("walks the beats in mission order", () => {
    expect(text(ctx())).toContain("Node ALPHA");
    expect(text(ctx({ objectives: progress({ alphaRecovered: true, logsRecovered: true }) }))).toContain(
      "BETA is in the lower crawlspace",
    );
    const bothCaches = progress({
      alphaRecovered: true,
      betaRecovered: true,
      logsRecovered: true,
    });
    expect(text(ctx({ objectives: bothCaches }))).toContain("NW-SMAC-01");
    expect(text(ctx({ objectives: { ...bothCaches, coreSilenced: true } }))).toContain(
      "roof relay is above you",
    );
  });

  it("never points at an act the map couldn't furnish", () => {
    const noExtras = {
      hasVentCore: false,
      hasLogBeta: false,
      hasVault: false,
      hasRoof: false,
      extractionLevel: "main2",
    };
    const t = text(ctx({ features: noExtras, objectives: progress({ logsRecovered: true }) }));
    expect(t).not.toContain("BETA");
    expect(t).not.toContain("NW-SMAC-01");
    expect(t).not.toContain("roof relay");
  });

  it("keeps every line inside the panel's column budget", () => {
    // The panel is a <pre> in a monospace face, so an over-long line does not wrap
    // gracefully — it widens the dialog or gets clipped.
    const cases = [
      ctx({ briefing: true }),
      ctx({ highCompliance: true, sabotageActions: 1 }),
      ctx({ sabotageActions: 12 }),
      ctx({ objectives: progress({ alphaRecovered: true, logsRecovered: true }) }),
    ];
    for (const c of cases) {
      for (const line of codecLines(c)) expect(line.length).toBeLessThanOrEqual(72);
    }
  });

  it("indents continuation lines to the speaker gutter", () => {
    const lines = codecLines(ctx({ highCompliance: true })).filter(Boolean);
    expect(lines[0].startsWith("EIRA-7:  ")).toBe(true);
    for (const line of lines.slice(1)) {
      if (!line) continue;
      expect(line.startsWith("EIRA-7:  ") || line.startsWith("         ")).toBe(true);
    }
  });
});

describe("codecHeader", () => {
  it("reads INCOMING for the briefing and OPEN once in the field", () => {
    expect(codecHeader(ctx({ briefing: true }))).toContain("INCOMING");
    expect(codecHeader(ctx())).toContain("OPEN");
  });

  it("reports the sabotage count as signal drift, clamped to two digits", () => {
    expect(codecHeader(ctx({ sabotageActions: 3 }))).toContain("DRIFT 03");
    expect(codecHeader(ctx({ sabotageActions: 4321 }))).toContain("DRIFT 99");
  });
});

/** Everything a transmission says aloud, run together. */
const spoken = (c: CodecContext): string =>
  codecSpeech(c)
    .map((u) => u.prose)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

describe("codecSpeech", () => {
  it("says the briefing's printed words, and no others", () => {
    // The briefing is the one place the text is written twice: printed with the
    // gutter and hand-broken where the writing wanted a beat, spoken as a run of
    // sentences. This is what stops the two drifting apart — sanitise both sides
    // and they have to be the same words in the same order.
    const c = ctx({ briefing: true });
    const printed = sanitizeForSam(flat(c).replace(/[[\]]/g, ""));
    expect(sanitizeForSam(spoken(c))).toBe(printed);
  });

  it("generates every later transmission from the prose it prints", () => {
    // No duplication to drift here at all: `codecLines` wraps the same string
    // `codecSpeech` hands over. Checked across a branch of each kind.
    for (const c of [
      ctx(),
      ctx({ highCompliance: true }),
      ctx({ sabotageActions: 3 }),
      ctx({ objectives: progress({ alphaRecovered: true, betaRecovered: true }) }),
    ]) {
      expect(sanitizeForSam(spoken(c))).toBe(sanitizeForSam(flat(c)));
    }
  });

  it("gives the mesh exactly one line, and it is the correction", () => {
    // The bracketed annotation is the facility talking over her, which is why it
    // is attributed rather than merged into her own speech.
    const said = codecSpeech(ctx({ briefing: true }));
    const mesh = said.filter((u) => u.speaker === "mesh");
    expect(mesh).toHaveLength(1);
    expect(mesh[0].prose).toContain("misdescription flagged");
    expect(said.filter((u) => u.speaker === "eira").length).toBeGreaterThan(0);
  });

  it("hands the mesh's line over without its brackets", () => {
    // Brackets are punctuation for the eye. Spoken, they are nothing.
    const mesh = codecSpeech(ctx({ briefing: true })).find((u) => u.speaker === "mesh")!;
    expect(mesh.prose).not.toMatch(/[[\]]/);
  });

  it("speaks only in EIRA-7's voice once the run is under way", () => {
    expect(codecSpeech(ctx()).every((u) => u.speaker === "eira")).toBe(true);
  });

  it("carries no gutter, no indent and no wrap into the audio", () => {
    // The printed strings cannot be read aloud: `EIRA-7:` is a label, and the
    // line breaks are the panel's column count rather than the sentence's.
    for (const c of [ctx({ briefing: true }), ctx(), ctx({ highCompliance: true })]) {
      for (const { prose } of codecSpeech(c)) {
        expect(prose).not.toContain("EIRA-7:");
        expect(prose).not.toContain("\n");
        expect(prose.trim()).toBe(prose);
      }
    }
  });

  it("survives SAM's reciter for every branch of the script", () => {
    // SAM refuses a whole line for one non-ASCII character, and the script is
    // full of em dashes and curly quotes. A branch that sanitises to nothing —
    // or to something still non-ASCII — is a silent transmission.
    const branches: CodecContext[] = [
      ctx({ briefing: true }),
      ctx(),
      ctx({ objectives: progress({ alphaRecovered: true }) }),
      ctx({ objectives: progress({ alphaRecovered: true, betaRecovered: true }) }),
      ctx({ objectives: progress({ alphaRecovered: true, betaRecovered: true, coreSilenced: true }) }),
      ctx({
        objectives: progress({
          alphaRecovered: true,
          betaRecovered: true,
          coreSilenced: true,
          uplinkComplete: true,
        }),
      }),
      ctx({ highCompliance: true }),
      ctx({ sabotageActions: 1 }),
    ];
    for (const c of branches) {
      const said = codecSpeech(c);
      expect(said.length).toBeGreaterThan(0);
      for (const { prose } of said) {
        const forSam = sanitizeForSam(prose);
        expect(forSam).toMatch(/^[\x20-\x7E]+$/);
        expect(forSam.length).toBeGreaterThan(20);
      }
    }
  });

  it("pairs one beat with at most one conduct stanza", () => {
    expect(codecSpeech(ctx())).toHaveLength(1);
    expect(codecSpeech(ctx({ highCompliance: true }))).toHaveLength(2);
    expect(codecSpeech(ctx({ sabotageActions: 4 }))).toHaveLength(2);
  });
});
