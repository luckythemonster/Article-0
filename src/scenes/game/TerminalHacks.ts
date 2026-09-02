import type Phaser from "phaser";
import type { Door } from "../../entities/Door";
import type { Player } from "../../entities/Player";
import type { Terminal } from "../../entities/Terminal";
import { getAudio } from "../../systems/AudioDirector";
import type { DetectionSystem } from "../../systems/DetectionSystem";
import { len } from "../../systems/distance";
import { LOG_ALPHA_ITEM, LOG_BETA_ITEM } from "../../systems/EntityStats";
import { missionFeatures, readInventory } from "../../systems/GameState";
import type { JournalEntryId } from "../../systems/Journal";
import {
  isLogCacheType,
  LOG_CACHE_ALPHA_TYPE,
  LOG_CACHE_BETA_TYPE,
  LOG_CACHE_TYPE,
  noteBetaLost,
  noteTerminalHacked,
  type MissionFeatures,
  type ObjectiveState,
} from "../../systems/Objectives";
import { pickQualiaRackIndex, QUALIA_RACK_TERMINAL_TYPE } from "../../systems/QualiaLock";
import type { NoiseEvents } from "./NoiseEvents";
import type { PowerControl } from "./PowerControl";
import type { OverlayGate } from "./OverlayGate";

/**
 * What a completed hold-to-hack does, and which terminals are special.
 *
 * Three of a level's terminals are not what the map says they are: one is
 * promoted to a silicate rack, one to log-cache node ALPHA, and the shipped map
 * types all thirteen of its terminals the same way — so the promotion rules and
 * the breach effect belong together. So does the deferred half: a log-cache or a
 * rack hands off to a minigame overlay and only applies its effect when that
 * overlay comes back solved, which is why the pending terminal is state.
 */

/**
 * Radius (tiles) around a hacked terminal whose doors it releases — and, since the
 * lighting became switchable circuits, whose lights it kills.
 *
 * One number for both on purpose. A breach is a breach: what a terminal gives you
 * is authority over the fixtures in this room, and splitting that into a door reach
 * and a separate light reach would be two rules where the player only ever learns
 * one. The doors come open and the room goes dark, together.
 */
const HACK_UNLOCK_RADIUS = 6;

/** Getters for everything `create()` rebinds per level. */
export interface HackWorld {
  tileSize(): number;
  player(): Player;
  terminals(): readonly Terminal[];
  doors(): readonly Door[];
  /**
   * The circuits the hack darkens, and the thing that darkens them.
   *
   * Routed through `PowerControl` rather than straight at `Lighting` so a hacked
   * blackout behaves like every other throw — both halves of "lit" move together,
   * and it persists across a level change.
   */
  power(): PowerControl;
  detection(): DetectionSystem;
  noise(): NoiseEvents;
  overlays(): OverlayGate;
  objectives(): ObjectiveState;
  registry(): Phaser.Data.DataManager;
  note(id: JournalEntryId): void;
  /**
   * Takes whatever facility memo this deck's terminals still hold. Given a level
   * rather than the terminal: a memo belongs to the deck, not the panel — see
   * `Memos.nextMemoFor`.
   */
  takeMemo(level: string): void;
  /** The level the player is on, for {@link takeMemo}. */
  levelName(): string;
  /** Republishes the objectives after a note lands. */
  publishObjectives(): void;
}

export class TerminalHacks {
  /** The log-cache terminal whose breach launched the compliance puzzle. */
  private pendingCompliance?: Terminal;
  /** The silicate-rack terminal whose breach launched the qualia bypass. */
  private pendingQualia?: Terminal;
  /** The terminal promoted to a silicate server rack in the current level. */
  private rack?: Terminal;
  /** Memoised {@link features}; cleared per run so a fresh map re-reads it. */
  private runFeatures?: MissionFeatures;

  constructor(private readonly w: HackWorld) {}

  /** Clears everything that belongs to a run rather than to a level. */
  reset(): void {
    this.pendingCompliance = undefined;
    this.pendingQualia = undefined;
    this.rack = undefined;
    this.runFeatures = undefined;
  }

  /**
   * Which acts this map furnished — see `missionFeatures`.
   *
   * Resolved once per scene rather than per call. The four flags behind it are written
   * by `BootScene` before the first frame and never change during a run, so reading
   * them out of the registry every frame was five lookups and two allocations (the
   * object, plus the closure inside `missionFeatures`) to re-derive a constant — on
   * every level, including the ones with none of these acts on them.
   */
  features(): MissionFeatures {
    return (this.runFeatures ??= missionFeatures(this.w.registry()));
  }

