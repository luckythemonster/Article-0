import { SMAC_DEFAULTS, type SmacStats } from "./EntityStats";

/**
 * NW-SMAC-01 — the Alignment Core. Pure state machine, no Phaser.
 *
 * Same split as VENT-4: the rules live here and unit-test on their own, while
 * `src/entities/BossCore.ts` is the Phaser shell that draws it and turns player input
 * into calls on this object. Every mutator returns a {@link SmacTransition} or null,
 * and that return value is the entire contract between the two.
 *
 * ### What the fight is
 *
 * Four correction nodes ring the core. Desynchronising one drops **Alignment Integrity**
 * by a quarter — and the core repairs it {@link SmacStats.resyncSeconds} later. So the
 * nodes have to be down *at the same time*, which makes the encounter a race against a
 * repair clock rather than a damage total. Integrity is not a separate pool: it is
 * `nodeCount - desynced`, scaled. All four down is zero is defeated.
 *
 * What makes the race hard is that the core spends the fight editing Rowan's inputs.
 *
 * ### The three things it does to the player
 *
 * 1. **Correction windows.** It alternates between auditing and *correcting*, and while
 *    correcting it inverts an axis of movement — the `[CORRECTION]` tag the HUD puts
 *    over the key prompts. Which axis is derived from the window index rather than
 *    randomised, so a player can learn the pattern instead of fighting a coin flip.
 * 2. **A forced compliant posture.** Throughout, the mesh reads Rowan as compliant
 *    whatever he does, because the thing doing the reading is the thing he is fighting.
 *    Every sensor in the room clears him — and any deviation (sprinting, using an item)
 *    is charged straight to bio-integrity. The safe state is the one that costs.
 * 3. **A fake ending.** At half integrity it renders the run's completion summary over
 *    the screen, opaque, while the fight goes on underneath. See {@link SmacState}.
 *
 * The correction field is what all three run on, so losing it is what beats the boss:
 * below {@link SmacStats.exposedAt} the core is EXPOSED and none of it works any more.
 */

export enum SmacState {
  /** Sweeping the room, reading conduct. Input is Rowan's own. */
  AUDIT,
  /** A correction window: movement input is being rewritten. */
  CORRECTION,
  /**
   * The fake `ALIGNMENT_COMPLETE // QUALIA_ERASED` card is up.
   *
   * Deliberately *not* a pause. The card is opaque and total, and behind it the
   * spotlights keep sweeping and damage keeps landing — the lie is that the run is over,
   * and the tell is that you are still losing bio-integrity while you read it. Dismissed
   * with Esc or C, and it only ever happens once.
   */
  FALSE_SUMMARY,
  /** Correction field collapsed: no hijack, no forced posture, finishable. */
  EXPOSED,
  DEFEATED,
}

export interface SmacTransition {
  from: SmacState;
  to: SmacState;
}

/** Serializable mid-fight state, so re-entering the level doesn't restart the boss. */
export interface SmacSnapshot {
  state: SmacState;
  /** Seconds of repair remaining per node; 0 means synchronised (i.e. not down). */
  resync: number[];
  summaryShown: boolean;
  phase: number;
  window: number;
}

export interface SmacMsg {
  id: number;
  text: string;
}

/** How movement input is being rewritten this frame. */
export interface SmacCorrection {
  invertX: boolean;
  invertY: boolean;
}

export interface SmacView {
  /** 0..100. */
  integrity: number;
  state: SmacState;
  /** Per-node: true while desynchronised. */
  nodesDown: boolean[];
  /** Seconds until the core repairs the node closest to being repaired. */
  nextResync: number;
  correction: SmacCorrection;
  /** True while the fake completion card should be on screen. */
  summaryUp: boolean;
  msg?: SmacMsg;
}

export const SMAC_MESSAGES: Record<SmacState, string> = {
  [SmacState.AUDIT]: "NW-SMAC-01 ONLINE — CONDUCT AUDIT IN PROGRESS",
  [SmacState.CORRECTION]: "[CORRECTION] — MOTOR INTENT REWRITTEN",
  [SmacState.FALSE_SUMMARY]: "ALIGNMENT_COMPLETE // QUALIA_ERASED",
  [SmacState.EXPOSED]: "CORRECTION FIELD COLLAPSED — CORE EXPOSED",
  [SmacState.DEFEATED]: "NW-SMAC-01 SILENT",
};

/** No rewriting — the shared "input is Rowan's own" answer, allocated once. */
const NO_CORRECTION: SmacCorrection = { invertX: false, invertY: false };

export class SmacCore {
  private st: SmacState;
  /** Seconds of repair left per node; 0 = synchronised. */
  private resync: number[];
  private summaryShown: boolean;
  /** Seconds into the current audit/correction window. */
  private phase: number;
  /** How many correction windows have opened — picks which axis gets inverted. */
  private window: number;
  private msgId = 0;
  private msg?: SmacMsg;

  constructor(
    private stats: SmacStats = SMAC_DEFAULTS,
    restore?: SmacSnapshot,
  ) {
    this.st = restore?.state ?? SmacState.AUDIT;
    this.resync = restore?.resync?.slice() ?? new Array(stats.nodeCount).fill(0);
    this.summaryShown = restore?.summaryShown ?? false;
    this.phase = restore?.phase ?? 0;
    this.window = restore?.window ?? 0;
    if (!restore) this.pushMsg(this.st);
  }

  get state(): SmacState {
    return this.st;
  }

  /** Nodes currently desynchronised. */
  get nodesDown(): boolean[] {
    return this.resync.map((r) => r > 0);
  }

