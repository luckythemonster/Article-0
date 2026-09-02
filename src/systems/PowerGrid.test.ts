import { describe, it, expect } from "vitest";
import {
  KEYPAD_DIGITS,
  circuitKey,
  circuitsForLevel,
  initialPowerGrid,
  isHacked,
  markHacked,
  isCircuitClosed,
  keypadCode,
  keypadSeed,
  setCircuitClosed,
  type PowerGridState,
} from "./PowerGrid";

describe("circuit state", () => {
  it("falls back to what the map authored until somebody throws the switch", () => {
    // The state object is never seeded from the map: an untouched circuit is
    // simply absent, which is what stops it disagreeing with the authored value.
    const state = initialPowerGrid();
    expect(isCircuitClosed(state, "main1", "light_overhead1", true)).toBe(true);
    expect(isCircuitClosed(state, "main1", "light_overhead1", false)).toBe(false);
  });

  it("remembers a throw in both directions", () => {
    const state = initialPowerGrid();
    setCircuitClosed(state, "main1", "light_overhead1", false);
    // The authored default is now irrelevant — the override answers.
    expect(isCircuitClosed(state, "main1", "light_overhead1", true)).toBe(false);

    setCircuitClosed(state, "main1", "light_overhead1", true);
    expect(isCircuitClosed(state, "main1", "light_overhead1", false)).toBe(true);
  });

  it("keeps the same target on two decks apart", () => {
    // Targets are tile-def refs and refs recur across levels. Keying on the ref
    // alone would wire a breaker on one deck to the lights on another.
    const state = initialPowerGrid();
    setCircuitClosed(state, "main1", "light_overhead1", false);
    expect(isCircuitClosed(state, "main2", "light_overhead1", true)).toBe(true);
    expect(circuitKey("main1", "x")).not.toBe(circuitKey("main2", "x"));
  });

  it("does not collide when a level name and a target abut", () => {
    // The separator has to be something neither half can contain.
    expect(circuitKey("a", "b c")).not.toBe(circuitKey("a b", "c"));
  });
});

describe("keypadCode", () => {
  it("gives the asked-for number of digits, all 0-9", () => {
    const code = keypadCode(keypadSeed(3, 7, 0));
    expect(code.length).toBe(KEYPAD_DIGITS);
    for (const digit of code) {
      expect(Number.isInteger(digit)).toBe(true);
      expect(digit).toBeGreaterThanOrEqual(0);
      expect(digit).toBeLessThanOrEqual(9);
    }
  });

  it("is deterministic for a seed", () => {
    // Nothing gates on the code, but a throw replayed from the same state should
    // look the same — and a test that asserts a sequence needs it to be stable.
    expect(keypadCode(keypadSeed(3, 7, 0))).toEqual(keypadCode(keypadSeed(3, 7, 0)));
  });

  it("differs between a breaker's successive throws", () => {
    // The point of generating one at all: cutting the power and restoring it
    // should not play back the same four digits.
    expect(keypadCode(keypadSeed(3, 7, 0))).not.toEqual(keypadCode(keypadSeed(3, 7, 1)));
  });

  it("differs between two breakers throwing for the first time", () => {
    expect(keypadCode(keypadSeed(3, 7, 0))).not.toEqual(keypadCode(keypadSeed(9, 2, 0)));
  });

  it("survives a zero seed", () => {
    // xorshift is fixed at zero — it would emit 0,0,0,0 forever. A breaker at
    // tile (0,0) on its first throw seeds exactly that.
    expect(keypadSeed(0, 0, 0)).toBe(0);
    expect(new Set(keypadCode(0)).size).toBeGreaterThan(1);
  });
});

describe("circuitsForLevel", () => {
  it("returns only this level's overrides, and untangles the key", () => {
    const state = initialPowerGrid();
    setCircuitClosed(state, "main1", "light_overhead1", false);
    setCircuitClosed(state, "main1", "main1__wing_00", false);
    setCircuitClosed(state, "duct1", "duct1__z0_0", true);

    expect(circuitsForLevel(state, "main1").sort((a, b) => a.target.localeCompare(b.target))).toEqual([
      { target: "light_overhead1", closed: false },
      { target: "main1__wing_00", closed: false },
    ]);
  });

  it("is empty for a level nobody has thrown anything on", () => {
    expect(circuitsForLevel(initialPowerGrid(), "main1")).toEqual([]);
  });

  it("does not match a level whose name is a prefix of another's", () => {
    // The `\u0000` separator is what makes this safe — `main1` must not pick up
    // `main1vault`'s circuits just because the string starts the same way.
    const state = initialPowerGrid();
    setCircuitClosed(state, "main1vault", "x", false);
    expect(circuitsForLevel(state, "main1")).toEqual([]);
  });

  it("round-trips a throw the way the level rebuild reads it back", () => {
    const state = initialPowerGrid();
    setCircuitClosed(state, "duct1", "duct1__z2_1", false);
    const [only] = circuitsForLevel(state, "duct1");
    expect(isCircuitClosed(state, "duct1", only.target, true)).toBe(only.closed);
  });
});

describe("hacked — the bit a terminal sets", () => {
  it("is separate from a lever position, because a hack has no lever", () => {
    // The distinction the emergency lighting hangs off: a zone somebody *switched*
    // off comes up on its emergency lamp and reads `OFF`; a zone a terminal cut has
    // no power at all, so the lamp stays dark and the plate reads `NO_POWER`.
    const state = initialPowerGrid();
    markHacked(state, "duct1", "duct1__z0_0");
    expect(isHacked(state, "duct1", "duct1__z0_0")).toBe(true);
    expect(isCircuitClosed(state, "duct1", "duct1__z0_0", true)).toBe(true);
  });

  it("is level-scoped like everything else here", () => {
    const state = initialPowerGrid();
    markHacked(state, "duct1", "z");
    expect(isHacked(state, "duct2", "z")).toBe(false);
  });

  it("is false for a circuit nobody hacked", () => {
    expect(isHacked(initialPowerGrid(), "duct1", "z")).toBe(false);
  });

  it("survives a state built before the field existed", () => {
    // The grid comes straight out of the Phaser registry, which can hold an object
    // from an older shape — reading it must not throw, and writing must fill it in.
    const legacy = { circuits: {} } as PowerGridState;
    expect(isHacked(legacy, "duct1", "z")).toBe(false);
    markHacked(legacy, "duct1", "z");
    expect(isHacked(legacy, "duct1", "z")).toBe(true);
  });
});