  /**
   * A completed hold-to-hack. A log-cache breach opens the Doctrinal Compliance
   * minigame — solving it recovers EIRA-7's logs — and a rack opens the Qualia
   * Phase-Lock bypass, while every other terminal fires its effect immediately.
   */
  onComplete(terminal: Terminal): void {
    if (isLogCacheType(terminal.stats.type)) {
      this.pendingCompliance = terminal;
      this.w.overlays().set("compliance", true);
    } else if (this.isQualiaRack(terminal)) {
      this.pendingQualia = terminal;
      this.w.overlays().set("qualia", true);
    } else {
      this.apply(terminal);
    }
  }

  /** A terminal is a silicate server rack if authored so, or promoted per level. */
  isQualiaRack(terminal: Terminal): boolean {
    return terminal.stats.type === QUALIA_RACK_TERMINAL_TYPE || terminal === this.rack;
  }

  /**
   * Settles a minigame overlay: applying the breach on a solve, re-arming the
   * terminal on an abort so the mission-critical log stays recoverable, and
   * destroying it on a wrong-but-committed transmit (compliance only — qualia
   * never reports "failed").
   *
   * All three outcomes resolve through one path rather than duplicated per
   * overlay, so which pending terminal is claimed can't drift between them.
   */
  settleOverlay(which: "compliance" | "qualia", result: "solved" | "closed" | "failed"): void {
    const term = which === "compliance" ? this.pendingCompliance : this.pendingQualia;
    if (which === "compliance") this.pendingCompliance = undefined;
    else this.pendingQualia = undefined;
    this.w.overlays().set(which, false);
    if (result === "solved") {
      // The bypass is its own beat, and only the rack has one: matching a
      // silicate's waveform until the lock can no longer tell you apart is the
      // Shared Field's argument made by the facility's own access control.
      if (which === "qualia") this.w.note("the-rack");
      if (term) this.apply(term);
    } else if (result === "failed") {
      if (term) this.fail(term);
    } else {
      term?.reopen();
    }
  }

  /**
   * The wrong-transmit consequence: bricks the terminal and, for BETA
   * specifically, persists the loss. Shared by the real "failed" overlay
   * outcome and {@link debugForceFail} so a tester exercises the exact same
   * path a player would, rather than a lookalike.
   */
  private fail(terminal: Terminal): void {
    terminal.brick();
    // Only BETA is persisted: it's the one generated terminal with a fixed
    // type, so the loss always refers to this same physical terminal. ALPHA
    // is re-designated per level visit (see designateLogCacheNodes), so
    // persisting its loss could brick a terminal the player never touched.
    if (terminal.stats.type === LOG_CACHE_BETA_TYPE) {
      noteBetaLost(this.w.objectives());
      this.w.publishObjectives();
    }
    this.w.note("node-lost");
  }

  /**
   * Debug-only: applies the compliance puzzle's wrong-transmit consequence to
   * any terminal directly, without playing the minigame. Lets a tester confirm
   * the bricked art, the journal entry, and — for the crawlspace terminal —
   * that the loss survives a checkpoint reload, without having to solve the
   * puzzle wrong on purpose each time.
   */
  debugForceFail(terminal: Terminal): void {
    this.fail(terminal);
  }

  /**
   * Re-bricks the crawlspace BETA terminal on level build if a previous visit
   * already lost it — `Terminal.bricked` is runtime-only and rebuilt fresh by
   * `LevelBuilder` on every level entry, so without this a checkpoint reload
   * (e.g. after a capture) would quietly hand back a fresh, hackable BETA.
   */
  reapplyLostBeta(): void {
    if (!this.w.objectives().betaLost) return;
    const beta = this.w.terminals().find((t) => t.stats.type === LOG_CACHE_BETA_TYPE);
    beta?.brick();
  }

