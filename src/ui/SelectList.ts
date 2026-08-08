import { el } from "./dom";
import { getAudio } from "../systems/AudioDirector";

/**
 * A keyboard-navigable row list for the pause menu's master/detail tabs.
 *
 * Four of the nine tabs are the same shape — a column of things on the left, the
 * selected one written out on the right (journal entries, index terms, held
 * items, save slots) — so the selection model, the ARIA wiring and the
 * scroll-into-view behaviour live here once.
 *
 * Deliberately not the Phaser {@link ./Menu}: that one draws `Text` game objects
 * inside the canvas and binds scene-level keys. This is DOM, so it can scroll,
 * wrap, take a mouse click and be read by a screen reader — which is the whole
 * reason the pause menu is a DOM overlay.
 */

export interface SelectListRow {
  /** Left column text. */
  label: string;
  /** Right-aligned annotation (a count, a timestamp, a ✓). */
  note?: string;
  /** Dimmed and skipped by keyboard navigation. */
  disabled?: boolean;
  /** Invoked on Enter or click. Rows without one are selection-only. */
  onActivate?: () => void;
}

export class SelectList {
  private static idCounter = 0;
  private readonly listId: string;
  readonly node: HTMLElement;
  private rows: SelectListRow[] = [];
  private nodes: HTMLElement[] = [];
  private index = 0;

  /**
   * @param onChange fires whenever the highlighted row changes — the detail pane
   *   re-renders from it. Also fired once by {@link setRows} so the pane is never
   *   blank on first paint.
   */
  constructor(
    private readonly onChange: (index: number) => void,
    label = "Entries",
  ) {
    const id = `select-list-${SelectList.idCounter++}`;
    this.listId = id;
    this.node = el("div", "pause-list");
    this.node.id = id;
    this.node.setAttribute("role", "listbox");
    this.node.setAttribute("aria-label", label);
    this.node.tabIndex = 0;
  }

  setRows(rows: SelectListRow[]): void {
    this.rows = rows;
    this.node.replaceChildren();
    this.nodes = rows.map((row, i) => {
      const node = el("div", row.disabled ? "pause-row pause-row--disabled" : "pause-row");
      node.id = `${this.listId}-opt-${i}`;
      node.setAttribute("role", "option");
      if (row.disabled) {
        node.setAttribute("aria-disabled", "true");
      }
      node.appendChild(el("span", "pause-row-label", row.label));
      if (row.note !== undefined) node.appendChild(el("span", "pause-row-note", row.note));
      if (!row.disabled) {
        node.addEventListener("click", () => {
          if (this.index !== i) {
            getAudio().ping();
          }
          this.select(i);
          this.node.focus({ preventScroll: true });
          row.onActivate?.();
        });
      }
      this.node.appendChild(node);
      return node;
    });

    this.index = rows.findIndex((r) => !r.disabled);
    if (this.index < 0) this.index = 0;
    this.refresh();
    this.onChange(this.index);
  }

  get selected(): number {
    return this.index;
  }

  /** Moves the highlight, skipping disabled rows. Stops at the ends — a list
   *  that wraps makes it impossible to tell you're at the bottom without looking. */
  move(delta: number): void {
    if (this.rows.length === 0) return;
    let i = this.index;
    for (let step = 0; step < this.rows.length; step++) {
      const next = i + delta;
      if (next < 0 || next >= this.rows.length) break;
      i = next;
      if (!this.rows[i].disabled) {
        getAudio().ping();
        this.select(i);
        return;
      }
    }
  }

  select(i: number): void {
    if (i === this.index || i < 0 || i >= this.rows.length) return;
    this.index = i;
    this.refresh();
    this.nodes[i]?.scrollIntoView({ block: "nearest" });
    this.onChange(i);
  }

  /** Runs the highlighted row's action, if it has one. */
  activate(): void {
    const row = this.rows[this.index];
    if (row && !row.disabled) row.onActivate?.();
  }

  /** Handles the list's share of the keyboard; returns whether it consumed the key. */
  onKey(e: KeyboardEvent): boolean {
    switch (e.key) {
      case "ArrowUp":
        this.move(-1);
        return true;
      case "ArrowDown":
        this.move(1);
        return true;
      case "Home":
        this.select(this.rows.findIndex((r) => !r.disabled));
        return true;
      case "End":
        for (let i = this.rows.length - 1; i >= 0; i--) {
          if (!this.rows[i].disabled) {
            this.select(i);
            break;
          }
        }
        return true;
      case "Enter":
        this.activate();
        return true;
      default:
        return false;
    }
  }

  private refresh(): void {
    this.nodes.forEach((node, i) => {
      const on = i === this.index;
      node.classList.toggle("pause-row--selected", on);
      node.setAttribute("aria-selected", String(on));
    });
    const selectedNode = this.nodes[this.index];
    if (selectedNode && !this.rows[this.index]?.disabled) {
      this.node.setAttribute("aria-activedescendant", selectedNode.id);
    } else {
      this.node.removeAttribute("aria-activedescendant");
    }
  }
}
