import Phaser from "phaser";
import { FONT_DISPLAY, FONT_MONO } from "../ui/fonts";
import { onResize } from "../ui/resize";
import { UI, UI_DEPTH, hex } from "../ui/hudTheme";
import { placePanel, setPanelFrame, uiPanel } from "../ui/NineSlicePanel";
import { hasUiTexture } from "../ui/UiTextures";
import { getAudio } from "../systems/AudioDirector";
import { alertPulse } from "../ui/NetworkPanel";
import { PANEL_INSET } from "../ui/hudLayout";
import {
  BUTTON_GAP,
  BUTTON_SIZE,
  HINT_BASELINE,
  LABEL_GAP,
  PANEL_ALERT_FRAME,
  RULE_OFFSET,
  buttonAt,
  buttonStateFor,
  elevatorButtonFrame,
  firstSelectable,
  nextSelectable,
  panelDigitFrame,
  panelSize,
} from "../ui/ElevatorPanel";
import type { ShaftStop } from "../systems/TransitionGraph";

/**
 * The car's control plate: a call button per floor, lit for the one selected.
 *
 * A shaft links its floors as a one-way cycle (`TransitionGraph.linkCycle`), so
 * without this the car has exactly one destination and reaching the floor below
 * means riding all the way round. The cycle is untouched underneath — it is
 * still what a two-stop lift rides, and still the graph's answer when nobody
 * picks — and this offers the whole ring instead.
 *
 * Drawn as a *plate* rather than a menu over a veil: it is a thing bolted
 * inside the car, so it reads as one. Every part degrades — the casing prefers
 * its own art, falls back to the generic `ui-panel` chrome the HUD already
 * ships, and falls back again to the stroked rectangle `uiPanel` draws with no
 * art at all; the buttons prefer their sheet and fall back to primitives in the
 * same palette. The panel is fully playable in each of those three states,
 * which is the arrangement `UiTextures` exists to make possible.
 *
 * Keyboard and mouse both drive it. A plate covered in buttons that could not
 * be clicked would be the one piece of chrome in the game that lies about what
 * it is.
 */

/** Registry key the chosen stop is posted to, and collected by `GameScene`. */
export const ELEVATOR_CHOICE_KEY = "elevatorChoice";
/** Registry key set when the panel is dismissed without a choice. */
export const ELEVATOR_CLOSED_KEY = "elevatorClosed";

/** How long the pressed lamp holds before the car leaves, in ms. */
const PRESS_FLASH_MS = 220;

/** One row of the plate: a stop, plus why it can't be ridden to. */
export interface ElevatorFloor extends ShaftStop {
  /** Dimmed and unselectable. The reason is printed beside the floor name. */
  lockedNote?: string;
}

export interface ElevatorSceneData {
  /** Where the car is now — printed in the readout, never given a button. */
  here: string;
  /** Every other floor the shaft serves, in map order. */
  floors: ElevatorFloor[];
  /**
   * A snapshot of `AlertState.phase === "ALERT"` at open time. Safe to take
   * once rather than poll: `GameScene` freezes its whole simulation —
   * `AlertState`'s timer included — while any overlay is open, so the phase
   * cannot change for as long as this scene is up.
   */
  alerting: boolean;
}

/** The objects making up one floor's row, kept together so a repaint is cheap. */
interface Row {
  lamp: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  note: Phaser.GameObjects.Text | undefined;
  hit: Phaser.GameObjects.Zone;
  sealed: boolean;
}

export class ElevatorScene extends Phaser.Scene {
  private rows: Row[] = [];
  private floors: ElevatorFloor[] = [];
  private index = -1;
  /** Set once a floor is chosen: the plate stops taking input and flashes. */
  private committed = false;

  private plate!: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Rectangle;
  /** Whether `plate` is the elevator's own art — the digit/alert readout
   * below only means anything on that sheet, never on the `ui-panel`
   * fallback or the primitive rectangle. */
  private usingElevatorArt = false;
  private alerting = false;
  /** The casing frame last set, so `refreshCasing` skips the no-op case of
   * setting the frame it is already on every single tick. */
  private lastCasingFrame = -1;

  constructor() {
    super("ElevatorScene");
  }

