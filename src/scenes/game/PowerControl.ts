import type { Breaker } from "../../entities/Breaker";
import type { LightSwitch } from "../../entities/LightSwitch";
import type { Orderly } from "../../entities/Orderly";
import { getAudio } from "../../systems/AudioDirector";
import type { DetectionSystem } from "../../systems/DetectionSystem";
import { len } from "../../systems/distance";
import { emergencyRef, zoneOfEmergency } from "../../map/AutoLight";
import {
  circuitsForLevel,
  isCircuitClosed,
  isHacked,
  markHacked,
  setCircuitClosed,
  type PowerGridState,
} from "../../systems/PowerGrid";
import type { Lighting } from "../../ui/Lighting";
import type { NoiseEvents } from "./NoiseEvents";

/**
 * How far a breaker's clunk carries, in tiles.
 *
 * Wider than a door's, narrower than a shot. A cabinet being worked is a real
 * noise and the deck going dark is conspicuous, but the point of the switch is
 * that it buys darkness — one that called the whole level over would be a trap
 * rather than a tool.
 */
const BREAKER_NOISE_TILES = 7;
/** How close an orderly has to get before it can reset a breaker, in tiles. */
const BREAKER_RESET_REACH_TILES = 0.8;
/**
 * Seconds before a breaker asks for somebody again.
 *
 * An orderly drops out of INSPECT on its own after a couple of seconds, so a
 * reset that nobody completes has to be re-requested or the lights would stay
 * off on a technicality. Long enough that it is not re-issuing orders every
 * frame, short enough that the deck does not feel abandoned.
 */
const BREAKER_RESET_RETRY_SECONDS = 4;

/**
 * How far a wall switch's flip carries, in tiles.
 *
 * A fifth of the breaker's, and quieter than a door. That gap is the whole reason
 * to walk into a room and use the plate instead of throwing the cabinet: the switch
 * is the move nobody hears you make. See `src/entities/LightSwitch.ts`.
 */
const SWITCH_NOISE_TILES = 2;

/**
 * Cutting the lights, and the facility's answer to it.
 *
 * A thrown breaker is a two-sided move rather than a free win: it is heard, it
 * is charged as a breach, and somebody is sent to put it back. The sending is
 * the half that needs state — which breakers are waiting on a reset, who is en
 * route to each, and when to ask again — so it is owned here rather than being
 * a Map on the scene that four methods happened to share.
 */

/**
 * All getters: like the anomaly pool, this is built as a field initializer so
 * the outstanding resets survive a level change, and an initializer cannot
 * capture anything `create()` has not set yet.
 */
export interface PowerWorld {
  tileSize(): number;
  levelName(): string;
  lighting(): Lighting;
  detection(): DetectionSystem;
  orderlies(): readonly Orderly[];
  noise(): NoiseEvents;
  powerGrid(): PowerGridState;
  /** Charges the breach a breaker cabinet earns — the same one a terminal does. */
  violateUnauthorized(): void;
  /**
   * The circuits one target actually feeds.
   *
   * A *wing* — what a breaker names — expands to the zones under it; anything else
   * is its own circuit and comes back alone. Backed by `GameLevel.circuits`, which
   * `src/map/AutoLight.ts` writes, so a map with no derived lighting answers every
   * target with itself and this whole layer costs nothing.
   */
  circuitsFor(target: string): readonly string[];
  /**
   * Every derived zone on the level, mapped to the wing above it.
   *
   * The reverse of {@link circuitsFor}, and needed for the half of the mechanic
   * that reads *upward*: whether a zone has power at all depends on its wing's
   * breaker, and a zone cannot find that out from its own name. The keys double as
   * the level's zone list, which is what {@link PowerControl.restore} walks.
   *
   * Empty on a map with no derived lighting, which is what makes every target on
   * such a map behave exactly as it did before any of this existed.
   */
  zoneWings(): ReadonlyMap<string, string>;
  /** The plates, so a dead circuit can grey the ones hanging off it. */
  lightSwitches(): readonly LightSwitch[];
}

export class PowerControl {
  /**
   * Breakers waiting on an orderly, and who was sent. Keyed by the breaker, so a
   * second throw while one reset is already pending replaces rather than stacks.
   */
  private readonly pending = new Map<Breaker, { orderly: Orderly | null; retryAt: number }>();

  constructor(private readonly w: PowerWorld) {}

  /** Drops every outstanding reset — a fresh run owes nobody a callout. */
  reset(): void {
    this.pending.clear();
  }

