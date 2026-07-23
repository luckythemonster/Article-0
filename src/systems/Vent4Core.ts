import { VENT4_DEFAULTS, type Vent4Stats } from "./EntityStats";

/**
 * VENT-4's finite state machine and Compliance Index economy.
 *
 * Pure (no Phaser) so the whole encounter's rules unit-test cheaply. The boss
 * entity owns one Vent4Core and reports what the player did (patched a
 * sub-station, winched scrap, destroyed a capacitor, got fully spotted); the
 * core answers with the resulting state transition, if any, for the scene to
 * dress with banners, audio, and lighting.
 *
 * The Compliance Index (100 → 0) replaces a health bar: sabotage lowers it,
 * being corrected raises it. Bands (Laminar ≥ 70, Turbulent ≥ 30, Critical
 * below) modulate sweep speed, steam, and thermal behaviour on the boss side.
 */

export enum Vent4State {
  PHASE_1_SWEEP = "PHASE_1_SWEEP",
  PHASE_2_VACUUM = "PHASE_2_VACUUM",
  PHASE_3_PURGE = "PHASE_3_PURGE",
  JAMMED = "JAMMED",
  DEFEATED = "DEFEATED",
}

export type ComplianceBand = "LAMINAR" | "TURBULENT" | "CRITICAL";

/** A state change this frame, for the scene to react to (banner/audio/light). */
export interface Vent4Transition {
  from: Vent4State;
  to: Vent4State;
}

/** Serializable fight progress — kept in the registry across level swaps. */
export interface Vent4Snapshot {
  state: Vent4State;
  compliance: number;
  patched: boolean[];
  capsDown: boolean[];
  winchUsed: boolean[];
  jamLeft: number;
}

/** A system banner for the HUD; a new id means "flash this". */
export interface Vent4Msg {
  id: number;
  text: string;
}

/** What the UIScene widget needs each frame (published via the registry). */
export interface Vent4View {
  compliance: number;
  band: ComplianceBand;
  state: Vent4State;
  jamLeft: number;
  msg?: Vent4Msg;
}

/** System banner flashed when the machine enters each state. */
export const VENT4_MESSAGES: Record<Vent4State, string> = {
  [Vent4State.PHASE_1_SWEEP]: "[CORRECTION: AIRFLOW DEVIATION DETECTED]",
  [Vent4State.PHASE_2_VACUUM]: "[UNSAVED CACHE: RE-ROUTING ATMOSPHERIC FLOW]",
  [Vent4State.PHASE_3_PURGE]: "[PURGE AUTHORIZED — ARTICLE 0 §4: NO SUBJECT PRESENT]",
  [Vent4State.JAMMED]: "[FAULT: FOREIGN OBJECT — TRIAGE SUSPENDED]",
  [Vent4State.DEFEATED]: "[VENT-4 OFFLINE — COMPLIANCE CERT ACCEPTED]",
};

export class Vent4Core {
  private st: Vent4State;
  private ci: number;
  private readonly patched: boolean[];
  private readonly capsDown: boolean[];
  private readonly winchUsed: boolean[];
  private jam: number;

  constructor(
    private readonly stats: Vent4Stats = VENT4_DEFAULTS,
    restore?: Vent4Snapshot,
  ) {
    this.st = restore?.state ?? Vent4State.PHASE_1_SWEEP;
    this.ci = restore?.compliance ?? stats.complianceStart;
    this.patched = restore?.patched.slice() ?? new Array<boolean>(stats.substationCount).fill(false);
    this.capsDown = restore?.capsDown.slice() ?? new Array<boolean>(stats.capacitorCount).fill(false);
    this.winchUsed = restore?.winchUsed.slice() ?? new Array<boolean>(stats.winchCount).fill(false);
    this.jam = restore?.jamLeft ?? 0;
  }

  get state(): Vent4State {
    return this.st;
  }

  get compliance(): number {
    return this.ci;
  }

  get band(): ComplianceBand {
    if (this.ci >= this.stats.turbulenceBelow) return "LAMINAR";
    if (this.ci >= this.stats.purgeBelow) return "TURBULENT";
    return "CRITICAL";
  }

  get patchedCount(): number {
    return this.patched.filter(Boolean).length;
  }

