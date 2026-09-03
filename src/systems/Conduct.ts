/**
 * Conduct — whether Rowan currently reads to the facility as compliant staff.
 *
 * The alternative to not being seen. Everything in this place is built around
 * conformance (Alignment, Q0 statutory compliance, the Subjectivity Risk Profile), so
 * someone who walks normally, touches nothing they shouldn't and sets off no alarm is
 * waved through in plain sight — guards, drones, orderlies and cameras all clear him.
 * Behave badly and that cover evaporates, and the usual stealth rules resume.
 *
 * It inverts the normal grammar on purpose: **sneaking is a tell**. Crouch-walking
 * past a guard is exactly what an intruder does, so it breaks compliance even though
 * it is the safe move when you're relying on cover instead.
 *
 * One timer drives the whole thing — while it is above zero you are flagged, and
 * compliance is just `flagged <= 0`. Pure (no Phaser, no DOM), like {@link AlertState}
 * and {@link SharedField}, so the rules are unit-testable on their own.
 *
 * Named `Conduct` rather than `Compliance` because `src/systems/Compliance.ts` is
 * already the Doctrinal Compliance log-pruning minigame. The player-facing readout
 * still says COMPLIANCE — in the fiction they are the same doctrine.
 */

import type { AlertPhase } from "./AlertState";

/** Why compliance is currently withheld. Drives the HUD readout. */
export type ConductBreach =
  /** Active pursuit. Nothing talks your way out of this, credential or not. */
  | "ALERT"
  /**
   * Guards are sweeping for you. Blocking unless Rowan carries the Q0 compliance
   * cert — with papers in hand he can stand the search down and pass as staff again.
   */
  | "EVASION"
  | "RUNNING"
  | "SNEAKING"
  /**
   * Standing on ground staff clearance does not admit him — see
   * {@link ../systems/Clearance}. The one breach that is about *place* rather than
   * behaviour, and so the one no amount of walking normally answers: a numbered
   * keycard does, and nothing else.
   */
  | "TRESPASS"
  /** Working a terminal or a silicate rack. */
  | "UNAUTHORIZED"
  /** Searching a container, rapping on walls. */
  | "TAMPERING"
  /** Stun round, chaff burst. */
  | "HOSTILE"
  /** Clean again, but still standing down from something. */
  | "SETTLING";

/** The player's live conduct, sampled once per frame. */
export interface ConductInput {
  /** The global alert phase. ALERT and EVASION are not equivalent — see `certified`. */
  alertPhase: AlertPhase;
  running: boolean;
  /** Crouched — whether moving or not. Skulking is its own kind of conspicuous. */
  sneaking: boolean;
  /**
   * Carrying `Q0_COMPLIANCE_CERT`, the proof-of-compliance awarded for silencing
   * VENT-4. Documented as Q0 in good standing, Rowan can talk down a *search* and go
   * back to reading as staff — which is what makes the optional boss worth beating on
   * the way to the uplink. It buys nothing during an active ALERT.
   */
  certified: boolean;
  /**
   * Standing on restricted ground without the clearance that answers it.
   *
   * Resolved by the caller from `src/systems/Clearance.ts` and the inventory, so this
   * module stays headless and knows nothing about tilemaps or items — the same split
   * that keeps `certified` a boolean rather than an inventory search.
   *
   * A *continuous* condition rather than a discrete {@link ConductState.violate}, and
   * the distinction is load-bearing twice over. It is a state Rowan is in rather than
   * an act he committed, so it should hold the flag while he is in there and cost him
   * the usual beat of honest walking on the way out. And `violate` counts sabotage
   * acts, which drive EIRA-7's codec branch: standing somewhere is not sabotage, and
   * counting it would make her read a player who walked through a server aisle as one
   * who had been pulling the place apart.
   */
  trespassing?: boolean;
  /**
   * Tiles walked since the last sample. Accrues into
   * {@link ConductState.complianceDistanceWalked} only while compliant, which is what
   * makes that counter mean "distance covered *passing as staff*" rather than
   * "distance covered".
   */
  movedTiles?: number;
  /**
   * NW-SMAC-01 is holding Rowan in a corrected posture: the mesh reads him as
   * compliant whatever he does, because it is the thing doing the reading. Pins
   * compliance on rather than off — the fight's cost lands as bio-integrity damage in
   * `GameScene`, not as exposure.
   */
  forced?: boolean;
}