  /**
   * Moves one control's lever and re-applies everything it feeds.
   *
   * `target` is a *control's* name — a breaker's wing, a plate's zone, or an
   * authored ref like `light_overhead1` — and `closed` is where that control now
   * sits. What the zones under it actually do is worked out by {@link applyZone},
   * because a lever position is only half the answer.
   */
  setCircuit(target: string, closed: boolean): void {
    setCircuitClosed(this.w.powerGrid(), this.w.levelName(), target, closed);
    this.applyTarget(target);
  }

  /**
   * Re-applies every zone one target feeds, without moving anything.
   *
   * A breaker names a wing, so one throw is several zones. `Lighting` and
   * `DetectionSystem` each match a single ref and are deliberately left that way —
   * the expansion belongs here.
   */
  private applyTarget(target: string): void {
    for (const zone of this.w.circuitsFor(target)) this.applyZone(zone);
  }

  /**
   * Works out what one zone is doing, and tells all three things that show it.
   *
   * **The whole mechanic is two independent bits.** A zone's plate can be off, and
   * a zone can have no power reaching it at all — a breaker thrown above it, or a
   * terminal hacked. Those used to be one boolean, which is why a switched-off room
   * and a blacked-out one looked identical:
   *
   * | plate | power | overhead | emergency | the plate reads |
   * | ----- | ----- | -------- | --------- | --------------- |
   * | on    | yes   | on       | off       | `ON`            |
   * | off   | yes   | off      | **on**    | `OFF`           |
   * | any   | no    | off      | off       | `NO_POWER`      |
   *
   * So flipping a plate buys dim red cover you can still cross; throwing the
   * breaker takes the emergency lamp with everything else on the circuit and buys
   * real darkness. The two controls differ in kind now, not just in reach.
   *
   * Both halves of "lit" move together here or not at all — they are separate
   * systems reading the same board, and a blackout that moved one would be a lie in
   * one direction or the other: pitch dark but still easy to spot, or fully lit but
   * unseeable.
   */
  private applyZone(zone: string): void {
    const live = this.hasPower(zone);
    const overhead = live && this.plateClosed(zone);
    this.drive(zone, overhead);
    this.drive(emergencyRef(zone), live && !overhead);
    for (const sw of this.w.lightSwitches()) {
      if (sw.stats.target === zone) sw.setLive(live);
    }
  }

  /** Both halves of "lit", for one ref. */
  private drive(ref: string, on: boolean): void {
    this.w.lighting().setCircuit(ref, on);
    this.w.detection().setCircuit(ref, on);
  }

  /** Where this zone's own plate sits. Absent means nobody has touched it. */
  private plateClosed(zone: string): boolean {
    return isCircuitClosed(this.w.powerGrid(), this.w.levelName(), zone, true);
  }

  /**
   * Whether power reaches the zone at all, before its plate gets a say.
   *
   * A zone with no wing — every target on a map that has no derived lighting, and
   * `main1`'s `light_overhead1` among them — has nothing above it to fail, so it is
   * always live and the plate's own position decides everything. That is what keeps
   * this layer free on a map that never asked for it.
   */
  private hasPower(zone: string): boolean {
    const grid = this.w.powerGrid();
    const level = this.w.levelName();
    if (isHacked(grid, level, zone)) return false;
    const wing = this.w.zoneWings().get(zone);
    return wing === undefined || isCircuitClosed(grid, level, wing, true);
  }

  /**
   * A tap on a wall switch: flip it, and let the room go dark.
   *
   * Everything the breaker does *besides* cutting power is deliberately absent —
   * no breach charged, no orderly dispatched, and a noise a fifth as wide. A switch
   * is a thing the people who work here touch a hundred times a day, so touching one
   * is not evidence of anything, and nobody comes to undo it. What it costs instead
   * is reach: one zone, and you have to be standing in it.
   */
  flipSwitch(sw: LightSwitch): void {
    const closed = sw.toggle();
    this.setCircuit(sw.stats.target, closed);
    getAudio().door();
    this.w.noise().emitAt(sw.x, sw.y, SWITCH_NOISE_TILES * this.w.tileSize());
  }

