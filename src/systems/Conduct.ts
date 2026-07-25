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

/** Why compliance is currently withheld. Drives the HUD readout. */
export type ConductBreach =
  /** The base is already aware. No posture talks your way out of an active alert. */
  | "ALERT"
  | "RUNNING"
  | "SNEAKING"
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
  /** Global alert phase is anything but INFILTRATION. */
  alertAware: boolean;
  running: boolean;
  /** Crouched — whether moving or not. Skulking is its own kind of conspicuous. */
  sneaking: boolean;
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

  /** True when the facility reads Rowan as staff and every sensor clears him. */
  get compliant(): boolean {
    return this.flagged <= 0;
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
    // Continuous conditions hold the timer at its floor for as long as they last, so
    // ending one still costs a beat of honest walking.
    this.live = input.alertAware
      ? "ALERT"
      : input.running
        ? "RUNNING"
        : input.sneaking
          ? "SNEAKING"
          : null;

    if (this.live) {
      this.flagged = Math.max(this.flagged, SETTLE_SECONDS);
      return;
    }

    this.flagged = Math.max(0, this.flagged - dt);
    if (this.flagged <= 0) this.discrete = null;
  }

  /**
   * A discrete violation: hold the flag for `seconds`, attributing it to `reason`.
   *
   * Takes the longer of the two rather than overwriting, so calling this every frame
   * an action is held down — a terminal hack, a chest search — reads as "flagged
   * throughout, then a cooldown once you stop", with no extra bookkeeping at the call
   * site and no way for a long flag to be cut short by a lesser one.
   */
  violate(reason: ConductBreach, seconds: number): void {
    if (seconds <= 0) return;
    if (seconds >= this.flagged) this.discrete = reason;
    this.flagged = Math.max(this.flagged, seconds);
  }
}

/** Snapshot published to the registry for the HUD. */
export interface ConductView {
  compliant: boolean;
  breach: ConductBreach | null;
  flaggedRemaining: number;
}