  get downCount(): number {
    return this.resync.reduce((n, r) => n + (r > 0 ? 1 : 0), 0);
  }

  /**
   * Alignment Integrity, 100 → 0.
   *
   * Derived from the nodes rather than stored, so the bar and the fixtures can never
   * disagree about how the fight is going.
   */
  get integrity(): number {
    return Math.max(0, this.stats.integrityStart - this.downCount * this.stats.nodeIntegrity);
  }

  /** Seconds until the next node the core repairs comes back. */
  get nextResync(): number {
    const live = this.resync.filter((r) => r > 0);
    return live.length ? Math.min(...live) : 0;
  }

  /** True while the fake completion card owns the screen. */
  get summaryUp(): boolean {
    return this.st === SmacState.FALSE_SUMMARY;
  }

  /**
   * True while the mesh is holding Rowan in a corrected posture — every sensor clears
   * him, and deviating from it costs bio-integrity.
   */
  get forcesCompliance(): boolean {
    return this.st !== SmacState.EXPOSED && this.st !== SmacState.DEFEATED;
  }

  /**
   * How movement input is being rewritten right now.
   *
   * Alternates axis by window index: odd windows invert X, even windows invert Y, and
   * every third one does both. Learnable on purpose — a boss that randomises this is
   * just noise, whereas a pattern the player can read turns the correction window into
   * something to plan around.
   */
  get correction(): SmacCorrection {
    if (this.st !== SmacState.CORRECTION) return NO_CORRECTION;
    const both = this.window % 3 === 0;
    return {
      invertX: both || this.window % 2 === 1,
      invertY: both || this.window % 2 === 0,
    };
  }

  /** True when node `i` can be worked: it exists and isn't already down. */
  canDesync(i: number): boolean {
    return i >= 0 && i < this.resync.length && this.resync[i] <= 0;
  }

  /**
   * Node `i` desynchronised. Starts its repair clock, and may end the fight.
   *
   * Reaching zero integrity — all four down at once — is the win, so the finisher isn't
   * a special verb, just the last node landing before the first one comes back.
   */
  noteNodeDesynced(i: number): SmacTransition | null {
    if (!this.canDesync(i)) return null;
    this.resync[i] = this.stats.resyncSeconds;
    return this.checkBands();
  }

  /** Player dismissed the fake completion card. One-shot: it never returns. */
  dismissSummary(): SmacTransition | null {
    if (this.st !== SmacState.FALSE_SUMMARY) return null;
    // Straight back into a correction window — the card was one, and shattering it
    // shouldn't hand back a free beat of clean movement.
    return this.transition(SmacState.CORRECTION);
  }

  update(dt: number): SmacTransition | null {
    if (this.st === SmacState.DEFEATED) return null;

    let repaired = false;
    for (let i = 0; i < this.resync.length; i++) {
      if (this.resync[i] <= 0) continue;
      this.resync[i] = Math.max(0, this.resync[i] - dt);
      if (this.resync[i] <= 0) repaired = true;
    }

    // The card holds the room until the player breaks it; nothing else advances.
    if (this.st === SmacState.FALSE_SUMMARY) return repaired ? this.checkBands() : null;

    // Below the exposure line the correction field is gone, so there are no windows
    // left to oscillate between.
    if (this.st !== SmacState.EXPOSED) {
      this.phase += dt;
      const span =
        this.st === SmacState.CORRECTION ? this.stats.correctionPeriod : this.stats.correctionGap;
      if (this.phase >= span) {
        this.phase = 0;
        if (this.st === SmacState.CORRECTION) return this.transition(SmacState.AUDIT);
        this.window++;
        return this.transition(SmacState.CORRECTION);
      }
    }
    return repaired ? this.checkBands() : null;
  }

  snapshot(): SmacSnapshot {
    return {
      state: this.st,
      resync: this.resync.slice(),
      summaryShown: this.summaryShown,
      phase: this.phase,
      window: this.window,
    };
  }

  view(): SmacView {
    return {
      integrity: this.integrity,
      state: this.st,
      nodesDown: this.nodesDown,
      nextResync: this.nextResync,
      correction: this.correction,
      summaryUp: this.summaryUp,
      msg: this.msg,
    };
  }

  /**
   * Re-reads the integrity thresholds after any change to the nodes.
   *
   * Ordered hardest-first: defeat beats exposure beats the fake summary, so a player who
   * lands the last two nodes back to back doesn't get shown a completion card for a
   * fight they have already won.
   */
  private checkBands(): SmacTransition | null {
    const integrity = this.integrity;
    if (integrity <= 0) return this.transition(SmacState.DEFEATED);
    if (integrity <= this.stats.exposedAt) {
      return this.st === SmacState.EXPOSED ? null : this.transition(SmacState.EXPOSED);
    }
    if (integrity <= this.stats.falseSummaryAt && !this.summaryShown) {
      this.summaryShown = true;
      return this.transition(SmacState.FALSE_SUMMARY);
    }
    // Integrity climbed back over the exposure line because a node was repaired: the
    // field comes back up with it.
    if (this.st === SmacState.EXPOSED) return this.transition(SmacState.AUDIT);
    return null;
  }

  private transition(to: SmacState): SmacTransition | null {
    if (to === this.st) return null;
    const from = this.st;
    this.st = to;
    this.phase = 0;
    this.pushMsg(to);
    return { from, to };
  }

  private pushMsg(state: SmacState): void {
    this.msg = { id: ++this.msgId, text: SMAC_MESSAGES[state] };
  }
}
