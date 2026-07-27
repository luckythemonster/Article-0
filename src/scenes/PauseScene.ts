import Phaser from "phaser";
import { PauseMenuView, type PauseSnapshot } from "../ui/PauseMenuView";
import { PAUSE_REQUEST_KEY, SAVE_WRITTEN_KEY, type MapSnapshot, type PauseRequest } from "../systems/PauseState";
import { initialObjectives, type ObjectiveState } from "../systems/Objectives";
import { initialJournal, type JournalState } from "../systems/Journal";
import { listSaves, type SlotId } from "../systems/SaveGame";
import { getAudio } from "../systems/AudioDirector";
import { missionFeatures } from "../systems/GameState";
import type { ActiveItemsView } from "../systems/ActiveItems";
import type { ConductView } from "../systems/Conduct";
import type { AlertPhase } from "../systems/AlertState";
import type { SharedFieldView } from "../ui/SharedFieldHud";
import type { Settings } from "../systems/Settings";

const CODEC_ROOT_ID = "codec-root";

/**
 * The pause menu's host scene.
 *
 * GameScene still owns the pause *state* — it freezes its own sim, reads Esc, and
 * acts on what the player chooses — so this scene's job is narrow: read the
 * registry into a snapshot, mount the DOM view on top of the frozen game, and
 * post the player's choices back as `pauseRequest` for GameScene to consume. The
 * same division of labour the codec overlay uses, and the reason the menu can
 * stay a plain DOM widget with no engine knowledge.
 *
 * Audio settings are the one exception: they're applied and persisted straight
 * from here, because nothing about them needs the player's position or the scene
 * stack, and a round-trip through GameScene would just add a frame of latency to
 * a slider the player is dragging.
 */
export class PauseScene extends Phaser.Scene {
  private view?: PauseMenuView;
  private lastSaveEcho?: number;

  constructor() {
    super("PauseScene");
  }

  create(): void {
    const mount = document.getElementById(CODEC_ROOT_ID)!;
    this.registry.remove(SAVE_WRITTEN_KEY);

    this.view = new PauseMenuView(mount, this.snapshot(), {
      onResume: () => this.request({ kind: "resume" }),
      onSave: (slot: SlotId) => this.request({ kind: "save", slot }),
      onLoad: (slot: SlotId) => this.request({ kind: "load", slot }),
      onQuit: () => this.request({ kind: "quit" }),
      onSettings: (settings: Settings) => getAudio().applySettings(settings),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.view?.destroy();
      this.view = undefined;
    });
  }

  /**
   * Watches for a save landing so the slot listing can re-render.
   *
   * GameScene writes the file (only it knows where the player is standing) and
   * echoes the slot back on the registry; without this the player would save and
   * see the row still reading EMPTY.
   */
  update(): void {
    const echo = this.registry.get(SAVE_WRITTEN_KEY) as { at: number } | undefined;
    if (!echo || echo.at === this.lastSaveEcho) return;
    this.lastSaveEcho = echo.at;
    getAudio().hack();
    this.view?.refreshSaves(listSaves());
  }

  private request(request: PauseRequest): void {
    getAudio().select();
    this.registry.set(PAUSE_REQUEST_KEY, request);
  }

  /** Reads the frozen run out of the registry into what the view renders. */
  private snapshot(): PauseSnapshot {
    const r = this.registry;
    return {
      objectives: (r.get("objectives") as ObjectiveState | undefined) ?? initialObjectives(),
      currentLevel: (r.get("currentLevel") as string | undefined) ?? "",
      features: missionFeatures(r),
      inventory: (r.get("inventory") as string[] | undefined) ?? [],
      active: (r.get("activeItems") as ActiveItemsView | undefined) ?? {
        chaffRemaining: 0,
        thermalRemaining: 0,
        flashlightOwned: false,
        flashlightOn: false,
        flashlightCharge: 1,
      },
      journal: (r.get("journal") as JournalState | undefined) ?? initialJournal(),
      hp: (r.get("playerHp") as number | undefined) ?? 0,
      maxHp: (r.get("playerMaxHp") as number | undefined) ?? 1,
      detection: (r.get("detection") as number | undefined) ?? 0,
      alertPhase: (r.get("alertPhase") as AlertPhase | undefined) ?? "INFILTRATION",
      conduct: r.get("conduct") as ConductView | undefined,
      sharedField: r.get("sharedField") as SharedFieldView | undefined,
      playTimeMs: (r.get("playTimeMs") as number | undefined) ?? 0,
      map: r.get("mapSnapshot") as MapSnapshot | undefined,
      saves: listSaves(),
      settings: getAudio().getSettings(),
    };
  }
}
