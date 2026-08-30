import { describe, it, expect } from "vitest";
import { allBarkLines, barkFor, decideBark, VOICE_PRESETS, type SilicateVoice } from "./SilicateBarks";
import type { GuardState } from "../entities/Enforcer";

/** `decideBark` for a silicate with no cooldown left — the ordinary case. */
function speaks(prev: GuardState | null, next: GuardState, cooldown = 0) {
  return decideBark(prev, next, cooldown, 0, true);
}

describe("barkFor — what a silicate says", () => {
  it("says nothing on PATROL", () => {
    // The state a guard falls back to when nothing is happening, entered on
    // every empty search and every level load. A line there would be the one
    // heard most and meaning least.
    expect(barkFor("PATROL", 0)).toBeUndefined();
  });

  it("has a line for each of the four states that mean something", () => {
    for (const state of ["CAUTIOUS", "SUSPICIOUS", "ALERT", "SEARCHING"] as GuardState[]) {
      expect(barkFor(state, 0)).toBeTruthy();
    }
  });

  it("walks the whole set as the roll goes from 0 to 1", () => {
    const seen = new Set<string>();
    for (let roll = 0; roll < 1; roll += 0.05) seen.add(barkFor("ALERT", roll)!);
    expect(seen.size).toBeGreaterThan(1);
  });

  it("clamps a roll at or past the end rather than running off it", () => {
    expect(barkFor("ALERT", 1)).toBeTruthy();
    expect(barkFor("ALERT", 999)).toBe(barkFor("ALERT", 0.99));
    expect(barkFor("ALERT", -1)).toBe(barkFor("ALERT", 0));
  });

  it("is deterministic, because the roll is the caller's", () => {
    // The whole reason the random number is a parameter: this module stays pure
    // and the test can name the line it expects.
    expect(barkFor("SEARCHING", 0.4)).toBe(barkFor("SEARCHING", 0.4));
  });
});

describe("the lines themselves", () => {
  it("speaks as the apparatus, not as a person", () => {
    // No "I", no contractions. A silicate is legally a non-subject and the
    // register is half of what sells that; the synth is only the other half.
    for (const line of allBarkLines()) {
      expect(line).not.toMatch(/'/);
      expect(line).not.toMatch(/\bI\b/);
      expect(line).not.toMatch(/[!?]/);
    }
  });

  it("is drawn the way it is spoken", () => {
    // Capitals because that is how the speech marker renders them, and SAM's
    // reciter is case-insensitive, so one string serves both.
    for (const line of allBarkLines()) expect(line).toBe(line.toUpperCase());
  });

  it("stays short enough to read before it is gone", () => {
    // The marker shows a line for BARK_SHOW_SECONDS over a guard that is moving.
    for (const line of allBarkLines()) expect(line.length).toBeLessThanOrEqual(24);
  });

  it("lists each line once, so nothing is rendered twice at boot", () => {
    expect(new Set(allBarkLines()).size).toBe(allBarkLines().length);
  });
});

describe("decideBark — whether a change speaks", () => {
  it("speaks on entering a state that has lines", () => {
    const { line, latch } = speaks("PATROL", "ALERT");
    expect(line).toBe(barkFor("ALERT", 0));
    expect(latch).toBe(true);
  });

  it("says nothing when the state has not changed", () => {
    expect(speaks("ALERT", "ALERT").line).toBeUndefined();
  });

  it("speaks on the first change of a guard's life, from no previous state", () => {
    expect(speaks(null, "SUSPICIOUS").line).toBeTruthy();
  });

  it("latches PATROL silently — there is nothing to come back for", () => {
    const { line, latch } = speaks("ALERT", "PATROL");
    expect(line).toBeUndefined();
    expect(latch).toBe(true);
  });

  it("latches a human security guard silently, in every state", () => {
    for (const state of ["CAUTIOUS", "SUSPICIOUS", "ALERT", "SEARCHING"] as GuardState[]) {
      const { line, latch } = decideBark("PATROL", state, 0, 0, false);
      expect(line).toBeUndefined();
      expect(latch).toBe(true);
    }
  });

  it("defers a line held back by the cooldown instead of eating it", () => {
    // The bug this replaces: the caller recorded the new state before checking
    // the cooldown, so a suppressed line was marked said and never came out —
    // during exactly the alert cascade the cooldown exists for.
    const held = speaks("PATROL", "ALERT", 2.5);
    expect(held.line).toBeUndefined();
    expect(held.latch).toBe(false);

    // `latch: false` means the caller leaves `prev` alone, so the same question
    // is asked again — and answered once the cooldown has run out.
    expect(speaks("PATROL", "ALERT", 0).line).toBeTruthy();
  });

  it("does not defer a silence that had no line to give", () => {
    // A cooldown must not turn "nothing to say" into "say it later".
    expect(speaks("ALERT", "PATROL", 3).latch).toBe(true);
    expect(decideBark("PATROL", "ALERT", 3, 0, false).latch).toBe(true);
  });
});

describe("the bark cache contract", () => {
  it("keys every line in every voice the way AudioDirector looks it up", () => {
    // `AudioDirector.bark` reads `${voice}:${line}` out of a map its warm-up
    // filled from these two lists. If they ever came apart the failure would be
    // silence, which is the one failure the feature cannot report.
    const keys = new Set<string>();
    for (const voice of Object.keys(VOICE_PRESETS) as SilicateVoice[]) {
      for (const line of allBarkLines()) keys.add(`${voice}:${line}`);
    }
    expect(keys.size).toBe(allBarkLines().length * Object.keys(VOICE_PRESETS).length);

    for (const state of ["CAUTIOUS", "SUSPICIOUS", "ALERT", "SEARCHING"] as GuardState[]) {
      for (let roll = 0; roll <= 1; roll += 0.05) {
        const line = barkFor(state, roll)!;
        expect(keys.has(`enforcer:${line}`)).toBe(true);
        expect(keys.has(`drone:${line}`)).toBe(true);
      }
    }
  });
});

describe("the two voices", () => {
  it("are far enough apart to tell by ear", () => {
    // You hear one of these from off-screen and the only question that matters
    // is which kind of thing is about to come round the corner.
    const { enforcer, drone } = VOICE_PRESETS;
    expect(drone.pitch).toBeGreaterThan(enforcer.pitch);
    expect(drone.throat).toBeLessThan(enforcer.throat);
    // A drone is small and quick, an enforcer is the bigger chassis. `speed` is
    // a frame-duration multiplier, so the quick one carries the *lower* number —
    // this assertion used to demand the opposite, which is how the two shipped
    // with their speeds swapped.
    expect(drone.speed).toBeLessThan(enforcer.speed);
  });

  it("stays inside the range SAM's own presets use", () => {
    for (const preset of Object.values(VOICE_PRESETS)) {
      for (const value of Object.values(preset)) {
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(255);
      }
    }
  });
});
