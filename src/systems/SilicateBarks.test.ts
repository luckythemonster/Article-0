import { describe, it, expect } from "vitest";
import { allBarkLines, barkFor, VOICE_PRESETS } from "./SilicateBarks";
import type { GuardState } from "../entities/Enforcer";

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

describe("the two voices", () => {
  it("are far enough apart to tell by ear", () => {
    // You hear one of these from off-screen and the only question that matters
    // is which kind of thing is about to come round the corner.
    const { enforcer, drone } = VOICE_PRESETS;
    expect(drone.pitch).toBeGreaterThan(enforcer.pitch);
    expect(drone.speed).toBeGreaterThan(enforcer.speed);
    expect(drone.throat).toBeLessThan(enforcer.throat);
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