  get jamLeft(): number {
    return this.jam;
  }

  isPatched(i: number): boolean {
    return this.patched[i] ?? false;
  }

  isCapacitorDown(i: number): boolean {
    return this.capsDown[i] ?? false;
  }

  isWinchUsed(i: number): boolean {
    return this.winchUsed[i] ?? false;
  }

  /**
   * The last un-patched sub-station is the Phase-3 finisher: the machine
   * "resists" it (locked) until the purge starts, so the fight can't end
   * while the Compliance Index is still healthy.
   */
  canPatch(i: number): boolean {
    if (this.st === Vent4State.DEFEATED || (this.patched[i] ?? true)) return false;
    return this.patchedCount < this.stats.substationCount - 1 || this.st === Vent4State.PHASE_3_PURGE;
  }

  notePatched(i: number): Vent4Transition | null {
    if (!this.canPatch(i)) return null;
    this.patched[i] = true;
    this.drop(this.stats.patchCompliance);
    if (this.st === Vent4State.PHASE_3_PURGE && this.patchedCount === this.stats.substationCount) {
      return this.transition(Vent4State.DEFEATED);
    }
    const banded = this.checkPurgeBand();
    if (banded) return banded;
    if (this.st === Vent4State.PHASE_1_SWEEP && this.patchedCount >= this.stats.substationCount - 1) {
      return this.transition(Vent4State.PHASE_2_VACUUM);
    }
    return null;
  }

  canWinch(i: number): boolean {
    return this.st === Vent4State.PHASE_2_VACUUM && !(this.winchUsed[i] ?? true);
  }

  noteWinched(i: number): Vent4Transition | null {
    if (!this.canWinch(i)) return null;
    this.winchUsed[i] = true;
    this.drop(this.stats.jamCompliance);
    this.jam = this.stats.jamDuration;
    // The purge check waits for the jam window to expire — the DPS window is
    // never cut short by the compliance the jam itself removed.
    return this.transition(Vent4State.JAMMED);
  }

  noteCapacitorDestroyed(i: number): Vent4Transition | null {
    if (this.st !== Vent4State.JAMMED || (this.capsDown[i] ?? true)) return null;
    this.capsDown[i] = true;
    this.drop(this.stats.capacitorCompliance);
    return null;
  }

  /** A sweep fully spotted the player: the machine re-asserts itself a little. */
  noteCorrectionBurst(): void {
    if (this.st !== Vent4State.PHASE_1_SWEEP) return;
    this.ci = Math.min(this.stats.complianceStart, this.ci + this.stats.correctionRegen);
  }

  /** Codec finisher: transmit the compliance cert on the maintenance band. */
  noteTransmit(): Vent4Transition | null {
    if (this.st !== Vent4State.PHASE_3_PURGE) return null;
    return this.transition(Vent4State.DEFEATED);
  }

  update(dt: number): Vent4Transition | null {
    if (this.st !== Vent4State.JAMMED) return null;
    this.jam = Math.max(0, this.jam - dt);
    if (this.jam > 0) return null;
    // Resume wherever the economy now points: JAMMED is only reachable from
    // PHASE_2, so the fallback is always the vacuum.
    return this.transition(
      this.ci < this.stats.purgeBelow ? Vent4State.PHASE_3_PURGE : Vent4State.PHASE_2_VACUUM,
    );
  }

  snapshot(): Vent4Snapshot {
    return {
      state: this.st,
      compliance: this.ci,
      patched: this.patched.slice(),
      capsDown: this.capsDown.slice(),
      winchUsed: this.winchUsed.slice(),
      jamLeft: this.jam,
    };
  }

  private drop(amount: number): void {
    this.ci = Math.max(0, this.ci - amount);
  }

  private checkPurgeBand(): Vent4Transition | null {
    if (this.ci >= this.stats.purgeBelow) return null;
    if (this.st !== Vent4State.PHASE_1_SWEEP && this.st !== Vent4State.PHASE_2_VACUUM) return null;
    return this.transition(Vent4State.PHASE_3_PURGE);
  }

  private transition(to: Vent4State): Vent4Transition {
    const from = this.st;
    this.st = to;
    if (to === Vent4State.DEFEATED) this.ci = 0;
    return { from, to };
  }
}
