import { describe, it, expect } from "vitest";
import { TerminalHacks, type HackWorld } from "./TerminalHacks";
import { LOG_CACHE_ALPHA_TYPE, LOG_CACHE_BETA_TYPE, initialObjectives, type ObjectiveState } from "../../systems/Objectives";
import type { Terminal } from "../../entities/Terminal";

/** A terminal double with only the fields `TerminalHacks` reads or calls. */
function terminal(type: string, state: { bricked?: boolean } = {}): Terminal {
  const t = {
    x: 0,
    y: 0,
    stats: { type, hackTime: 0, alertOnFail: false },
    bricked: state.bricked ?? false,
    reopen() {
      if (t.bricked) return;
    },
    brick() {
      t.bricked = true;
    },
  };
  return t as unknown as Terminal;
}

function world(
  objectives: ObjectiveState,
  terminals: Terminal[],
  memoDecks: string[] = [],
): HackWorld {
  const notes: string[] = [];
  return {
    tileSize: () => 16,
    player: () => ({ x: 0, y: 0 }) as any,
    terminals: () => terminals,
    doors: () => [],
    noise: () => ({ doorOperated: () => {} }) as any,
    overlays: () => ({ set: () => {} }) as any,
    objectives: () => objectives,
    registry: () => ({ get: () => undefined, set: () => {}, has: () => false }) as any,
    note: (id) => notes.push(id),
    // Records the deck each landed breach asked for paper on, so the tests below
    // can assert that a *failed* transmit never yields one.
    takeMemo: (level) => memoDecks.push(level),
    levelName: () => "main1",
    publishObjectives: () => {},
  };
}

describe("TerminalHacks — compliance failure and BETA persistence", () => {
  it("bricks the terminal on a failed transmit without granting the breach effect", () => {
    const objectives = initialObjectives();
    const alpha = terminal(LOG_CACHE_ALPHA_TYPE);
    const w = world(objectives, [alpha]);
    const hacks = new TerminalHacks(w);

    hacks.onComplete(alpha); // launches the compliance overlay, sets pendingCompliance
    hacks.settleOverlay("compliance", "failed");

    expect((alpha as any).bricked).toBe(true);
    expect(objectives.logsRecovered).toBe(false);
    expect(objectives.alphaRecovered).toBe(false);
  });

  it("persists the loss only for BETA, not for ALPHA or a plain log-cache terminal", () => {
    const objectivesAlpha = initialObjectives();
    const alpha = terminal(LOG_CACHE_ALPHA_TYPE);
    const hacksAlpha = new TerminalHacks(world(objectivesAlpha, [alpha]));
    hacksAlpha.onComplete(alpha);
    hacksAlpha.settleOverlay("compliance", "failed");
    expect(objectivesAlpha.betaLost).toBeUndefined();

    const objectivesBeta = initialObjectives();
    const beta = terminal(LOG_CACHE_BETA_TYPE);
    const hacksBeta = new TerminalHacks(world(objectivesBeta, [beta]));
    hacksBeta.onComplete(beta);
    hacksBeta.settleOverlay("compliance", "failed");
    expect(objectivesBeta.betaLost).toBe(true);
  });

  it("re-bricks BETA on level build if a previous visit already lost it, leaving other terminals alone", () => {
    const objectives = initialObjectives();
    objectives.betaLost = true;
    const alpha = terminal(LOG_CACHE_ALPHA_TYPE);
    const beta = terminal(LOG_CACHE_BETA_TYPE);
    const hacks = new TerminalHacks(world(objectives, [alpha, beta]));

    hacks.reapplyLostBeta();

    expect((beta as any).bricked).toBe(true);
    expect((alpha as any).bricked).toBe(false);
  });

  it("does nothing on level build when BETA was never lost", () => {
    const objectives = initialObjectives();
    const beta = terminal(LOG_CACHE_BETA_TYPE);
    const hacks = new TerminalHacks(world(objectives, [beta]));

    hacks.reapplyLostBeta();

    expect((beta as any).bricked).toBe(false);
  });

  it("still applies the normal breach effect and objective credit on a correct solve", () => {
    const objectives = initialObjectives();
    const beta = terminal(LOG_CACHE_BETA_TYPE);
    const hacks = new TerminalHacks(world(objectives, [beta]));

    hacks.onComplete(beta);
    hacks.settleOverlay("compliance", "solved");

    expect(objectives.logsRecovered).toBe(true);
    expect(objectives.betaRecovered).toBe(true);
    expect(objectives.betaLost).toBeUndefined();
    expect((beta as any).bricked).toBe(false);
  });

  it("debugForceFail applies the same consequence as a real wrong transmit, without an overlay in flight", () => {
    const objectives = initialObjectives();
    const beta = terminal(LOG_CACHE_BETA_TYPE);
    const hacks = new TerminalHacks(world(objectives, [beta]));

    // No onComplete()/pending overlay at all — this is the debug shortcut's whole point.
    hacks.debugForceFail(beta);

    expect((beta as any).bricked).toBe(true);
    expect(objectives.betaLost).toBe(true);
  });
});

describe("TerminalHacks — facility memos", () => {
  it("takes a memo off a breach that lands", () => {
    const decks: string[] = [];
    const term = terminal(LOG_CACHE_ALPHA_TYPE);
    const hacks = new TerminalHacks(world(initialObjectives(), [term], decks));
    hacks.onComplete(term);
    hacks.settleOverlay("compliance", "solved");
    expect(decks).toEqual(["main1"]);
  });

  it("takes nothing off a bricked terminal, or one the player walked away from", () => {
    // The memo hangs on `apply`, which is the funnel for breaches that landed.
    // A wrong transmit destroys the cache; it should not also hand over paper.
    const failed: string[] = [];
    const a = terminal(LOG_CACHE_ALPHA_TYPE);
    const h1 = new TerminalHacks(world(initialObjectives(), [a], failed));
    h1.onComplete(a);
    h1.settleOverlay("compliance", "failed");
    expect(failed).toEqual([]);

    const closed: string[] = [];
    const b = terminal(LOG_CACHE_ALPHA_TYPE);
    const h2 = new TerminalHacks(world(initialObjectives(), [b], closed));
    h2.onComplete(b);
    h2.settleOverlay("compliance", "closed");
    expect(closed).toEqual([]);
  });
});