/**
 * Tiles of compliant walking before the facility stops treating Rowan as a novelty.
 *
 * The brief specified `500` with no unit; in engine terms that would be pixels, and at
 * 32px tiles it is fifteen tiles — reached before the first corridor ends. Tiles are the
 * unit every other distance in the codebase uses, and 220 of them is most of a deck.
 */
export const HIGH_COMPLIANCE_TILES = 220;

/** Sabotage actions tolerated before conduct stops reading as "quiet". */
export const HIGH_COMPLIANCE_MAX_SABOTAGE = 3;

/**
 * The two running totals, split out so they can survive a level change.
 *
 * A level transition is a `scene.restart()`, which rebuilds every `GameScene` field —
 * including the `ConductState`. Without an explicit snapshot the counters would reset
 * every time Rowan used a hatch, and "has behaved well *this run*" would silently mean
 * "has behaved well since the last doorway".
 */
export interface ConductMetrics {
  sabotageActions: number;
  complianceDistanceWalked: number;
}

/**
 * Seconds of clean behaviour needed before compliance returns. Without this you could
 * tap-dance in and out of it — sprint until a cone catches you, stop, be instantly
 * legitimate again.
 */
export const SETTLE_SECONDS = 1.6;

/** Flag durations by severity, in seconds. */
export const FLAG_UNAUTHORIZED = 10;
export const FLAG_TAMPERING = 6;
export const FLAG_HOSTILE = 14;

export class ConductState {
  /** Seconds of being flagged still to run down. */
  private flagged = 0;
  /** The continuous condition happening right now, if any. */
  private live: ConductBreach | null = null;
  /** What a discrete {@link violate} attributed the current timer to. */
  private discrete: ConductBreach | null = null;
  /** Distinct sabotage acts committed this run — see {@link violate}. */
  private sabotage = 0;
  /** Tiles walked while reading as staff. */
  private walked = 0;
  /** Compliance pinned on by NW-SMAC-01's correction field. */
  private forced = false;

  constructor(restore?: ConductMetrics) {
    if (restore) {
      this.sabotage = Math.max(0, restore.sabotageActions);
      this.walked = Math.max(0, restore.complianceDistanceWalked);
    }
  }

  /** True when the facility reads Rowan as staff and every sensor clears him. */
  get compliant(): boolean {
    return this.forced || this.flagged <= 0;
  }

  /** Distinct sabotage acts committed this run. */
  get sabotageActions(): number {
    return this.sabotage;
  }

  /** Tiles walked while reading as staff. */
  get complianceDistanceWalked(): number {
    return this.walked;
  }

  /**
   * True when Rowan has been quietly passing for long enough that EIRA-7 has something
   * to say about it: a lot of ground covered as staff, and very little friction.
   *
   * Both halves matter. Distance alone is just play time; a low sabotage count alone is
   * just a player who hasn't done anything yet.
   */
  isHighCompliance(): boolean {
    return this.walked > HIGH_COMPLIANCE_TILES && this.sabotage < HIGH_COMPLIANCE_MAX_SABOTAGE;
  }

  /** The running totals, for carrying across a level change. */
  metrics(): ConductMetrics {
    return { sabotageActions: this.sabotage, complianceDistanceWalked: this.walked };
  }

  /** Seconds until compliance returns, assuming behaviour stays clean. */
  get flaggedRemaining(): number {
    return this.flagged;
  }

  /**
   * Why compliance is withheld, or null while compliant. A continuous condition wins
   * over a decaying discrete one — it is what's happening *now*, so it's the more
   * useful thing to show.
   */
  get breach(): ConductBreach | null {
    if (this.live) return this.live;
    if (this.flagged > 0) return this.discrete ?? "SETTLING";
    return null;
  }

