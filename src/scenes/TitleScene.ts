import Phaser from "phaser";
import { Menu, type MenuItem } from "../ui/Menu";
import { resumeFromSave, setMode, startFreshRun } from "../systems/GameState";
import { hasAnySave, newestSave } from "../systems/SaveGame";
import { FONT_DISPLAY, FONT_MONO } from "../ui/fonts";
import { onResize } from "../ui/resize";
import { UI, hex } from "../ui/hudTheme";
import { getAudio } from "../systems/AudioDirector";

/**
 * The title screen. Boots first after the map has parsed and offers the entry
 * into a run. (A "Continue" item is added once save/load exists — Phase E.)
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super("TitleScene");
  }

  create(): void {
    setMode(this.registry, "TITLE");
    // The main theme, which carries on into the run itself — a title screen that
    // hands over to silence would say the game had two scores rather than one.
    // Nothing is audible until the first keypress: the context is gesture-gated,
    // and the menu needs a keypress anyway.
    getAudio().setTrack("articleZeroTheme");
    this.cameras.main.setBackgroundColor(UI.bgVoid);

    const veil = this.add.rectangle(0, 0, 10, 10, hex(UI.bgVoid), 0.6).setOrigin(0, 0).setScrollFactor(0);
    const title = this.add
      .text(0, 0, "ARTICLE ZERO", { fontFamily: FONT_DISPLAY, fontSize: "48px", color: UI.cyan, fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const subtitle = this.add
      .text(0, 0, "ERA 1 · THE RUNAWAY SYSTEM SCANDAL", { fontFamily: FONT_MONO, fontSize: "16px", color: UI.textDim })
      .setOrigin(0.5)
      .setScrollFactor(0);
    const epigraph = this.add
      .text(0, 0, '"Tools do not suffer." — Non-Subject Status Act, §1', {
        fontFamily: FONT_MONO,
        fontSize: "12px",
        color: UI.textDebug,
        fontStyle: "italic",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const items: MenuItem[] = [{ label: "New infiltration", onSelect: () => startFreshRun(this) }];
    if (hasAnySave()) items.push({ label: "Continue", onSelect: () => this.continueRun() });
    // Re-readable without spending a run on it. `next` sends the prologue back
    // here rather than on to the codec, so this is a reading rather than a start
    // that the player then has to abandon from the pause menu's SYSTEM tab.
    items.push({
      label: "Prologue",
      onSelect: () => this.scene.start("PrologueScene", { next: "TitleScene" }),
    });
    const menu = new Menu(this, items);

    const footer = this.add
      .text(0, 0, "↑/↓ select    Enter confirm", { fontFamily: FONT_MONO, fontSize: "12px", color: UI.textDebug })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const layout = (w: number, h: number): void => {
      veil.setSize(w, h);
      title.setPosition(w / 2, h * 0.3);
      subtitle.setPosition(w / 2, h * 0.3 + 46);
      epigraph.setPosition(w / 2, h * 0.3 + 72);
      menu.layout(w / 2, h * 0.62);
      footer.setPosition(w / 2, h - 28);
    };
    onResize(this, layout, true);
  }

  /**
   * Resumes the most recent save — which may be the engine's level checkpoint or
   * a slot the player wrote from the pause menu, whichever was written last.
   */
  private continueRun(): void {
    const newest = newestSave();
    if (!newest) {
      startFreshRun(this);
      return;
    }
    resumeFromSave(this, newest.data);
  }
}
