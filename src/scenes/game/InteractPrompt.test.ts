import { describe, it, expect } from "vitest";
import { promptLabelFor, statusMarkerFor, type PromptCandidates } from "./InteractPrompt";
import { UI } from "../../ui/hudTheme";

/** Nothing in reach: every candidate absent, every distance infinite. */
function nothing(): PromptCandidates {
  return {
    terminal: undefined,
    terminalDist: Infinity,
    door: undefined,
    doorDist: Infinity,
    breaker: undefined,
    breakerDist: Infinity,
    chest: undefined,
    chestDist: Infinity,
    hatch: false,
    vault: false,
  };
}

/** Only the fields the prompt reads — the entities themselves are irrelevant here. */
const openDoor = { isOpen: true } as PromptCandidates["door"];
const shutDoor = { isOpen: false } as PromptCandidates["door"];
const liveBreaker = { isClosed: true } as PromptCandidates["breaker"];
const cutBreaker = { isClosed: false } as PromptCandidates["breaker"];
const someTerminal = {} as PromptCandidates["terminal"];
const someChest = {} as PromptCandidates["chest"];

describe("promptLabelFor", () => {
  it("offers nothing when nothing is in reach", () => {
    expect(promptLabelFor(nothing())).toBeUndefined();
  });

  it("names the outcome of a breaker rather than the switch", () => {
    expect(promptLabelFor({ ...nothing(), breaker: liveBreaker, breakerDist: 1 })).toBe(
      "[E] Cut power",
    );
    expect(promptLabelFor({ ...nothing(), breaker: cutBreaker, breakerDist: 1 })).toBe(
      "[E] Restore power",
    );
  });

  it("names the outcome of a door rather than the door", () => {
    expect(promptLabelFor({ ...nothing(), door: openDoor, doorDist: 1 })).toBe("[E] Close");
    expect(promptLabelFor({ ...nothing(), door: shutDoor, doorDist: 1 })).toBe("[E] Open");
  });

  it("picks the nearest of several candidates", () => {
    const near = promptLabelFor({
      ...nothing(),
      terminal: someTerminal,
      terminalDist: 1.2,
      chest: someChest,
      chestDist: 0.3,
    });
    expect(near).toBe("[E] Search");
  });

  it("puts a breaker above a door when it is nearer", () => {
    const label = promptLabelFor({
      ...nothing(),
      door: shutDoor,
      doorDist: 1,
      breaker: liveBreaker,
      breakerDist: 0.9,
    });
    expect(label).toBe("[E] Cut power");
  });

  /**
   * Pins current behaviour, which does *not* match the comparison's own comment.
   *
   * The comment says the breaker sits "above the door, matching the tap order:
   * same reach". The tap order in `updateInteractions` breaks the tie with `<=`
   * (`nearestBreakerDist <= Math.min(nearestDoorDist, hatchDist)`), so at an
   * exact tie the tap throws the breaker — but this comparison uses `<`, so the
   * prompt advertises the door. At that one distance the label lies about what
   * the key will do.
   *
   * Left as-is rather than fixed here: this predates the extraction, and
   * changing a gameplay tie-break inside a move is how a refactor stops being
   * reviewable. Flagged for its own change.
   */
  it("gives an exact tie to the door, unlike the tap order", () => {
    const label = promptLabelFor({
      ...nothing(),
      door: shutDoor,
      doorDist: 1,
      breaker: liveBreaker,
      breakerDist: 1,
    });
    expect(label).toBe("[E] Open");
  });

  it("never lets a vault steal the slot from a door or a hatch", () => {
    // A crate is scenery Rowan happens to be facing; a door is a destination.
    expect(promptLabelFor({ ...nothing(), vault: true, door: shutDoor, doorDist: 1.3 })).toBe(
      "[E] Open",
    );
    expect(promptLabelFor({ ...nothing(), vault: true, hatch: true })).toBe("[E] Use access");
    // Only with nothing else claiming the slot does it appear.
    expect(promptLabelFor({ ...nothing(), vault: true })).toBe("[E] Vault");
  });

  it("lets a hatch under your feet beat anything further than a fifth of a tile", () => {
    expect(promptLabelFor({ ...nothing(), hatch: true, door: shutDoor, doorDist: 0.9 })).toBe(
      "[E] Use access",
    );
    // ...but not something closer than the hatch's own 0.2 threshold.
    expect(promptLabelFor({ ...nothing(), hatch: true, door: shutDoor, doorDist: 0.1 })).toBe(
      "[E] Open",
    );
  });

  it("lets a gated transition outrank every verb in reach", () => {
    const label = promptLabelFor({
      ...nothing(),
      terminal: someTerminal,
      terminalDist: 0.1,
      lockedLabel: "[ROOF SEALED]",
    });
    expect(label).toBe("[ROOF SEALED]");
  });

  it("ranks the encounter's own label by its distance like any other candidate", () => {
    expect(
      promptLabelFor({ ...nothing(), ventLabel: "[E] Jam", ventDist: 0.2, chest: someChest, chestDist: 1 }),
    ).toBe("[E] Jam");
    expect(
      promptLabelFor({ ...nothing(), ventLabel: "[E] Jam", ventDist: 2, chest: someChest, chestDist: 1 }),
    ).toBe("[E] Search");
  });
});

describe("statusMarkerFor", () => {
  const standing = { x: 0, y: 0, peeking: false, pressed: false };

  it("shows nothing when Rowan is neither hidden, peeking, pressed nor compliant", () => {
    expect(statusMarkerFor(standing, false, false)).toBeUndefined();
  });

  it("ranks concealment first — it survives an alert, compliance does not", () => {
    const marker = statusMarkerFor({ ...standing, peeking: true, pressed: true }, true, true);
    expect(marker).toEqual({ label: "HIDDEN", color: UI.greenSoft });
  });

  it("ranks peeking above pressing, and pressing above compliance", () => {
    expect(statusMarkerFor({ ...standing, peeking: true, pressed: true }, false, true)?.label).toBe(
      "PEEKING",
    );
    expect(statusMarkerFor({ ...standing, pressed: true }, false, true)?.label).toBe("PRESSED");
    expect(statusMarkerFor(standing, false, true)?.label).toBe("COMPLIANT");
  });

  it("colours compliance blue and everything unprotected amber", () => {
    expect(statusMarkerFor(standing, false, true)?.color).toBe(UI.blueSoft);
    expect(statusMarkerFor({ ...standing, pressed: true }, false, false)?.color).toBe(UI.amber);
  });
});
