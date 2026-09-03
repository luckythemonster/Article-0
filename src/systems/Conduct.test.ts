import { describe, it, expect } from "vitest";
import {
  ConductState,
  FLAG_HOSTILE,
  FLAG_TAMPERING,
  FLAG_UNAUTHORIZED,
  SETTLE_SECONDS,
} from "./Conduct";

/** Clean conduct: walking normally, base unaware, no credential. */
const CLEAN = {
  alertPhase: "INFILTRATION" as const,
  running: false,
  sneaking: false,
  certified: false,
};

/** Runs `seconds` of clean behaviour in small steps. */
function settle(c: ConductState, seconds: number): void {
  const step = 0.1;
  for (let t = 0; t < seconds; t += step) c.update(step, CLEAN);
}

describe("ConductState", () => {
  it("starts compliant when behaviour is clean", () => {
    const c = new ConductState();
    c.update(0.1, CLEAN);
    expect(c.compliant).toBe(true);
    expect(c.breach).toBeNull();
  });

  it("breaks on running, and names it", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, running: true });
    expect(c.compliant).toBe(false);
    expect(c.breach).toBe("RUNNING");
  });

  it("breaks on sneaking — skulking is its own tell", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, sneaking: true });
    expect(c.compliant).toBe(false);
    expect(c.breach).toBe("SNEAKING");
  });

  it("blocks compliance during an active alert, whatever the gait", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, alertPhase: "ALERT" });
    expect(c.compliant).toBe(false);
    expect(c.breach).toBe("ALERT");
  });

  it("needs a settle period of clean behaviour after a continuous breach", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, running: true });
    // Stopping is not enough on its own.
    c.update(0.1, CLEAN);
    expect(c.compliant).toBe(false);
    settle(c, SETTLE_SECONDS);
    expect(c.compliant).toBe(true);
  });

  it("holds a discrete violation well past the settle period", () => {
    const c = new ConductState();
    c.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED);
    settle(c, SETTLE_SECONDS + 0.5);
    expect(c.compliant).toBe(false);
    expect(c.breach).toBe("UNAUTHORIZED");
    settle(c, FLAG_UNAUTHORIZED);
    expect(c.compliant).toBe(true);
    expect(c.breach).toBeNull();
  });

  it("takes the longer flag rather than letting a lesser one cut it short", () => {
    const c = new ConductState();
    c.violate("HOSTILE", FLAG_HOSTILE);
    c.violate("TAMPERING", FLAG_TAMPERING);
    expect(c.flaggedRemaining).toBeCloseTo(FLAG_HOSTILE);
    expect(c.breach).toBe("HOSTILE");
  });

  it("tops the flag back up when a held action re-reports it every frame", () => {
    const c = new ConductState();
    for (let i = 0; i < 30; i++) {
      c.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED);
      c.update(0.1, CLEAN);
    }
    // Three seconds of hacking later the full cooldown is still ahead, less only the
    // one frame of decay that followed the last report.
    expect(c.flaggedRemaining).toBeCloseTo(FLAG_UNAUTHORIZED - 0.1, 5);
    expect(c.compliant).toBe(false);
  });

  it("reports the live condition over a still-decaying discrete one", () => {
    const c = new ConductState();
    c.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED);
    c.update(0.1, { ...CLEAN, running: true });
    expect(c.breach).toBe("RUNNING");
    // The discrete flag is still underneath, and resurfaces once you stop running.
    c.update(0.1, CLEAN);
    expect(c.breach).toBe("UNAUTHORIZED");
  });

  it("blocks compliance during a search without the Q0 cert", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, alertPhase: "EVASION" });
    expect(c.compliant).toBe(false);
    expect(c.breach).toBe("EVASION");
  });

  it("lets the Q0 cert stand a search down", () => {
    const c = new ConductState();
    settle(c, 0.3);
    c.update(0.1, { ...CLEAN, alertPhase: "EVASION", certified: true });
    expect(c.compliant).toBe(true);
    expect(c.breach).toBeNull();
  });

  it("still blocks an active alert even with the cert — that's the bound", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, alertPhase: "ALERT", certified: true });
    expect(c.compliant).toBe(false);
    expect(c.breach).toBe("ALERT");
  });

  it("does not let the cert shorten a discrete flag", () => {
    // The cert only relaxes the alert rule. If a later tuning pass widens it into a
    // general cooldown reduction, that should be a deliberate change, not a silent one.
    const plain = new ConductState();
    const certified = new ConductState();
    plain.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED);
    certified.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED);
    for (let i = 0; i < 20; i++) {
      plain.update(0.1, CLEAN);
      certified.update(0.1, { ...CLEAN, certified: true });
    }
    expect(certified.flaggedRemaining).toBeCloseTo(plain.flaggedRemaining, 5);
  });

  it("ignores a zero-length violation", () => {
    const c = new ConductState();
    c.update(0.1, CLEAN);
    c.violate("TAMPERING", 0);
    expect(c.compliant).toBe(true);
  });
});