  create(data: ElevatorSceneData): void {
    // `UIScene` runs in parallel and is above this one in the scene list, so
    // without this the HUD sits on top of the veil at full brightness and the
    // plate reads against the live level art. The other four overlays never hit
    // this because they are DOM, and the DOM is above the canvas outright.
    this.scene.bringToTop();

    this.floors = data.floors;
    this.rows = [];
    this.committed = false;
    this.alerting = data.alerting;
    this.lastCasingFrame = -1;

    const veil = this.add
      .rectangle(0, 0, 10, 10, 0x0a0e14, 0.92)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.PANEL - 1);

    // Prefer the elevator's own casing, fall back to the generic panel the HUD
    // already ships, and let `uiPanel` fall back again to primitives if neither
    // is present. Three states, all playable — see the class comment.
    this.usingElevatorArt = hasUiTexture(this, "ui-elevator-panel");
    const casingKey = this.usingElevatorArt ? "ui-elevator-panel" : "ui-panel";
    const size = panelSize(this.floors.length);
    this.plate = uiPanel(this, 0, 0, size.w, size.h, { key: casingKey });

    const banner = this.add
      .text(0, 0, "ELEVATOR", { fontFamily: FONT_DISPLAY, fontSize: "20px", color: UI.cyan })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);
    const readout = this.add
      .text(0, 0, data.here.toUpperCase(), {
        fontFamily: FONT_MONO,
        fontSize: "13px",
        color: UI.blueSoft,
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);
    const rule = this.add
      .rectangle(0, 0, 10, 1, hex(UI.borderCool))
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);
    const hint = this.add
      .text(0, 0, "[ESC] CANCEL", {
        fontFamily: FONT_MONO,
        fontSize: "11px",
        color: UI.textDisabled,
      })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);

    const lit = hasUiTexture(this, "ui-elevator-buttons");
    this.floors.forEach((floor, i) => {
      const sealed = floor.lockedNote !== undefined;
      const lamp = lit
        ? this.add
            .image(0, 0, "ui-elevator-buttons", elevatorButtonFrame("IDLE"))
            .setDisplaySize(BUTTON_SIZE, BUTTON_SIZE)
        : this.add
            .rectangle(0, 0, BUTTON_SIZE, BUTTON_SIZE, hex(UI.bgPanel))
            .setStrokeStyle(1, hex(UI.borderCool));
      lamp.setOrigin(0, 0).setScrollFactor(0).setDepth(UI_DEPTH.FILL);

      const label = this.add
        .text(0, 0, floor.label, { fontFamily: FONT_MONO, fontSize: "14px", color: UI.text })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(UI_DEPTH.ACCENT);
      const note = floor.lockedNote
        ? this.add
            .text(0, 0, floor.lockedNote, {
              fontFamily: FONT_MONO,
              fontSize: "11px",
              color: UI.textDisabled,
            })
            .setOrigin(0, 0.5)
            .setScrollFactor(0)
            .setDepth(UI_DEPTH.ACCENT)
        : undefined;

      // A zone rather than making the lamp itself interactive: the whole row is
      // the target, so the floor name is as clickable as the button beside it.
      const hit = this.add.zone(0, 0, 10, BUTTON_SIZE).setOrigin(0, 0).setScrollFactor(0);
      if (!sealed) {
        hit.setInteractive({ useHandCursor: true });
        hit.on("pointerover", () => this.moveTo(i));
        hit.on("pointerdown", () => {
          this.moveTo(i);
          this.commit();
        });
      }

      this.rows.push({ lamp, label, note, hit, sealed });
    });

    this.index = firstSelectable(this.rows.map((r) => r.sealed));
    this.repaint();

    const kb = this.input.keyboard;
    kb?.on("keydown-UP", () => this.move(-1));
    kb?.on("keydown-W", () => this.move(-1));
    kb?.on("keydown-DOWN", () => this.move(1));
    kb?.on("keydown-S", () => this.move(1));
    kb?.on("keydown-ENTER", () => this.commit());
    kb?.on("keydown-SPACE", () => this.commit());
    kb?.on("keydown-ESC", () => {
      if (this.committed) return;
      this.registry.set(ELEVATOR_CLOSED_KEY, true);
    });

    const layout = (w: number, h: number): void => {
      veil.setSize(w, h);
      const x = Math.round((w - size.w) / 2);
      const y = Math.round((h - size.h) / 2);
      const well = size.w - PANEL_INSET * 2;
      placePanel(this.plate, x, y, size.w, size.h);

      // Everything is placed from the well, never from the plate's outer edge:
      // the outer 12px is nine-slice casing, and content laid against it is
      // drawn over the border rather than inside the panel.
      banner.setPosition(x + PANEL_INSET, y + PANEL_INSET);
      readout.setPosition(x + PANEL_INSET, y + PANEL_INSET + 24);
      rule.setPosition(x + PANEL_INSET, y + RULE_OFFSET);
      rule.setSize(well, 1);
      hint.setPosition(x + PANEL_INSET, y + size.h - HINT_BASELINE);

      this.rows.forEach((row, i) => {
        const at = buttonAt(i);
        row.lamp.setPosition(x + at.x, y + at.y);
        const midY = y + at.y + BUTTON_SIZE / 2;
        row.label.setPosition(x + at.x + BUTTON_SIZE + LABEL_GAP, midY);
        row.note?.setPosition(row.label.x + row.label.width + 8, midY);
        row.hit.setPosition(x + at.x, y + at.y);
        row.hit.setSize(well, BUTTON_SIZE + BUTTON_GAP / 2);
      });
    };
    onResize(this, layout, true);

    // So the casing shows the right digit (or the alert flash) from the very
    // first rendered frame, rather than only from the first `update()` tick.
    this.refreshCasing(this.time.now);
  }

  update(time: number, _delta: number): void {
    this.refreshCasing(time);
  }

  /**
   * Sets the casing's corner LEDs to the cursor's digit, or pulses them
   * between the alert frame and the unlit frame while alerting.
   *
   * A no-op on the `ui-panel` fallback and on the primitive rectangle: their
   * frames mean dark/lit/alert-flash or nothing at all, never a digit, so
   * touching them here would show the wrong thing rather than nothing.
   */
  private refreshCasing(time: number): void {
    if (!this.usingElevatorArt) return;
    const frame = this.alerting
      ? alertPulse(time)
        ? 0
        : PANEL_ALERT_FRAME
      : panelDigitFrame(this.index);
    if (frame === this.lastCasingFrame) return;
    this.lastCasingFrame = frame;
    setPanelFrame(this.plate, frame);
  }

  /** Moves the cursor by one selectable row, if there is one that way. */
  private move(delta: number): void {
    if (this.committed) return;
    const to = nextSelectable(this.rows.map((r) => r.sealed), this.index, delta);
    if (to === this.index) return;
    getAudio().ping();
    this.moveTo(to);
  }

  private moveTo(index: number): void {
    if (this.committed || index === this.index || this.rows[index]?.sealed) return;
    this.index = index;
    this.repaint();
  }

  /**
   * Sends the car to the selected floor.
   *
   * The scene has no handle on `GameScene` — it is launched over it, not by it —
   * so the choice goes through the registry, the same channel the two minigames
   * report their outcome on. Posted after {@link PRESS_FLASH_MS} so the pressed
   * lamp is actually seen: the ride begins with a fade, and a press that
   * resolved on the same frame would never register as a press at all.
   */
  private commit(): void {
    if (this.committed) return;
    const floor = this.floors[this.index];
    if (!floor || this.rows[this.index]?.sealed) return;
    this.committed = true;
    getAudio().select();
    this.repaint();
    this.time.delayedCall(PRESS_FLASH_MS, () => {
      this.registry.set(ELEVATOR_CHOICE_KEY, {
        level: floor.level,
        x: floor.x,
        y: floor.y,
        label: floor.label,
      } satisfies ShaftStop);
    });
  }

  /** Repaints every lamp and label from the current selection. */
  private repaint(): void {
    this.rows.forEach((row, i) => {
      const selected = i === this.index;
      const state = buttonStateFor({
        sealed: row.sealed,
        selected,
        pressed: selected && this.committed,
      });

      if (row.lamp instanceof Phaser.GameObjects.Image) {
        row.lamp.setFrame(elevatorButtonFrame(state));
      } else {
        // The primitive stand-in says the same four things in the palette the
        // rest of the HUD is drawn in, so a panel with no art reads as chrome
        // rather than as something unfinished.
        const fill =
          state === "PRESSED"
            ? UI.cyanBright
            : state === "LIT"
              ? UI.cyan
              : state === "SEALED"
                ? UI.bgVoid
                : UI.bgPanel;
        row.lamp.setFillStyle(hex(fill));
        row.lamp.setStrokeStyle(1, hex(state === "SEALED" ? UI.borderDim : UI.borderCool));
      }

      row.label.setColor(
        row.sealed ? UI.textDisabled : selected ? UI.cyanBright : UI.textMuted,
      );
    });
  }
}