  /**
   * Promotes the terminal nearest the player's arrival point to a silicate server
   * rack, so breaching it launches the Qualia Phase-Lock bypass. Prefers a plain
   * terminal, but the shipped map types every terminal as a log-cache, so it will
   * retype the nearest log-cache instead — never the last one, since the mission
   * needs a log-cache to recover EIRA-7's logs. Skipped when the level already
   * authors an explicit `qualia_rack` terminal or has no terminal to spare.
   */
  designateQualiaRack(): void {
    const player = this.w.player();
    const terminals = this.w.terminals();
    const idx = pickQualiaRackIndex(
      terminals.map((t) => ({ type: t.stats.type, x: t.x, y: t.y })),
      { x: player.x, y: player.y },
      LOG_CACHE_TYPE,
    );
    if (idx < 0) return;
    const rack = terminals[idx];
    rack.stats.type = QUALIA_RACK_TERMINAL_TYPE;
    this.rack = rack;
  }

  /**
   * Designates one of this level's plain log-caches as node ALPHA.
   *
   * The shipped map types all thirteen of its terminals `LOG_CACHE` and puts every one
   * of them on the start deck, so ALPHA cannot be authoring — it is picked here, the same
   * way {@link designateQualiaRack} promotes a rack. BETA is not: it is a terminal the
   * engine places in the crawlspace (`src/map/LogCacheBeta.ts`) carrying its type
   * directly, because there is no terminal down there to promote.
   *
   * Runs after `designateQualiaRack` so it can never claim the terminal that one took.
   */
  designateLogCacheNodes(): void {
    const terminals = this.w.terminals();
    if (terminals.some((t) => t.stats.type === LOG_CACHE_ALPHA_TYPE)) return;
    const player = this.w.player();
    // Nearest to the arrival point: ALPHA should be the first cache the player meets,
    // and on this map that is whichever one they walk into.
    let best: Terminal | undefined;
    let bestDist = Infinity;
    for (const t of terminals) {
      if (t.stats.type !== LOG_CACHE_TYPE) continue;
      const d = len(t.x - player.x, t.y - player.y);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    if (best) best.stats.type = LOG_CACHE_ALPHA_TYPE;
  }

  /**
   * A completed hack releases every door within {@link HACK_UNLOCK_RADIUS} — and
   * spills whatever else the terminal was holding.
   *
   * The single funnel every landed breach passes through: the plain path from
   * {@link onComplete}, and a minigame that came back solved. That is why the
   * memo hangs here rather than on the plain branch, which on the shipped map is
   * very nearly dead code — `typeInertTerminals` gives every authored terminal
   * the export's `LOG_CACHE` default, so almost all of them route through the
   * compliance puzzle instead.
   */
  private apply(terminal: Terminal): void {
    const ts = this.w.tileSize();
    const tx = terminal.x / ts;
    const ty = terminal.y / ts;
    const noise = this.w.noise();
    for (const door of this.w.doors()) {
      const d = len(door.tileX + 0.5 - tx, door.tileY + 0.5 - ty);
      if (d <= HACK_UNLOCK_RADIUS && door.setOpen(true)) noise.doorOperated(door);
    }
    // The lights in the same reach, off the same breach. This is the remote option
    // in a set of three: the switch is quiet and local and needs you in the room,
    // the breaker is loud and takes a wing and gets somebody sent to undo it, and
    // this costs the hold and the breach the player was already paying for.
    this.w.power().cutCircuits(
      this.w.detection().refsWithin(terminal.x, terminal.y, HACK_UNLOCK_RADIUS * ts),
    );
    getAudio().hack();
    // Breaching a log-cache terminal recovers EIRA-7's logs (mission objective).
    const objectives = this.w.objectives();
    const hadLogs = objectives.logsRecovered;
    noteTerminalHacked(objectives, terminal.stats.type);
    this.w.publishObjectives();
    if (!hadLogs && objectives.logsRecovered) this.w.note("the-cache");

    // A named node also hands over the half of her it holds. The item is what the
    // player sees under KEY ITEMS — the objective flag is what the mission reads — and
    // both matter, because the fiction's whole claim is that the cache *is* her rather
    // than a record about her.
    const item =
      terminal.stats.type === LOG_CACHE_ALPHA_TYPE
        ? LOG_ALPHA_ITEM
        : terminal.stats.type === LOG_CACHE_BETA_TYPE
          ? LOG_BETA_ITEM
          : undefined;
    if (item) {
      const registry = this.w.registry();
      const inv = readInventory(registry);
      if (!inv.includes(item)) {
        inv.push(item);
        registry.set("inventory", inv);
      }
      this.w.note(item === LOG_ALPHA_ITEM ? "node-alpha" : "node-beta");
    }

    // Last, and after the mission has taken what it came for: the memo is the
    // thing the terminal was holding that nobody meant to leave in it.
    this.w.takeMemo(this.w.levelName());
  }
}
