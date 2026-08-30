import Phaser from "phaser";
import {
  objectiveLines,
  objectiveSummary,
  objectiveSummaryText,
  type MissionFeatures,
  type ObjectiveLine,
  type ObjectiveState,
} from "../systems/Objectives";
import { FONT_MONO } from "./fonts";
import { onResize } from "./resize";
import {
  OBJECTIVE_EXPAND_MS,
  OBJECTIVE_PAD_X,
  OBJECTIVE_PAD_Y,
  OBJECTIVE_TOP,
  objectiveCentre,
  objectiveWrapWidth,
} from "./hudLayout";
import { UI, UI_DEPTH, UI_TEXT } from "./hudTheme";

/** The expanded form's first row. */
const HEADING = "▸ DIRECTIVE · SMUGGLE EIRA-7";

/**
 * The objective tracker, pinned to the top-centre of the screen.
 *
 * It stands as a **single row** — `▸ DIRECTIVE 2/4 · Breach log-cache node BETA
 * (crawlspace)` — on a backing plate, and expands to the full `✓`/`○` checklist for
 * {@link OBJECTIVE_EXPAND_MS} whenever the directive changes, then settles back.
 *
 * It used to print the whole list permanently, in bare white type with no backing,
 * which made it simultaneously the least legible thing in the HUD (12px mono read
 * against whatever tilemap happened to be underneath) and the most distracting
 * (five lines of unchanging text over the middle of the play field). Neither half
 * of that was buying anything: the full list is already permanently available in
 * the pause menu's OBJECTIVES tab — its *first* tab — and in the codec's DIRECTIVE
 * block, so the HUD only has to answer "what now?" at a glance and get out of the
 * way. `J` hides it entirely, the way `K` hides the alert-network readout.
 *
 * One `Text` rather than the two it used to be, and that is what makes the plate
 * work: `backgroundColor` wraps a text object's own box, so a heading and a list as
 * separate objects would be two plates with a seam between them. The cost is that
 * the heading no longer reads dimmer than the rows, which is a fair trade for
 * something that is only on screen during a six-second flash.
 *
 * "Top-centre" means centred on the space between the status stack and the radar,
 * not on the viewport — see {@link objectiveCentre}. On a wide canvas those are the
 * same place; on a narrow one they are not, and the difference is the directive
 * printing through the SRP meter.
 */
export class ObjectiveHud {
  private readonly scene: Phaser.Scene;
  private readonly text: Phaser.GameObjects.Text;
  /** The expanded checklist, cached so `update` can spot a change without re-rendering. */
  private lastFull = "";
  /** The collapsed row, same purpose. */
  private lastRow = "";
  /** Whether every act is done — drives the colour, in both forms. */
  private complete = false;
  /** Showing the full list rather than the standing row. */
  private expanded = false;
  /** Milliseconds of expansion left. Counted down off the frame, not the clock. */
  private expandRemaining = 0;
  /** The player's `J` toggle. Beats {@link expanded}: hidden means hidden. */
  private shown = true;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.text = scene.add
      .text(0, OBJECTIVE_TOP, "", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.label,
        color: UI.textStrong,
        align: "center",
        lineSpacing: 2,
        // The plate. `bgPanel` at 80% rather than a nine-slice: the tracker changes
        // height every time it expands, and a `Text` background is the one backing
        // that follows the type for free. `EncounterBand` and the debug inspector
        // are backed the same way.
        backgroundColor: `${UI.bgPanel}cc`,
        padding: { x: OBJECTIVE_PAD_X, y: OBJECTIVE_PAD_Y },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE)
      // Nothing to say until the scene publishes a directive, and an empty `Text`
      // with a background is still a bare 16x12 plate sitting in the corner.
      .setVisible(false);

