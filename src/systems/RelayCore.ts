import { RELAY_DEFAULTS, type RelayStats } from "./EntityStats";

/**
 * The rooftop relay — Act IV's state machine. Pure, no Phaser.
 *
 * Same split as VENT-4 and NW-SMAC-01: rules here, Phaser shell in
 * `src/entities/RoofRelay.ts`. This one is less a boss than a **siege clock** — the
 * interesting state is a progress bar the player has to survive rather than a health
 * bar they have to empty, which is the inversion the finale is built on. Every other
 * encounter in the game asks Rowan to take something down. This one asks him to stand
 * still and last.
 *
 * That is also why it ends the way it does. The uplink completing is not a victory
 * condition the player wins past; it is the moment the run is over and the roof closes.
 * {@link RelayState.CAPTURE} is unwinnable on purpose.
 */

export enum RelayState {
  /** Azimuth and elevation pedestals still to be set, under the searchlights. */
  CALIBRATE,
  /** Dish aligned. The feed terminal will now take EIRA-7. */
  ARMED,
  /** The siege: the uplink runs 0 → 100% while Enforcers land on the catwalks. */
  UPLINK,
  /**
   * 100%. The discharge kills the spotlights, input locks, and the Enforcers close in.
   *
   * There is no way out of this state except through it — see the class comment.
   */
  CAPTURE,
  /** Taken on the dish platform. The tribunal has the screen. */
  SEIZED,
}

export interface RelayTransition {
  from: RelayState;
  to: RelayState;
}

export interface RelaySnapshot {
  state: RelayState;
  pedestals: boolean[];
  uplink: number;
}

export interface RelayMsg {
  id: number;
  text: string;
}

export interface RelayView {
  state: RelayState;
  /** Uplink completion, 0..1. */
  progress: number;
  /** Per-pedestal: true once calibrated. */
  pedestalsSet: boolean[];
  /** Seconds left of the capture sequence, while it is playing. */
  captureLeft: number;
  msg?: RelayMsg;
}

export const RELAY_MESSAGES: Record<RelayState, string> = {
  [RelayState.CALIBRATE]: "DISH SECTOR 09 — AZIMUTH / ELEVATION UNSET",
  [RelayState.ARMED]: "DISH ALIGNED — PRIMARY FEED READY",
  [RelayState.UPLINK]: "UPLINK OPEN — HOLD THE PLATFORM",
  [RelayState.CAPTURE]: "TRANSMISSION COMPLETE — CONTAINMENT INBOUND",
  [RelayState.SEIZED]: "DEFENDANT IN CUSTODY",
};

export class RelayCore {
  private st: RelayState;
  private pedestals: boolean[];
  /** Seconds of uplink elapsed. */
  private uplink: number;
  private waveTimer = 0;
  /** Waves owed to the shell, drained by {@link takeWave}. */
  private waves = 0;
  private captureTimer = 0;
  private msgId = 0;
  private msg?: RelayMsg;

  constructor(
    private stats: RelayStats = RELAY_DEFAULTS,
    restore?: RelaySnapshot,
  ) {
    this.st = restore?.state ?? RelayState.CALIBRATE;
    this.pedestals = restore?.pedestals?.slice() ?? new Array(stats.pedestalCount).fill(false);
    this.uplink = restore?.uplink ?? 0;
    if (this.st === RelayState.CAPTURE) this.captureTimer = stats.captureSeconds;
    if (!restore) this.pushMsg(this.st);
  }

  get state(): RelayState {
    return this.st;
  }

  /** Uplink completion, 0..1. */
  get progress(): number {
    return Math.min(1, this.uplink / this.stats.uplinkSeconds);
  }

  get pedestalsSet(): boolean[] {
    return this.pedestals.slice();
  }

  /** True once the dish is aligned and the feed terminal will accept EIRA-7. */
  get isArmed(): boolean {
    return this.st === RelayState.ARMED;
  }

  /** True while the siege is running and the roof should be spawning Enforcers. */
  get isUnderSiege(): boolean {
    return this.st === RelayState.UPLINK;
  }

  /**
   * True once the discharge has fired: input is locked and the searchlights are dead.
   *
   * Both come from the same beat, so they read the same flag — a capture sequence where
   * the lights went out but the player could still walk would be a bug in two places.
   */
  get isCaptured(): boolean {
    return this.st === RelayState.CAPTURE || this.st === RelayState.SEIZED;
  }

  get captureLeft(): number {
    return this.captureTimer;
  }

  /** True when pedestal `i` still needs setting. */
  canCalibrate(i: number): boolean {
    return this.st === RelayState.CALIBRATE && i >= 0 && i < this.pedestals.length && !this.pedestals[i];
  }

  /** Pedestal `i` set. Arms the dish once they all are. */
  notePedestalSet(i: number): RelayTransition | null {
    if (!this.canCalibrate(i)) return null;
    this.pedestals[i] = true;
    return this.pedestals.every(Boolean) ? this.transition(RelayState.ARMED) : null;
  }

  /** EIRA-7 jacked into the primary feed. Opens the uplink and lands the first wave. */
  noteFeedJacked(): RelayTransition | null {
    if (this.st !== RelayState.ARMED) return null;
    const tr = this.transition(RelayState.UPLINK);
    // The roof is hostile from the first second of the feed being open, not from the
    // first interval elapsing — otherwise the siege opens with a quiet minute.
    this.waves = 1;
    this.waveTimer = 0;
    return tr;
  }

  /**
   * True once per wave the siege owes the shell, draining the queue.
   *
   * A counter rather than a callback so the pure core never has to know what a guard is.
   */
  takeWave(): boolean {
    if (this.waves <= 0) return false;
    this.waves--;
    return true;
  }

  update(dt: number): RelayTransition | null {
    if (this.st === RelayState.UPLINK) {
      this.uplink += dt;
      this.waveTimer += dt;
      if (this.waveTimer >= this.stats.waveInterval) {
        this.waveTimer -= this.stats.waveInterval;
        this.waves++;
      }
      if (this.uplink >= this.stats.uplinkSeconds) {
        this.captureTimer = this.stats.captureSeconds;
        return this.transition(RelayState.CAPTURE);
      }
      return null;
    }
    if (this.st === RelayState.CAPTURE) {
      this.captureTimer = Math.max(0, this.captureTimer - dt);
      if (this.captureTimer <= 0) return this.transition(RelayState.SEIZED);
    }
    return null;
  }

  snapshot(): RelaySnapshot {
    return { state: this.st, pedestals: this.pedestals.slice(), uplink: this.uplink };
  }

  view(): RelayView {
    return {
      state: this.st,
      progress: this.progress,
      pedestalsSet: this.pedestalsSet,
      captureLeft: this.captureTimer,
      msg: this.msg,
    };
  }

  private transition(to: RelayState): RelayTransition | null {
    if (to === this.st) return null;
    const from = this.st;
    this.st = to;
    this.pushMsg(to);
    return { from, to };
  }

  private pushMsg(state: RelayState): void {
    this.msg = { id: ++this.msgId, text: RELAY_MESSAGES[state] };
  }
}
