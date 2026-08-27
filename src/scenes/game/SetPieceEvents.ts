import type Phaser from "phaser";
import { Enforcer } from "../../entities/Enforcer";
import { ENFORCER_SKIN } from "../../entities/EnforcerAnimations";
import type { Laser } from "../../entities/Laser";
import type { Player } from "../../entities/Player";
import type { AlertState } from "../../systems/AlertState";
import { getAudio } from "../../systems/AudioDirector";
import { CERT_ITEM, RELAY_DEFAULTS } from "../../systems/EntityStats";
import type { JournalEntryId } from "../../systems/Journal";
import {
  noteCoreSilenced,
  noteUplinkComplete,
  noteVent4Defeated,
  type ObjectiveState,
} from "../../systems/Objectives";
import { RelayState, type RelayTransition } from "../../systems/RelayCore";
import { SmacState, type SmacTransition } from "../../systems/SmacCore";
import { Vent4State, type Vent4Transition } from "../../systems/Vent4Core";
import type { EncountersCallbacks } from "./Encounters";

/**
 * The dressing for the three set-piece state machines: what a VENT-4, NW-SMAC-01
 * or rooftop-relay transition sounds and looks like, plus the one siege Enforcer
 * the roof spawns.
 *
 * `Encounters` decides *whether* a transition happens; this decides what the
 * player experiences when it does. That line was already drawn — the four
 * methods were the scene's implementation of {@link EncountersCallbacks} — but
 * they lived four hundred lines from the wiring that called them and were passed
 * as four loose closures. Implementing the interface directly means the compiler
 * checks the shape, and the audio/camera vocabulary for the three acts sits in
 * one file where it can be compared across them.
 *
 * Nothing here decides anything: every branch is a cue, a registry write, or an
 * objective note. The rules are in `Vent4Core`, `SmacCore` and `RelayCore`.
 */

/**
 * Reached through getters rather than captured values, because the scene rebinds
 * most of these after this module is built.
 *
 * `objectives` is the one that actually bites: `create()` constructs the
 * encounters before `restoreRunState()` replaces the objective object with the
 * one read back from the registry. A reference captured at construction would
 * still be live, still typecheck, and still accept every `noteVent4Defeated`
 * — into an object nothing reads again, so beating VENT-4 would silently fail
 * to unseal the roof. The rest are getters for consistency and to keep the next
 * reordering of `create()` from re-introducing the same class of bug.
 */
export interface SetPieceWorld {
  /** The Phaser scene, for the camera and for parenting a spawned Enforcer. */
  scene: Phaser.Scene;
  player(): Player;
  alert(): AlertState;
  tileSize: number;
  objectives(): ObjectiveState;
  /** The live guard roster — siege Enforcers join it and are driven like any other. */
  guards(): Enforcer[];
  /** The level's emitters, EMP'd wholesale by the relay's discharge. */
  lasers(): readonly Laser[];
  /** Adds a journal entry, if it isn't already recorded. */
  note(id: JournalEntryId): void;
  /** Republishes the objectives to the registry after a note lands. */
  publishObjectives(): void;
}

export class SetPieceEvents implements EncountersCallbacks {
  constructor(private readonly w: SetPieceWorld) {}

  /**
   * Dresses a VENT-4 state change: continuous audio layers, stingers, and (on
   * defeat) the compliance cert + optional objective. Banners ride the `vent4`
   * registry snapshot, and the mood keys off the alert phase as usual — the
   * boss raises it through reportSighting like every other detector.
   */
  onVent4Transition(tr: Vent4Transition): void {
    const audio = getAudio();
    switch (tr.to) {
      case Vent4State.PHASE_1_SWEEP:
        audio.setSuction(false);
        audio.setPurge(false);
        audio.setTrack("vent4Theme");
        break;
      case Vent4State.PHASE_2_VACUUM:
        audio.setSuction(true);
        audio.setPurge(false);
        audio.setTrack("vent4Theme");
        break;
      case Vent4State.JAMMED:
        audio.setSuction(false);
        audio.jamClunk();
        // The turbine is choking, not calming down — the theme it was already
        // playing carries the phase it will fall back into when the jam clears.
        audio.setTrack("vent4Theme");
        break;
      case Vent4State.PHASE_3_PURGE:
        audio.setSuction(false);
        audio.setPurge(true);
        audio.ping();
        // The one moment the arena's own theme gives way: 259 BPM over the
        // thermal purge, for as long as the purge lasts.
        audio.setTrack("vent4Freakout");
        break;
      case Vent4State.DEFEATED: {
        audio.setSuction(false);
        audio.setPurge(false);
        audio.vent4Shutdown();
        // Back to the facility's own theme, under a room that has stopped
        // trying to kill him — the arena is somewhere to walk out of now.
        audio.setTrack("articleZeroTheme");
        const registry = this.w.scene.registry;
        const inv = (registry.get("inventory") as string[] | undefined) ?? [];
        if (!inv.includes(CERT_ITEM)) {
          inv.push(CERT_ITEM);
          registry.set("inventory", inv);
        }
        noteVent4Defeated(this.w.objectives());
        this.w.publishObjectives();
        this.w.note("vent4");
        this.w.note("certified");
        this.w.scene.cameras.main.flash(400, 60, 200, 220);
        break;
      }
    }
  }

