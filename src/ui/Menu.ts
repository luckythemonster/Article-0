import Phaser from "phaser";
import { getAudio } from "../systems/AudioDirector";
import { FONT_MONO } from "./fonts";

/** Pixels between the caret and the left edge of the label column. */
const CARET_GAP = 12;

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** A disabled item is dimmed and skipped by navigation/selection. */
  enabled?: boolean;
}

/**
 * A small keyboard-navigable vertical menu (↑/↓ or W/S to move, Enter/Space to
 * choose), shared by the title and outcome screens. Create it, then call
 * {@link layout} to place its centred column — re-call on resize.
 */
export class Menu {
  private index = 0;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  /** Selection markers, positioned beside their row rather than prefixed to it. */
  private readonly carets: Phaser.GameObjects.Text[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly items: MenuItem[],
    private readonly gap = 36,
  ) {
    for (const item of items) {
      this.texts.push(
        scene.add
          .text(0, 0, item.label, {
            fontFamily: FONT_MONO,
            fontSize: "20px",
            color: "#8899aa",
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(1000),
      );
      this.carets.push(
        scene.add
          .text(0, 0, "▸", { fontFamily: FONT_MONO, fontSize: "20px", color: "#39d3ff" })
          .setOrigin(1, 0.5)
          .setScrollFactor(0)
          .setDepth(1000)
          .setVisible(false),
      );
    }
    const first = items.findIndex((it) => it.enabled !== false);
    this.index = first < 0 ? 0 : first;
    this.refresh();

    const kb = scene.input.keyboard!;
    kb.on("keydown-UP", () => this.move(-1));
    kb.on("keydown-W", () => this.move(-1));
    kb.on("keydown-DOWN", () => this.move(1));
    kb.on("keydown-S", () => this.move(1));
    kb.on("keydown-ENTER", () => this.select());
    kb.on("keydown-SPACE", () => this.select());
  }

  /** Positions the menu as a column centred on (cx, cy). */
  layout(cx: number, cy: number): void {
    const top = cy - ((this.texts.length - 1) * this.gap) / 2;
    this.texts.forEach((t, i) => {
      const y = top + i * this.gap;
      t.setPosition(cx, y);
      // Right-aligned just off the widest row, so the caret sits at a fixed x
      // instead of tracking each label's own width.
      this.carets[i].setPosition(cx - this.widestHalf() - CARET_GAP, y);
    });
  }

  /** Half the width of the longest label — the column's left edge. */
  private widestHalf(): number {
    return Math.max(...this.texts.map((t) => t.width)) / 2;
  }

  private move(delta: number): void {
    const n = this.items.length;
    let i = this.index;
    for (let step = 0; step < n; step++) {
      i = (i + delta + n) % n;
      if (this.items[i].enabled !== false) break;
    }
    this.index = i;
    this.refresh();
  }

  private select(): void {
    const item = this.items[this.index];
    if (item && item.enabled !== false) {
      getAudio().select();
      item.onSelect();
    }
  }

  private refresh(): void {
    this.texts.forEach((t, i) => {
      const it = this.items[i];
      const disabled = it.enabled === false;
      const selected = i === this.index && !disabled;
      t.setColor(disabled ? "#3a4654" : selected ? "#39d3ff" : "#8899aa");
      // The label text never changes, so its centred position can't shift. The
      // caret used to be prefixed to it ("▸ " against two spaces) — fine while
      // everything was one font, but ▸ (U+25B8) is not in Share Tech Mono and
      // falls back to a face with a different advance, so the swap resized the
      // string and slid the label sideways every time the selection moved.
      t.setText(it.label);
      this.carets[i].setVisible(selected);
    });
  }
}