describe("ConductState metrics", () => {
  /** Walks `tiles` of clean, compliant ground in one-tile steps. */
  function walk(c: ConductState, tiles: number): void {
    for (let i = 0; i < tiles; i++) c.update(0.1, { ...CLEAN, movedTiles: 1 });
  }

  it("counts one held action as one sabotage act, not one per frame", () => {
    const c = new ConductState();
    // A terminal hold re-reports itself every frame — the exact shape GameScene uses.
    for (let i = 0; i < 30; i++) {
      c.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED);
      c.update(0.1, CLEAN);
    }
    expect(c.sabotageActions).toBe(1);
  });

  it("counts a second act once the first has settled", () => {
    const c = new ConductState();
    c.violate("TAMPERING", FLAG_TAMPERING);
    settle(c, FLAG_TAMPERING + 1);
    c.violate("TAMPERING", FLAG_TAMPERING);
    expect(c.sabotageActions).toBe(2);
  });

  it("counts a different kind of act even while the first is still flagged", () => {
    const c = new ConductState();
    c.violate("UNAUTHORIZED", FLAG_UNAUTHORIZED);
    c.violate("HOSTILE", FLAG_HOSTILE);
    expect(c.sabotageActions).toBe(2);
  });

  it("accrues distance only while actually passing as staff", () => {
    const c = new ConductState();
    walk(c, 10);
    expect(c.complianceDistanceWalked).toBe(10);

    // Sprinting is a breach, so the ground covered doing it doesn't count.
    for (let i = 0; i < 10; i++) c.update(0.1, { ...CLEAN, running: true, movedTiles: 1 });
    expect(c.complianceDistanceWalked).toBe(10);
  });

  it("reports high compliance only for a long quiet run", () => {
    const c = new ConductState();
    expect(c.isHighCompliance()).toBe(false);
    walk(c, 400);
    expect(c.isHighCompliance()).toBe(true);
  });

  it("withdraws high compliance once the sabotage count climbs", () => {
    const c = new ConductState();
    walk(c, 400);
    expect(c.isHighCompliance()).toBe(true);
    for (let i = 0; i < 3; i++) {
      c.violate("TAMPERING", FLAG_TAMPERING);
      settle(c, FLAG_TAMPERING + 1);
    }
    expect(c.sabotageActions).toBe(3);
    expect(c.isHighCompliance()).toBe(false);
  });

  it("carries its totals across a level change", () => {
    const c = new ConductState();
    walk(c, 40);
    c.violate("HOSTILE", FLAG_HOSTILE);

    // What GameScene does on scene.restart(): rebuild from the published metrics.
    const next = new ConductState(c.metrics());
    expect(next.complianceDistanceWalked).toBe(40);
    expect(next.sabotageActions).toBe(1);
    walk(next, 10);
    expect(next.complianceDistanceWalked).toBe(50);
  });
});

