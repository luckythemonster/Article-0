import Phaser from "phaser";

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

  constructor(
    scene: Phaser.Scene,
    private readonly items: MenuItem[],
    private readonly gap = 36,
  ) {
    for (const item of items) {
      this.texts.push(
        scene.add
          .text(0, 0, item.label, {
            fontFamily: "monospace",
            fontSize: "20px",
            color: "#8899aa",
          })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(1000),
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
    this.texts.forEach((t, i) => t.setPosition(cx, top + i * this.gap));
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
    if (item && item.enabled !== false) item.onSelect();
  }

  private refresh(): void {
    this.texts.forEach((t, i) => {
      const it = this.items[i];
      const disabled = it.enabled === false;
      const selected = i === this.index && !disabled;
      t.setColor(disabled ? "#3a4654" : selected ? "#39d3ff" : "#8899aa");
      t.setText((selected ? "▸ " : "  ") + it.label);
    });
  }
}
