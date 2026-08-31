import Phaser from "phaser";
import { Menu } from "../ui/Menu";
import { FONT_DISPLAY, FONT_MONO } from "../ui/fonts";
import { onResize } from "../ui/resize";
import { UI } from "../ui/hudTheme";
import type { ShaftStop } from "../systems/TransitionGraph";

/**
 * The car's control panel: which floor of the shaft to ride to.
 *
 * A shaft links its floors as a one-way cycle (`TransitionGraph.linkCycle`), so
 * without this the car has exactly one destination and reaching the floor below
 * means riding all the way round. The cycle stays as it is — it is still the
 * ride a two-stop lift takes, and the graph's answer when nobody picks — and
 * this offers the whole ring instead.
 *
 * Drawn with {@link Menu}, the same keyboard column the title and outcome
 * screens use, because a locked floor wants exactly what its `enabled: false`
 * already does: dimmed, and skipped by navigation rather than absent. That is
 * the gate `GameScene` applies to the roof, and showing it sealed rather than
 * hiding it is the same reasoning the roof ladder has always followed — the
 * player should know where they are going before they are allowed to go.
 */

/** Registry key the chosen stop is posted to, and collected by `GameScene`. */
export const ELEVATOR_CHOICE_KEY = "elevatorChoice";
/** Registry key set when the panel is dismissed without a choice. */
export const ELEVATOR_CLOSED_KEY = "elevatorClosed";

/** One row of the panel: a stop, plus why it can't be ridden to. */
export interface ElevatorFloor extends ShaftStop {
  /** Dimmed and unselectable. The reason is appended to the label. */
  lockedNote?: string;
}

export interface ElevatorSceneData {
  /** Where the car is now — printed as the header, never offered as a row. */
  here: string;
  /** Every other floor the shaft serves, in map order. */
  floors: ElevatorFloor[];
}

export class ElevatorScene extends Phaser.Scene {
  constructor() {
    super("ElevatorScene");
  }

  create(data: ElevatorSceneData): void {
    // `UIScene` runs in parallel and is above this one in the scene list, so
    // without this the HUD sits on top of the veil at full brightness and the
    // floor rows read against the live level art. The other four overlays never
    // hit this because they are DOM, and the DOM is above the canvas outright.
    this.scene.bringToTop();

    const veil = this.add
      .rectangle(0, 0, 10, 10, 0x0a0e14, 0.92)
      .setOrigin(0, 0)
      .setScrollFactor(0);
    const banner = this.add
      .text(0, 0, "ELEVATOR", {
        fontFamily: FONT_DISPLAY,
        fontSize: "34px",
        color: UI.cyan,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const here = this.add
      .text(0, 0, `CURRENT FLOOR — ${data.here.toUpperCase()}`, {
        fontFamily: FONT_MONO,
        fontSize: "14px",
        color: UI.textFaint,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const hint = this.add
      .text(0, 0, "[ESC] CANCEL", {
        fontFamily: FONT_MONO,
        fontSize: "12px",
        color: UI.textDisabled,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const menu = new Menu(
      this,
      data.floors.map((floor) => ({
        label: floor.lockedNote ? `${floor.label} — ${floor.lockedNote}` : floor.label,
        enabled: floor.lockedNote === undefined,
        onSelect: () => {
          // The scene has no handle on GameScene — it is launched over it, not
          // by it — so the choice goes through the registry, the same channel
          // the two minigames report their outcome on.
          this.registry.set(ELEVATOR_CHOICE_KEY, {
            level: floor.level,
            x: floor.x,
            y: floor.y,
            label: floor.label,
          } satisfies ShaftStop);
        },
      })),
    );

    this.input.keyboard?.on("keydown-ESC", () => {
      this.registry.set(ELEVATOR_CLOSED_KEY, true);
    });

    const layout = (w: number, h: number): void => {
      veil.setSize(w, h);
      banner.setPosition(w / 2, h * 0.24);
      here.setPosition(w / 2, h * 0.24 + 34);
      menu.layout(w / 2, h * 0.52);
      hint.setPosition(w / 2, h * 0.86);
    };
    onResize(this, layout, true);
  }
}