    onResize(scene, () => this.layout(), true);
  }

  /**
   * Re-centres the block against the space available.
   *
   * Runs on resize *and* after every text change, because the block's width is what
   * decides whether the screen centre is usable and it changes shape every time the
   * tracker expands or an objective completes.
   */
  private layout(): void {
    const width = this.scene.scale.width;
    this.text.setWordWrapWidth(objectiveWrapWidth(width));
    // `Text.width` already includes the padding, so this centres the plate rather
    // than the glyphs inside it — which is what has to clear the neighbours.
    this.text.setPosition(objectiveCentre(width, this.text.width), OBJECTIVE_TOP);
  }

  /**
   * @param deltaMs frame time, for the collapse countdown. 0 holds the directive
   *   expanded while an overlay owns the screen — see the call site in `UIScene`.
   */
  update(
    state: ObjectiveState,
    currentLevel: string,
    features: MissionFeatures,
    deltaMs: number,
  ): void {
    this.tick(deltaMs);
    const lines = objectiveLines(state, currentLevel, features);
    const was = this.lastFull;
    const full = expandedText(lines);
    const row = objectiveSummaryText(objectiveSummary(state, currentLevel, features));
    this.complete = lines.every((l) => l.done);

    // A changed checklist is the whole trigger: an act completed, or a new level
    // brought a different set of lines. `lastFull` starts empty, so the first update
    // of the session expands too — the player is shown the directive on arrival and
    // it settles by itself, the same teaching move the controls hint makes.
    const rowChanged = row !== this.lastRow;
    this.lastFull = full;
    this.lastRow = row;
    // `setText` reflows and re-centres the object, so it is worth not doing 60
    // times a second for a string that only moves when an objective completes.
    if (full !== was) this.expand();
    else if (rowChanged) this.render();
  }

  /** Shows the full checklist, and restarts the countdown back to the standing row. */
  private expand(): void {
    this.expanded = true;
    // Assignment, not addition: two acts completing in quick succession should give
    // the player six seconds with the new list, not twelve.
    this.expandRemaining = OBJECTIVE_EXPAND_MS;
    this.render();
  }

  /**
   * Runs the expansion down, and collapses when it reaches zero.
   *
   * Off the frame delta rather than a `scene.time.delayedCall`, for the same reason
   * `Hud` runs the EKG that way: `UIScene` keeps updating behind the codec, the
   * pause menu and both minigames, and a scene-clock timer keeps burning down
   * there. The directive first expands during the opening codec briefing, so with a
   * timer the player's six seconds elapsed while they were reading something else
   * and the checklist was already gone when the game handed control back. Passing 0
   * for `deltaMs` while suspended holds it instead. It also means a timer can't
   * outlive the widget and fire into a destroyed Game Object.
   */
  private tick(deltaMs: number): void {
    if (!this.expanded || deltaMs <= 0) return;
    this.expandRemaining -= deltaMs;
    if (this.expandRemaining > 0) return;
    this.expanded = false;
    this.render();
  }

  /**
   * Draws whichever form is current.
   *
   * The single place that touches the text object, so the two states and the `J`
   * toggle cannot get out of step — a collapse firing while the tracker is hidden
   * has to leave it hidden.
   */
  private render(): void {
    this.text.setVisible(this.shown && this.lastRow.length > 0);
    this.text.setText(this.expanded ? this.lastFull : this.lastRow);
    this.text.setColor(this.complete ? UI.greenSoft : UI.textStrong);
    // After setText, so the bounds being centred are the new ones.
    this.layout();
  }

  /** Whether the tracker is currently on screen. */
  isShown(): boolean {
    return this.shown;
  }

  /** Shows or hides the tracker — the `J` binding in `UIScene`. */
  setShown(shown: boolean): void {
    this.shown = shown;
    this.render();
  }
}

/** The expanded checklist: the DIRECTIVE heading, then a marked row per act. */
function expandedText(lines: ObjectiveLine[]): string {
  return [HEADING, ...lines.map((l) => `${l.done ? "✓" : "○"} ${l.label}`)].join("\n");
}
