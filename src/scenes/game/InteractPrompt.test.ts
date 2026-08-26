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
    locker: undefined,
    lockerDist: Infinity,
    body: false,
    bodyDist: Infinity,
    carrying: false,
  };
}

/** Only the fields the prompt reads — the entities themselves are irrelevant here. */
const openDoor = { isOpen: true } as PromptCandidates["door"];
const shutDoor = { isOpen: false } as PromptCandidates["door"];
const liveBreaker = { isClosed: true } as PromptCandidates["breaker"];
const cutBreaker = { isClosed: false } as PromptCandidates["breaker"];
const someTerminal = {} as PromptCandidates["terminal"];
const someChest = {} as PromptCandidates["chest"];

describe("promptLabelFor — bodies and lockers", () => {
  it("names which way the locker verb runs", () => {
    expect(
      promptLabelFor({ ...nothing(), locker: { occupied: false }, lockerDist: 1 }),
    ).toBe("[E] Stash body");
    expect(
      promptLabelFor({ ...nothing(), locker: { occupied: true }, lockerDist: 1 }),
    ).toBe("[E] Retrieve body");
  });

  it("offers the pick-up over a body, and the put-down once he has one", () => {
    expect(promptLabelFor({ ...nothing(), body: true, bodyDist: 0.5 })).toBe("[E] Pick up");
    expect(promptLabelFor({ ...nothing(), carrying: true })).toBe("[E] Put down");
  });

  it("resolves a body against a locker by which is nearer", () => {
    // Both are real verbs at the same key and neither outranks the other, so this
    // is the plain nearest-wins the rest of the list uses. It reads correctly
    // either way round, which is why it is left alone: with empty hands over a
    // body the tap picks it up, and there is nothing a locker could do for him
    // that he has not got a hand free for yet.
    const near = { ...nothing(), locker: { occupied: true }, lockerDist: 0.9 };
    expect(promptLabelFor({ ...near, body: true, bodyDist: 0.4 })).toBe("[E] Pick up");
    expect(promptLabelFor({ ...near, body: true, bodyDist: 1.2 })).toBe("[E] Retrieve body");
  });

  it("keeps the put-down quiet while anything else is in reach", () => {
    // Carrying is not a nearest-wins candidate — it has no distance — so it only
    // fills the slot when nothing else claimed it. Otherwise standing over a
    // terminal with a body up would offer the wrong verb.
    const label = promptLabelFor({
      ...nothing(),
      carrying: true,
      locker: { occupied: false },
      lockerDist: 1,
    });
    expect(label).toBe("[E] Stash body");
  });
});

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
   * The tie the label used to get wrong.
   *
   * `updateInteractions` claims the tap with
   * `nearestBreakerDist <= Math.min(nearestDoorDist, hatchDist)`, so at an exact
   * tie the breaker wins. The prompt compared with `<` *after* the door, so it
   * advertised "[E] Open" while the key cut the power.
   */
  it("gives an exact door tie to the breaker, matching the tap order", () => {
    const label = promptLabelFor({
      ...nothing(),
      door: shutDoor,
      doorDist: 1,
      breaker: liveBreaker,
      breakerDist: 1,
    });
    expect(label).toBe("[E] Cut power");
  });

  it("gives an exact hatch tie to the breaker, matching the tap order", () => {
    // hatchDist is the literal 0.2 both sides use.
    expect(promptLabelFor({ ...nothing(), hatch: true, breaker: liveBreaker, breakerDist: 0.2 })).toBe(
      "[E] Cut power",
    );
  });

  it("still loses a tie to the holds above it, which the tap order does not claim", () => {
    // Terminals and chests are held, not tapped, so nothing in updateInteractions
    // says a breaker should take a tie from them. Fixing the door tie with `<=`
    // instead of by ordering would have changed these too.
    expect(
      promptLabelFor({ ...nothing(), chest: someChest, chestDist: 1, breaker: liveBreaker, breakerDist: 1 }),
    ).toBe("[E] Search");
    expect(
      promptLabelFor({
        ...nothing(),
        terminal: someTerminal,
        terminalDist: 1,
        breaker: liveBreaker,
        breakerDist: 1,
      }),
    ).toBe("[E] Hack");
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