  update(dt: number, input: ConductInput): void {
    this.forced = !!input.forced;
    if (this.forced) {
      // The correction field holds the posture for Rowan. Let the timer keep draining
      // underneath so releasing him doesn't hand back a stale flag.
      this.live = null;
      this.flagged = Math.max(0, this.flagged - dt);
      if (this.flagged <= 0) this.discrete = null;
      this.accrue(input);
      return;
    }

    // A live pursuit always blocks; a search only blocks without the credential.
    const alertBreach: ConductBreach | null =
      input.alertPhase === "ALERT"
        ? "ALERT"
        : input.alertPhase === "EVASION" && !input.certified
          ? "EVASION"
          : null;

    // Continuous conditions hold the timer at its floor for as long as they last, so
    // ending one still costs a beat of honest walking.
    //
    // Trespass ranks under the alert breaches and over the movement ones. Under,
    // because a live pursuit is what is happening now and no room explains it. Over,
    // because it is the more useful of the two to show: a sprint is a choice the player
    // can stop where they stand, and the wrong room is one they have to leave.
    this.live =
      alertBreach ??
      (input.trespassing
        ? "TRESPASS"
        : input.running
          ? "RUNNING"
          : input.sneaking
            ? "SNEAKING"
            : null);

    if (this.live) {
      this.flagged = Math.max(this.flagged, SETTLE_SECONDS);
      return;
    }

    this.flagged = Math.max(0, this.flagged - dt);
    if (this.flagged <= 0) this.discrete = null;
    this.accrue(input);
  }

  /**
   * Banks this frame's distance, if it was walked while passing as staff.
   *
   * Called *after* the frame's breach has been resolved, never before: reading
   * `compliant` at the top of {@link update} would still be answering for the previous
   * frame, so the first stride of a sprint would be credited as compliant walking.
   */
  private accrue(input: ConductInput): void {
    if (this.compliant) this.walked += Math.max(0, input.movedTiles ?? 0);
  }

  /**
   * A discrete violation: hold the flag for `seconds`, attributing it to `reason`.
   *
   * Takes the longer of the two rather than overwriting, so calling this every frame
   * an action is held down — a terminal hack, a chest search — reads as "flagged
   * throughout, then a cooldown once you stop", with no extra bookkeeping at the call
   * site and no way for a long flag to be cut short by a lesser one.
   *
   * {@link sabotageActions} counts **rising edges only** for the same reason: a held
   * hack calls this on every frame, and a metric that counted each of those would be
   * measuring frame rate. One hold is one act.
   */
  violate(reason: ConductBreach, seconds: number): void {
    if (seconds <= 0) return;
    if (this.flagged <= 0 || this.discrete !== reason) this.sabotage++;
    if (seconds >= this.flagged) this.discrete = reason;
    this.flagged = Math.max(this.flagged, seconds);
  }
}

/** Snapshot published to the registry for the HUD and the codec. */
export interface ConductView {
  compliant: boolean;
  breach: ConductBreach | null;
  flaggedRemaining: number;
  /** Carrying the Q0 cert — surfaced so the HUD can show the credential doing work. */
  certified: boolean;
  /**
   * The clearance the ground under Rowan demands, or 0 on open floor.
   *
   * Published alongside {@link ConductView.cleared} rather than folded into one flag,
   * because the HUD needs to tell three states apart and a boolean only carries two:
   * not restricted at all, restricted and trespassing, and restricted with the card
   * answering it. The third is the one that teaches the boundary — a player holding
   * the right keycard would otherwise cross into a restricted area and see nothing
   * change, and never learn the areas exist.
   */
  restricted: number;
  /** Whether Rowan's inventory answers {@link ConductView.restricted}. */
  cleared: boolean;
  /** Distinct sabotage acts this run — drives EIRA-7's codec branch. */
  sabotageActions: number;
  /** Tiles walked while reading as staff. */
  complianceDistanceWalked: number;
  /** {@link ConductState.isHighCompliance}, resolved once so readers agree. */
  highCompliance: boolean;
  /** Held in NW-SMAC-01's correction field. */
  forced: boolean;
}