  /**
   * Cuts every circuit named, as one remote act — what a hacked terminal does to
   * the lighting around it. Persisted like any other throw, so it survives the walk
   * back up the stairs.
   *
   * No fixture is involved and none is animated: the breach and the noise belong to
   * the hack, which has already charged them, so this is only the power.
   */
  cutCircuits(targets: readonly string[]): void {
    const grid = this.w.powerGrid();
    const level = this.w.levelName();
    // Recorded as a hack rather than as a lever position, because a terminal has no
    // lever: a room it killed has to read `NO_POWER` and stay dark, not read `OFF`
    // and come up on emergency lighting the way a room somebody switched off does.
    //
    // Mapped back to the zone first. `DetectionSystem.refsWithin` reports whatever
    // is *lit* near the panel, and in a room that is already switched off that is
    // the emergency lamp — cutting only the lamp would leave the zone able to come
    // back on. The `Set` is because both refs of one zone can arrive together.
    for (const zone of new Set(targets.map(zoneOfEmergency))) {
      markHacked(grid, level, zone);
      this.applyTarget(zone);
    }
  }

  /**
   * Re-applies a level's persisted circuit state, whatever threw it.
   *
   * Driven off `PowerGridState` rather than off the breakers, which is the point:
   * a zone killed by a wall switch or a terminal hack has no breaker to be read
   * back from, and the fixture-driven version this replaced quietly restored those
   * rooms to full brightness on every level change.
   */
  restore(level: string): void {
    // Every zone, not only the ones with an override — because `Lighting` and
    // `DetectionSystem` both build every fixture powered, so an emergency lamp that
    // should start dark has to be *told* to. A zone nobody has touched still needs
    // its overhead on and its emergency off, and only a full pass says so.
    for (const zone of this.w.zoneWings().keys()) this.applyZone(zone);
    // Then whatever else this level has an override for — an authored breaker's
    // `light_overhead1`, which is a control rather than a derived zone and so is not
    // in the map above.
    for (const { target } of circuitsForLevel(this.w.powerGrid(), level)) {
      if (!this.w.zoneWings().has(target)) this.applyTarget(target);
    }
  }

  /**
   * A tap on a breaker: throw it, wake the deck, and start the clock on a reset.
   *
   * Cutting the power is a two-sided move rather than a free win. It is heard
   * (guards come to look at the noise), it is charged as a breach the same way
   * working a terminal is, and the facility sends somebody to put it back.
   */
  throwBreaker(breaker: Breaker): void {
    const started = breaker.toggle((closed) => {
      this.setCircuit(breaker.stats.target, closed);
      if (closed) this.pending.delete(breaker);
      else this.pending.set(breaker, { orderly: null, retryAt: 0 });
    });
    if (!started) return;

    // A breaker cabinet is a panel he has no business at, exactly like a terminal.
    this.w.violateUnauthorized();
    getAudio().door();
    this.w.noise().emitAt(breaker.x, breaker.y, BREAKER_NOISE_TILES * this.w.tileSize());
  }

  /**
   * Sends somebody to put the lights back on, and restores them when they arrive.
   *
   * Uses the orderlies' existing {@link Orderly.distract} override, which is
   * already "walk over and look at that" — and which already refuses an orderly
   * who has witnessed the player, surrendered, or been stunned or pinned. That
   * refusal is the mechanic, not an edge case: clear the deck of anyone able to
   * walk and the dark is yours to keep.
   */
  updateResets(now: number): void {
    for (const [breaker, pending] of this.pending) {
      if (breaker.isClosed) {
        this.pending.delete(breaker);
        continue;
      }

      // Arrived: the reset is the same interaction the player just made, so it
      // goes through the breaker rather than around it.
      const sent = pending.orderly;
      if (sent) {
        const reach = BREAKER_RESET_REACH_TILES * this.w.tileSize();
        if (len(sent.x - breaker.x, sent.y - breaker.y) <= reach) {
          this.throwBreaker(breaker);
          continue;
        }
      }

      if (now < pending.retryAt) continue;
      // Nobody en route, or whoever was sent stopped coming — an orderly drops
      // out of INSPECT on its own after a pause, and can be stunned or held up
      // on the way. Ask again; if there is nobody left who will come, the deck
      // simply stays dark.
      pending.orderly = this.dispatch(breaker);
      pending.retryAt = now + BREAKER_RESET_RETRY_SECONDS;
    }
  }

  /**
   * Sends the nearest orderly who will actually go, or null if none will.
   *
   * Tries them nearest-first and takes the first one whose `distract` accepts,
   * rather than filtering on the public getters — `distract` owns the rules for
   * who can be diverted, and asking it is what keeps this from drifting when
   * they change.
   */
  private dispatch(breaker: Breaker): Orderly | null {
    const byDistance = [...this.w.orderlies()].sort(
      (a, b) => len(a.x - breaker.x, a.y - breaker.y) - len(b.x - breaker.x, b.y - breaker.y),
    );
    for (const orderly of byDistance) {
      if (orderly.distract(breaker.x, breaker.y)) return orderly;
    }
    return null;
  }
}
