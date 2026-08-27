import type { AlertPhase } from "./AlertState";
import { FIREARMS_AUTHORIZATION_DELAY } from "./EntityStats";

/**
 * Whether the facility has released firearms to the guards holding them.
 *
 *  - **RESTRICTED** — the default, and the state a well-played run never leaves.
 *  - **AUTHORIZED** — weapons free, for the remainder of this alert cycle.
 */
export type FirearmsPosture = "RESTRICTED" | "AUTHORIZED";

/**
 * The base-wide release that a firearm needs before it will go off.
 *
 * **Two gates, not one.** A shot requires an {@link ./EntityStats.EnforcerStats}`.armed`
 * guard *and* this. Neither alone is enough, and that is the entire design: the
 * building fields almost no firearms, and the few it has stay holstered until it
 * decides the situation warrants them.
 *
 * `Enforcer.pursue` has only ever been reachable at ALERT, so "guns during an alert"
 * was already true and did nothing — every guard drew the instant the base woke up.
 * This is the rule that can actually be felt, because it is a rule about *duration*:
 * authorization accrues across {@link FIREARMS_AUTHORIZATION_DELAY} seconds of
 * sustained ALERT, so a player who breaks line of sight promptly denies it outright.
 * Getting shot at is a thing you let happen, not a thing that happens to you.
 *
 * **It latches, and it survives the drop to EVASION.** A building does not rescind
 * weapons because it briefly lost sight of what it was hunting — that would let a
 * player duck a corner and disarm the whole floor on a two-second timer. It clears
 * only on the return to INFILTRATION, when the hunt is genuinely over.
 *
 * Headless, per the `src/systems/` rule: no Phaser, no DOM, driven by `(dt, phase)`.
 */
export class FirearmsAuthorization {
  private elapsed = 0;
  private latched = false;

  /** The posture, for the HUD and the debug overlay. */
  get posture(): FirearmsPosture {
    return this.latched ? "AUTHORIZED" : "RESTRICTED";
  }

  /** True once weapons are free. What `Enforcer.pursue` reads. */
  get authorized(): boolean {
    return this.latched;
  }

  /**
   * Seconds of sustained ALERT still owed before weapons are released — 0 once they
   * are. Exposed for the debug overlay, which is where this is legible at all: the
   * mechanic is otherwise invisible right up until the moment it isn't.
   */
  get secondsToAuthorization(): number {
    return this.latched ? 0 : Math.max(0, FIREARMS_AUTHORIZATION_DELAY - this.elapsed);
  }

  update(dt: number, phase: AlertPhase): void {
    if (phase === "INFILTRATION") {
      // The hunt is over. Weapons go back in their lockers, and the clock with them.
      this.reset();
      return;
    }
    // EVASION accrues nothing but loses nothing: a guard searching for someone he
    // cannot see is not building a case for shooting, but the case he already built
    // still stands. Only eyes-on time counts toward the release.
    if (phase !== "ALERT") return;
    if (this.latched) return;
    this.elapsed += dt;
    if (this.elapsed >= FIREARMS_AUTHORIZATION_DELAY) this.latched = true;
  }

  /** Back to RESTRICTED. A fresh run, a loaded save, or the end of an alert cycle. */
  reset(): void {
    this.elapsed = 0;
    this.latched = false;
  }
}