describe("ConductState under a forced posture", () => {
  it("reads as compliant no matter what Rowan is doing", () => {
    const c = new ConductState();
    c.violate("HOSTILE", FLAG_HOSTILE);
    expect(c.compliant).toBe(false);
    c.update(0.1, { ...CLEAN, running: true, forced: true });
    expect(c.compliant).toBe(true);
  });

  it("keeps draining the flag underneath, so release doesn't hand back a stale one", () => {
    const c = new ConductState();
    c.violate("TAMPERING", FLAG_TAMPERING);
    for (let t = 0; t < FLAG_TAMPERING + 1; t += 0.1) {
      c.update(0.1, { ...CLEAN, forced: true });
    }
    // Released: the cooldown ran while the core was holding him, so he is genuinely clean.
    c.update(0.1, CLEAN);
    expect(c.compliant).toBe(true);
  });

  it("re-imposes an ordinary breach the moment the field drops", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, running: true, forced: true });
    expect(c.compliant).toBe(true);
    c.update(0.1, { ...CLEAN, running: true });
    expect(c.compliant).toBe(false);
    expect(c.breach).toBe("RUNNING");
  });

  it("still accrues distance, since the mesh is reading him as staff", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, forced: true, movedTiles: 3 });
    expect(c.complianceDistanceWalked).toBe(3);
  });
});

describe("SETTLE_SECONDS", () => {
  it("is the floor a continuous breach pins the timer to", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, running: true });
    expect(c.flaggedRemaining).toBeGreaterThanOrEqual(SETTLE_SECONDS);
  });
});

/**
 * Trespass — the one breach that is about where Rowan is rather than how he is moving.
 *
 * Whether the ground under him is restricted is `src/systems/Clearance.ts`'s question
 * and is tested there; this is only about how the answer behaves once it arrives here.
 */
describe("ConductState on restricted ground", () => {
  it("breaks compliance on walking into somewhere he isn't admitted", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, trespassing: true });
    expect(c.compliant).toBe(false);
    expect(c.breach).toBe("TRESPASS");
  });

  it("holds while he stays, rather than expiring under him", () => {
    // The whole difference from a discrete violation: standing still in a server aisle
    // must not quietly become compliant again after a cooldown.
    const c = new ConductState();
    for (let t = 0; t < 10; t += 0.1) c.update(0.1, { ...CLEAN, trespassing: true });
    expect(c.compliant).toBe(false);
    expect(c.breach).toBe("TRESPASS");
  });

  it("costs a beat of honest walking on the way out, like ending a sprint", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, trespassing: true });
    c.update(0.1, CLEAN);
    expect(c.compliant).toBe(false);
    settle(c, SETTLE_SECONDS + 0.2);
    expect(c.compliant).toBe(true);
    expect(c.breach).toBeNull();
  });

  it("outranks running and sneaking, which are choices he can stop where he stands", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, trespassing: true, running: true, sneaking: true });
    expect(c.breach).toBe("TRESPASS");
  });

  it("loses to an active alert and to a search, which no room explains", () => {
    const alerted = new ConductState();
    alerted.update(0.1, { ...CLEAN, alertPhase: "ALERT", trespassing: true });
    expect(alerted.breach).toBe("ALERT");

    const searched = new ConductState();
    searched.update(0.1, { ...CLEAN, alertPhase: "EVASION", trespassing: true });
    expect(searched.breach).toBe("EVASION");
  });

  it("is not sabotage, however long he stands there", () => {
    // `violate` counts acts, and counting this one would have EIRA-7 read a player who
    // walked through a server aisle as one who had been pulling the place apart.
    const c = new ConductState();
    for (let t = 0; t < 30; t += 0.1) c.update(0.1, { ...CLEAN, trespassing: true });
    expect(c.sabotageActions).toBe(0);
  });

  it("stops him banking distance as compliant walking", () => {
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, trespassing: true, movedTiles: 5 });
    expect(c.complianceDistanceWalked).toBe(0);
  });

  it("is pinned off by the correction field, like every other breach", () => {
    // NW-SMAC-01 is the thing doing the reading, so it reads him as compliant wherever
    // he is standing — the memo says as much: "no further clearance handling required".
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, trespassing: true, forced: true });
    expect(c.compliant).toBe(true);
  });

  it("does nothing at all when he is cleared for the ground", () => {
    // The caller resolves the keycard, so "cleared" reaches this module simply as an
    // absence — and an absence has to be indistinguishable from open floor.
    const c = new ConductState();
    c.update(0.1, { ...CLEAN, trespassing: false });
    expect(c.compliant).toBe(true);
    expect(c.breach).toBeNull();
  });
});