  /**
   * Dresses an NW-SMAC-01 state change.
   *
   * On defeat the vault opens: the objective flag is what un-seals the roof ladder (see
   * `canReachRoof`), and clearing the registry snapshot is what stops the fight being
   * restaged if the player walks back in.
   */
  onSmacTransition(tr: SmacTransition): void {
    const audio = getAudio();
    const camera = this.w.scene.cameras.main;
    switch (tr.to) {
      case SmacState.CORRECTION:
        audio.ping();
        camera.shake(120, 0.003);
        break;
      case SmacState.FALSE_SUMMARY:
        // No sting. The card is pretending to be the end of the run, and a boss
        // stinger under it would give the game away before the player has read a word.
        break;
      case SmacState.EXPOSED:
        audio.jamClunk();
        camera.flash(240, 255, 90, 90);
        break;
      case SmacState.DEFEATED: {
        audio.vent4Shutdown();
        noteCoreSilenced(this.w.objectives());
        this.w.publishObjectives();
        this.w.scene.registry.remove("smacState");
        this.w.note("the-core");
        camera.flash(500, 150, 90, 255);
        break;
      }
    }
  }

  /** Dresses a rooftop relay state change, and ends the run when Rowan is taken. */
  onRelayTransition(tr: RelayTransition): void {
    const audio = getAudio();
    const camera = this.w.scene.cameras.main;
    switch (tr.to) {
      case RelayState.ARMED:
        audio.hack();
        break;
      case RelayState.UPLINK:
        audio.ping();
        this.w.note("the-relay");
        break;
      case RelayState.CAPTURE:
        // The discharge: every spotlight and every hazard on the roof goes dark at once.
        for (const laser of this.w.lasers()) laser.emp(RELAY_DEFAULTS.captureSeconds + 2);
        audio.setMood("alert");
        camera.flash(600, 255, 255, 255);
        camera.shake(900, 0.008);
        break;
      case RelayState.SEIZED:
        // The run ends *here*, not on CAPTURE.
        //
        // `tickWorld` runs before the win check in the same frame, so setting this on the
        // CAPTURE transition meant `endRun` fired that same frame and the authored
        // capture beat — lights out, input locked, HUD collapsing into noise — never got
        // a single frame on screen. `RelayCore` already holds CAPTURE for
        // `captureSeconds`; this lets it.
        audio.setMood("calm");
        noteUplinkComplete(this.w.objectives());
        this.w.publishObjectives();
        break;
    }
  }

  /**
   * Dresses one siege Enforcer landing at a catwalk mouth — the wave itself and the cap
   * on concurrent siege guards are decided inside `Encounters.tick` before this is ever
   * called; this only ever creates the entity.
   *
   * They join the guard roster, so they patrol, path, see and network exactly like every
   * other guard in the game — the roof needs no bespoke combat AI, only somewhere for
   * them to come from.
   */
  onSiegeSpawn(at: { x: number; y: number }): void {
    const ts = this.w.tileSize;
    const px = (at.x + 0.5) * ts;
    const py = (at.y + 0.5) * ts;
    // A one-waypoint route: the guard walks its post and then hunts on contact, which
    // is what an Enforcer dropped onto a roof to find someone would do.
    //
    // The empty component list is load-bearing rather than incidental: it reads as
    // `armed: false` (see `flag` in EntityStats), so a siege wave is melee-only however
    // long it runs. `RELAY_DEFAULTS` allows six of these on the roof at once, and six
    // guns would undo `ARMED_POSTS_PER_LEVEL` on the one level that spawns guards
    // outside `LevelBuilder`, where the allowance is issued. The relay's own searchlight
    // is the ranged threat up here; the bodies it calls in are there to close.
    const guard = new Enforcer(this.w.scene, px, py, ts, [], ENFORCER_SKIN, [{ x: px, y: py }]);
    this.w.guards().push(guard);
    // They are not a surprise — the whole roof knows Rowan is there by now.
    const player = this.w.player();
    this.w.alert().reportSighting(Math.floor(player.x / ts), Math.floor(player.y / ts));
    getAudio().ping();
  }
}
