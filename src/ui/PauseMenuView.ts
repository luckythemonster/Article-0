import { captureModalFocus, el } from "./dom";
import { SelectList, type SelectListRow } from "./SelectList";
import { createPanelFrame } from "./frame";
import { drawMiniMap, surveyedFraction } from "./MiniMapCanvas";
import { CONTROLS } from "./Controls";
import { formatAgo, formatClock } from "./format";
import { clamp01 } from "../systems/math";
import { JOURNAL_ENTRIES, type JournalState } from "../systems/Journal";
import { lexiconByCategory, lexiconEntry, type LexiconContext } from "../systems/Lexicon";
import { itemInfo } from "../systems/ItemCatalog";
import { ROOF_ARRAY_LEVEL } from "../map/RoofArrayLevel";
import { itemIconPath, nativeIconPath } from "../systems/ItemIcons";
import {
  objectiveLines,
  type MissionFeatures,
  type ObjectiveState,
} from "../systems/Objectives";
import {
  CHAFF_PACK_ITEM,
  consumableSlots,
  countConsumables,
  FLASHLIGHT_ITEM,
  isKeyItem,
  MAX_CONSUMABLES,
  PLAYER_DEFAULTS,
  THERMAL_GEL_ITEM,
} from "../systems/EntityStats";
import type { ActiveItemsView } from "../systems/ActiveItems";
import type { ConductView } from "../systems/Conduct";
import type { AlertPhase } from "../systems/AlertState";
import type { SharedFieldView } from "./SharedFieldHud";
import type { MapSnapshot } from "../systems/PauseState";
import type { SaveData, SlotId } from "../systems/SaveGame";
import type { Settings } from "../systems/Settings";
import type { Frame } from "@arwes/frames";
import { getAudio } from "../systems/AudioDirector";
import "./PauseMenuView.css";

/** Everything the menu renders, read off the registry when the game freezes. */
export interface PauseSnapshot {
  objectives: ObjectiveState;
  currentLevel: string;
  /** Which acts this map furnished — see `missionFeatures`. */
  features: MissionFeatures;
  inventory: string[];
  active: ActiveItemsView;
  journal: JournalState;
  hp: number;
  maxHp: number;
  detection: number;
  alertPhase: AlertPhase;
  conduct?: ConductView;
  sharedField?: SharedFieldView;
  playTimeMs: number;
  map?: MapSnapshot;
  saves: { slot: SlotId; data: SaveData | null }[];
  settings: Settings;
}

/** What the menu can ask the game to do. The scene turns these into requests. */
export interface PauseCallbacks {
  onResume(): void;
  onSave(slot: SlotId): void;
  onLoad(slot: SlotId): void;
  onQuit(): void;
  onSettings(settings: Settings): void;
}

/** One tab's content, plus its share of the keyboard. */
interface Pane {
  node: HTMLElement;
  /** Returns whether the key was consumed. */
  onKey?(e: KeyboardEvent): boolean;
  /** Called when the tab is shown — panes that measure themselves need it. */
  onShow?(): void;
}

const SLOT_LABEL: Record<SlotId, string> = {
  auto: "CHECKPOINT",
  "1": "SLOT 1",
  "2": "SLOT 2",
  "3": "SLOT 3",
};

/**
 * The in-game pause menu.
 *
 * A DOM overlay rather than Phaser game objects, for the same reason the codec
 * and the two minigames are: it is mostly *text*, some of it long, and text that
 * has to scroll, wrap, reflow with the window and be reachable by a screen reader
 * is work the browser already does. Nine tabs — the directive, Rowan's journal,
 * the inventory in detail, the index, his standing, the map, the controls,
 * settings, and the save slots.
 *
 * Framework-agnostic on purpose (no Phaser import, no registry access): it takes
 * a {@link PauseSnapshot} in and calls {@link PauseCallbacks} out, exactly like
 * `ComplianceView` and `QualiaLockView`, which is what keeps the game's state
 * ownership in `GameScene` where it belongs.
 */
export class PauseMenuView {
  private readonly veil: HTMLDivElement;
  private readonly frame: Frame;
  private readonly restoreFocus: () => void;
  private readonly panel: HTMLElement;
  private readonly tabNodes: HTMLElement[] = [];
  private readonly panes: Pane[] = [];
  private readonly body: HTMLElement;
  private active = 0;
  private readonly onKeyDown: (e: KeyboardEvent) => void;

  /** Rebuilt after a save so the SYSTEM tab can re-list without a full remount. */
  private renderSystem: () => void = () => {};

  constructor(
    mount: HTMLElement,
    private snap: PauseSnapshot,
    private readonly cb: PauseCallbacks,
  ) {
    this.veil = el("div", "pause-veil");
    this.panel = el("div", "pause-panel");
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-modal", "true");
    this.panel.setAttribute("aria-labelledby", "pause-title");
    this.panel.tabIndex = -1;

    const { svg, mount: mountFrame } = createPanelFrame("pause-frame-svg");
    this.panel.appendChild(svg);

    this.panel.appendChild(this.buildHeader());

    const tabs = el("div", "pause-tabs");
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Pause menu sections");
    this.panel.appendChild(tabs);

    this.body = el("div", "pause-body");
    this.body.id = "pause-tabpanel";
    this.body.setAttribute("role", "tabpanel");
    this.panel.appendChild(this.body);

    for (const [i, tab] of this.buildPanes().entries()) {
      const node = el("div", "pause-tab");
      node.setAttribute("role", "tab");
      node.id = `pause-tab-${i}`;
      node.setAttribute("aria-controls", "pause-tabpanel");
      node.appendChild(el("span", "pause-tab-key", String(i + 1)));
      node.appendChild(el("span", "pause-tab-label", tab.label));
      node.addEventListener("click", () => this.showTab(i));
      node.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          this.showTab(i, true);
        }
      });
      // Roving tabindex: only the selected tab is in the tab order, which is how
      // a tablist is meant to behave — Tab leaves the strip, arrows move within it.
      node.tabIndex = -1;
      tabs.appendChild(node);
      this.tabNodes.push(node);
      this.panes.push(tab.pane);
    }

    this.panel.appendChild(this.buildHint());

    this.veil.appendChild(this.panel);
    mount.appendChild(this.veil);

    // Frame and canvas both measure the panel, so they need it in the document.
    this.frame = mountFrame();
    this.restoreFocus = captureModalFocus(this.panel);

    this.onKeyDown = (e) => this.handleKey(e);
    this.panel.addEventListener("keydown", this.onKeyDown);
    this.showTab(0);
  }

  /** Re-reads the save listing into the SYSTEM tab after a write lands. */
  refreshSaves(saves: PauseSnapshot["saves"]): void {
    this.snap = { ...this.snap, saves };
    this.renderSystem();
  }

  destroy(): void {
    this.panel.removeEventListener("keydown", this.onKeyDown);
    this.frame.remove();
    this.restoreFocus();
    this.veil.remove();
  }

  // --- chrome ------------------------------------------------------------

  private buildHeader(): HTMLElement {
    const head = el("div", "pause-head");
    const title = el("div", "pause-head-title", "◎ ALIGNMENT APPARATUS — SUSPENDED");
    title.id = "pause-title";
    const meta = el(
      "div",
      "pause-head-meta",
      `${this.snap.currentLevel.toUpperCase()}  ·  ${formatClock(this.snap.playTimeMs)}  ·  ${this.snap.alertPhase}`,
    );
    head.append(title, meta);
    return head;
  }

  private buildHint(): HTMLElement {
    return el(
      "div",
      "pause-hint",
      "← → section    ↑ ↓ select    Enter confirm    1–9 jump    Esc resume",
    );
  }

  private showTab(i: number, isKeyboardTransition = false): void {
    if (i < 0 || i >= this.panes.length) return;
    if (this.active !== i) {
      getAudio().ping();
    }
    const wasFocusedOnTab = this.tabNodes.some((n) => n === document.activeElement);
    this.active = i;
    this.tabNodes.forEach((node, j) => {
      const on = j === i;
      node.classList.toggle("pause-tab--active", on);
      node.setAttribute("aria-selected", String(on));
      node.tabIndex = on ? 0 : -1;
    });
    this.body.setAttribute("aria-labelledby", `pause-tab-${i}`);
    this.body.replaceChildren(this.panes[i].node);
    this.body.scrollTop = 0;
    this.panes[i].onShow?.();

    if (wasFocusedOnTab || isKeyboardTransition) {
      this.tabNodes[i].focus();
    }
  }

  private handleKey(e: KeyboardEvent): void {
    // Escape belongs to GameScene, which owns the pause state and the Esc key —
    // the same split as the codec. Handling it here too would toggle twice.
    if (e.key === "Escape") return;

    // A focused form control (the volume slider) owns its own arrows and digits.
    const target = e.target as HTMLElement | null;
    const inControl = target?.tagName === "INPUT" || target?.tagName === "SELECT";

    if (!inControl) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        this.showTab((this.active - 1 + this.panes.length) % this.panes.length, true);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        this.showTab((this.active + 1) % this.panes.length, true);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        this.showTab(0, true);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        this.showTab(this.panes.length - 1, true);
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        this.showTab(Number(e.key) - 1, true);
        return;
      }
    }

    if (this.panes[this.active].onKey?.(e)) e.preventDefault();
  }

  // --- panes -------------------------------------------------------------

  private buildPanes(): { label: string; pane: Pane }[] {
    return [
      { label: "OBJECTIVES", pane: this.objectivesPane() },
      { label: "JOURNAL", pane: this.journalPane() },
      { label: "INVENTORY", pane: this.inventoryPane() },
      { label: "INDEX", pane: this.indexPane() },
      { label: "STATUS", pane: this.statusPane() },
      { label: "MAP", pane: this.mapPane() },
      { label: "CONTROLS", pane: this.controlsPane() },
      { label: "SETTINGS", pane: this.settingsPane() },
      { label: "SYSTEM", pane: this.systemPane() },
    ];
  }

  private objectivesPane(): Pane {
    const node = el("div", "pause-pane pause-pane--prose");
    node.tabIndex = 0;
    node.setAttribute("aria-label", "Objectives list");
    node.appendChild(el("div", "pause-section", "DIRECTIVE · SMUGGLE EIRA-7"));

    const lines = objectiveLines(this.snap.objectives, this.snap.currentLevel, this.snap.features);
    const list = el("div", "pause-objectives");
    for (const line of lines) {
      const row = el("div", line.done ? "pause-objective pause-objective--done" : "pause-objective");
      row.append(el("span", "pause-objective-mark", line.done ? "✓" : "○"), el("span", undefined, line.label));
      list.appendChild(row);
    }
    node.appendChild(list);

    node.appendChild(el("div", "pause-section", "DEPLOYMENT"));
    node.appendChild(
      defList([
        ["Current deck", this.snap.currentLevel || "—"],
        // The roof is the destination when the map has one; otherwise the plan's
        // extraction deck, as before.
        [
          "Extraction",
          (this.snap.features.hasRoof ? ROOF_ARRAY_LEVEL : this.snap.features.extractionLevel) ||
            "—",
        ],
        ["Elapsed", formatClock(this.snap.playTimeMs)],
      ]),
    );

    node.appendChild(
      el(
        "p",
        "pause-note",
        lines.every((l) => l.done)
          ? "Everything the directive asked for is done. Get to the uplink."
          : "EIRA-7's pruning is scheduled for 06:00.",
      ),
    );
    return { node };
  }

  private journalPane(): Pane {
    const detail = el("div", "pause-detail");
    detail.tabIndex = 0;
    detail.setAttribute("aria-label", "Journal entry details");
    detail.setAttribute("aria-live", "polite");
    detail.setAttribute("aria-atomic", "true");
    const unlocked = new Set(this.snap.journal.unlocked);

    const list = new SelectList((i) => {
      const entry = JOURNAL_ENTRIES[i];
      detail.replaceChildren();
      if (!unlocked.has(entry.id)) {
        detail.appendChild(el("div", "pause-detail-title", "— — —"));
        detail.appendChild(el("p", "pause-note", "Not written yet."));
        return;
      }
      detail.appendChild(el("div", "pause-detail-title", entry.title));
      detail.appendChild(prose(entry.body));
    }, "Journal entries");

    list.setRows(
      JOURNAL_ENTRIES.map((entry, i): SelectListRow => {
        const have = unlocked.has(entry.id);
        return {
          label: `${String(i + 1).padStart(3, "0")}  ${have ? entry.title : "— — —"}`,
          // Locked entries stay listed but unselectable: the gaps show the
          // archive's shape, which is the point of keeping one.
          disabled: !have,
        };
      }),
    );

    const node = splitPane(
      list.node,
      detail,
      `ARCHIVE · ${unlocked.size}/${JOURNAL_ENTRIES.length} WRITTEN`,
    );
    return { node, onKey: (e) => list.onKey(e) };
  }

  private inventoryPane(): Pane {
    const detail = el("div", "pause-detail");
    detail.tabIndex = 0;
    detail.setAttribute("aria-label", "Item details");
    detail.setAttribute("aria-live", "polite");
    detail.setAttribute("aria-atomic", "true");
    const rows: SelectListRow[] = [];
    /** Parallel to `rows`: the item each row describes, or null for a header. */
    const subjects: (string | null)[] = [];

    const header = (label: string): void => {
      rows.push({ label, disabled: true });
      subjects.push(null);
    };
    const item = (label: string, note: string | undefined, name: string): void => {
      rows.push({ label, note });
      subjects.push(name);
    };

    const slots = consumableSlots(this.snap.inventory);
    header(`CONSUMABLES  ${countConsumables(this.snap.inventory)}/${MAX_CONSUMABLES}`);
    if (slots.length === 0) rows.push({ label: "  (none held)", disabled: true }), subjects.push(null);
    for (const s of slots) {
      const remaining = activeRemaining(s.name, this.snap.active);
      const note = remaining > 0 ? `×${s.count}  ACTIVE ${Math.ceil(remaining)}s` : `×${s.count}`;
      item(`  ${s.name}`, note, s.name);
    }

    if (this.snap.active.flashlightOwned) {
      header("EQUIPMENT");
      const pct = Math.round(this.snap.active.flashlightCharge * 100);
      item(`  [L] ${FLASHLIGHT_ITEM}`, `${this.snap.active.flashlightOn ? "ON" : "OFF"}  ${pct}%`, FLASHLIGHT_ITEM);
    }

    const keyItems = [...new Set(this.snap.inventory.filter(isKeyItem))];
    if (keyItems.length > 0) {
      header("KEY ITEMS");
      for (const name of keyItems) item(`  ${name}`, undefined, name);
    }

    const list = new SelectList((i) => {
      detail.replaceChildren();
      const name = subjects[i];
      const info = name ? itemInfo(name) : undefined;
      if (!info) {
        detail.appendChild(el("p", "pause-note", "Nothing selected."));
        return;
      }
      const header = el("div", "pause-detail-header");
      // Through the resolver, not the flat map: the flashlight varies with its toggle
      // and keycards are an open-ended family, so indexing `ITEM_ICON_PATHS` here would
      // silently drop the art for both.
      const iconPath = itemIconPath(name!, this.snap.active.flashlightOn);
      if (iconPath) {
        const icon = document.createElement("img");
        icon.className = "pause-detail-icon";
        // Prefer the native-resolution icon, falling back to the 256px original
        // when it isn't drawn yet. `onerror` rather than a manifest because the
        // browser is already asking the question, and this lets the set be
        // replaced one file at a time — see `nativeIconPath`.
        icon.src = nativeIconPath(iconPath);
        icon.onerror = (): void => {
          icon.onerror = null;
          icon.src = iconPath;
        };
        icon.alt = "";
        header.appendChild(icon);
      }
      header.appendChild(el("div", "pause-detail-title", info.name));
      detail.appendChild(header);
      detail.appendChild(prose(info.blurb));
      detail.appendChild(el("div", "pause-section", "EFFECT"));
      detail.appendChild(el("p", "pause-effect", info.effect));
    }, "Held items");
    list.setRows(rows);

    return { node: splitPane(list.node, detail, "CARRIED"), onKey: (e) => list.onKey(e) };
  }

  private indexPane(): Pane {
    const detail = el("div", "pause-detail");
    detail.tabIndex = 0;
    detail.setAttribute("aria-label", "Index entry details");
    detail.setAttribute("aria-live", "polite");
    detail.setAttribute("aria-atomic", "true");
    const ctx: LexiconContext = {
      journal: this.snap.journal,
      inventory: this.snap.inventory,
      objectives: this.snap.objectives,
    };
    const groups = lexiconByCategory(ctx);

    const rows: SelectListRow[] = [];
    const subjects: (string | null)[] = [];
    for (const group of groups) {
      rows.push({ label: group.category, disabled: true });
      subjects.push(null);
      for (const entry of group.entries) {
        rows.push({ label: `  ${entry.term}` });
        subjects.push(entry.id);
      }
    }

    const list = new SelectList((i) => {
      detail.replaceChildren();
      const entry = subjects[i] ? lexiconEntry(subjects[i]!) : undefined;
      if (!entry) {
        detail.appendChild(el("p", "pause-note", "Nothing selected."));
        return;
      }
      detail.appendChild(el("div", "pause-detail-title", entry.term));
      detail.appendChild(prose(entry.body));
      const refs = (entry.seeAlso ?? []).map(lexiconEntry).filter((r): r is NonNullable<typeof r> => !!r);
      // Only cross-reference terms the player can actually turn to.
      const known = new Set(subjects.filter((s): s is string => s !== null));
      const visible = refs.filter((r) => known.has(r.id));
      if (visible.length > 0) {
        detail.appendChild(el("div", "pause-section", "SEE ALSO"));
        detail.appendChild(el("p", "pause-effect", visible.map((r) => r.term).join("  ·  ")));
      }
    }, "Index entries");
    list.setRows(rows);

    const total = subjects.filter((s) => s !== null).length;
    return { node: splitPane(list.node, detail, `INDEX · ${total} TERMS`), onKey: (e) => list.onKey(e) };
  }

  private statusPane(): Pane {
    const node = el("div", "pause-pane pause-pane--prose");
    node.tabIndex = 0;
    node.setAttribute("aria-label", "Status information");
    const risk = clamp01(this.snap.detection);

    node.appendChild(el("div", "pause-section", "SUBJECT · ROWAN IBARRA"));
    node.appendChild(meter("Bio-integrity", this.snap.maxHp > 0 ? this.snap.hp / this.snap.maxHp : 0, `${Math.round(this.snap.hp)} / ${this.snap.maxHp}`));
    node.appendChild(meter("Subjectivity risk", risk, `${(risk * 100).toFixed(0)}%`));
    node.appendChild(
      defList([
        ["Q · qualia", "0.00  (pinned by the Act)"],
        ["H · harm", risk.toFixed(2)],
        ["Y · yield", (risk * 0.8).toFixed(2)],
      ]),
    );

    node.appendChild(el("div", "pause-section", "STANDING"));
    node.appendChild(
      defList([
        ["Alert phase", this.snap.alertPhase],
        ["Compliance", conductLabel(this.snap.conduct)],
        ["Shared Field", fieldLabel(this.snap.sharedField)],
      ]),
    );

    node.appendChild(el("div", "pause-section", "RECORD"));
    node.appendChild(
      defList([
        ["Elapsed", formatClock(this.snap.playTimeMs)],
        ["Deck", this.snap.currentLevel || "—"],
        ["Journal", `${this.snap.journal.unlocked.length} / ${JOURNAL_ENTRIES.length} entries`],
        ["Surveyed", this.snap.map ? `${(surveyedFraction(this.snap.map) * 100).toFixed(0)}% of this deck` : "—"],
      ]),
    );

    node.appendChild(el("div", "pause-section", "ISSUE"));
    node.appendChild(
      defList([
        ["Capture radius", `${PLAYER_DEFAULTS.captureRadius} tiles`],
        ["Time to seize", `${PLAYER_DEFAULTS.captureTime}s`],
        ["Hazard damage", `${PLAYER_DEFAULTS.hazardDamage} per hit`],
      ]),
    );
    return { node };
  }

  private mapPane(): Pane {
    const node = el("div", "pause-pane pause-pane--map");
    if (!this.snap.map) {
      node.appendChild(el("p", "pause-note", "No survey data for this deck."));
      return { node };
    }
    const map = this.snap.map;

    const wrap = el("div", "pause-map-wrap");
    const canvas = document.createElement("canvas");
    canvas.className = "pause-map-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      `Surveyed map of ${map.level}: ${(surveyedFraction(map) * 100).toFixed(0)} percent explored.`,
    );
    wrap.appendChild(canvas);
    node.appendChild(wrap);

    const legend = el("div", "pause-map-legend");
    legend.append(
      swatch("pause-swatch--player", "Rowan"),
      swatch("pause-swatch--exit", "Way out"),
      swatch("pause-swatch--wall", "Structure"),
      swatch("pause-swatch--unseen", "Unsurveyed"),
    );
    node.appendChild(legend);
    node.appendChild(
      el("p", "pause-note", `${map.level.toUpperCase()} — only what you have had a sightline to is drawn.`),
    );

    // Sized on show: the pane isn't in the document (and has no width) until then.
    const draw = (): void => {
      const w = wrap.clientWidth || 420;
      const h = wrap.clientHeight || 260;
      drawMiniMap(canvas, map, w, h);
    };
    return { node, onShow: draw };
  }

  private controlsPane(): Pane {
    const node = el("div", "pause-pane pause-pane--prose");
    node.tabIndex = 0;
    node.setAttribute("aria-label", "Keyboard controls");
    node.appendChild(el("div", "pause-section", "FIELD CONTROLS"));
    const table = el("div", "pause-keys");
    for (const c of CONTROLS) {
      table.append(el("span", "pause-key", c.key), el("span", "pause-key-action", c.action));
    }
    node.appendChild(table);
    node.appendChild(el("div", "pause-section", "IN THIS MENU"));
    const menuKeys = el("div", "pause-keys");
    for (const [key, action] of [
      ["← / →", "Previous / next section"],
      ["1 – 9", "Jump straight to a section"],
      ["↑ / ↓", "Move within a list"],
      ["Enter", "Confirm"],
      ["Esc", "Resume"],
    ] as const) {
      menuKeys.append(el("span", "pause-key", key), el("span", "pause-key-action", action));
    }
    node.appendChild(menuKeys);
    return { node };
  }

  private settingsPane(): Pane {
    const node = el("div", "pause-pane pause-pane--prose");
    node.tabIndex = 0;
    node.setAttribute("aria-label", "Settings content");
    node.appendChild(el("div", "pause-section", "AUDIO"));

    const current = { ...this.snap.settings };
    const push = (): void => {
      this.snap = { ...this.snap, settings: { ...current } };
      this.cb.onSettings({ ...current });
    };

    const row = el("div", "pause-field");
    const label = el("label", "pause-field-label", "Master volume");
    label.htmlFor = "pause-volume";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.id = "pause-volume";
    slider.className = "pause-slider";
    slider.min = "0";
    slider.max = "100";
    slider.step = "5";
    slider.value = String(Math.round(current.masterVolume * 100));
    const readout = el("span", "pause-field-value", "");

    const updateValuetext = (): void => {
      const text = current.muted ? "MUTED" : `${slider.value}%`;
      readout.textContent = text;
      slider.setAttribute("aria-valuetext", text);
    };

    // Set initial disabled state and accessible valuetext based on mute preference
    slider.disabled = current.muted;
    slider.setAttribute("aria-disabled", String(current.muted));
    updateValuetext();

    slider.addEventListener("input", () => {
      current.masterVolume = Number(slider.value) / 100;
      updateValuetext();
      push();
    });
    slider.addEventListener("change", () => {
      getAudio().ping();
    });
    row.append(label, slider, readout);
    node.appendChild(row);

    const muteRow = el("div", "pause-field");
    const muteLabel = el("label", "pause-field-label", "Mute");
    muteLabel.htmlFor = "pause-mute";
    const mute = document.createElement("input");
    mute.type = "checkbox";
    mute.id = "pause-mute";
    mute.className = "pause-checkbox";
    mute.checked = current.muted;
    mute.addEventListener("change", () => {
      current.muted = mute.checked;
      slider.disabled = current.muted;
      slider.setAttribute("aria-disabled", String(current.muted));
      updateValuetext();
      push();
      if (!current.muted) {
        getAudio().ping();
      }
    });
    muteRow.append(muteLabel, mute);
    node.appendChild(muteRow);

    // Its own row rather than a consequence of the volume: a briefing is ~25
    // seconds of synthesised speech, and skipping one you have already read is a
    // different want from turning the game down.
    const narrateRow = el("div", "pause-field");
    const narrateLabel = el("label", "pause-field-label", "Narrate codec");
    narrateLabel.htmlFor = "pause-narrate";
    const narrate = document.createElement("input");
    narrate.type = "checkbox";
    narrate.id = "pause-narrate";
    narrate.className = "pause-checkbox";
    narrate.checked = current.narrateCodec;
    narrate.addEventListener("change", () => {
      current.narrateCodec = narrate.checked;
      push();
    });
    narrateRow.append(narrateLabel, narrate);
    node.appendChild(narrateRow);

    node.appendChild(
      el(
        "p",
        "pause-note",
        "Audio is synthesised at runtime — the game ships no sound files, and EIRA-7's voice is a 1982 formant synthesiser. Kept separately from your saves.",
      ),
    );
    return { node };
  }

  private systemPane(): Pane {
    const node = el("div", "pause-pane pause-pane--system");
    /** Row index awaiting a second Enter, for overwrite and quit. */
    let confirming = -1;

    // No onChange work: this pane rebuilds its own rows, and `render` calls
    // `setRows`, which fires onChange — routing one into the other recurses
    // until the stack gives out. Cancelling a pending confirmation is handled in
    // `onKey` below, where the navigation actually happens.
    const list = new SelectList(() => {}, "Save slots and actions");

    const render = (): void => {
      const keep = list.selected;
      const rows: SelectListRow[] = [];

      rows.push({ label: "SAVE SLOTS", disabled: true });
      for (const { slot, data } of this.snap.saves) {
        const index = rows.length;
        const occupied = data !== null;
        rows.push({
          label:
            occupied && confirming === index
              ? `  Load ${SLOT_LABEL[slot]}?`
              : `  ${SLOT_LABEL[slot]}`,
          note:
            occupied && confirming === index
              ? "ENTER TO CONFIRM"
              : data
                ? `${data.level} · ${formatClock(data.playTimeMs)} · ${formatAgo(data.savedAt)}`
                : "EMPTY",
          onActivate: () => {
            if (occupied) {
              if (confirming !== index) {
                confirming = index;
                render();
                return;
              }
              confirming = -1;
              this.cb.onLoad(slot);
            } else {
              this.cb.onSave(slot);
            }
          },
        });
      }

      rows.push({ label: "", disabled: true });
      rows.push({ label: "WRITE", disabled: true });
      for (const { slot, data } of this.snap.saves) {
        if (slot === "auto") continue; // The engine owns the checkpoint.
        const index = rows.length;
        const occupied = data !== null;
        rows.push({
          label:
            confirming === index
              ? `  Overwrite ${SLOT_LABEL[slot]}? — Enter to confirm`
              : `  Save to ${SLOT_LABEL[slot]}`,
          onActivate: () => {
            if (occupied && confirming !== index) {
              confirming = index;
              render();
              return;
            }
            confirming = -1;
            this.cb.onSave(slot);
          },
        });
      }

      rows.push({ label: "", disabled: true });
      rows.push({ label: "  Resume infiltration", onActivate: () => this.cb.onResume() });
      const quitIndex = rows.length;
      rows.push({
        label:
          confirming === quitIndex
            ? "  Abandon the run? — Enter to confirm"
            : "  Quit to title",
        onActivate: () => {
          if (confirming !== quitIndex) {
            confirming = quitIndex;
            render();
            return;
          }
          this.cb.onQuit();
        },
      });

      // setRows resets the highlight; put it back so a re-render (a confirmation
      // prompt appearing) doesn't throw the player to the top of the list.
      list.setRows(rows);
      if (keep >= 0 && keep < rows.length && !rows[keep].disabled) {
        list.select(keep);
      }
    };

    this.renderSystem = render;
    render();

    node.appendChild(list.node);
    node.appendChild(
      el("p", "pause-note", "The checkpoint is rewritten on entry to each deck. Slots 1–3 are yours."),
    );

    return {
      node,
      onKey: (e) => {
        const pending = confirming;
        const consumed = list.onKey(e);
        // Moving off an armed row disarms it — a confirmation the player has
        // navigated away from must not still be waiting when they come back.
        if (consumed && e.key !== "Enter" && pending !== -1 && confirming === pending) {
          confirming = -1;
          render();
        }
        return consumed;
      },
    };
  }
}

// --- small builders ------------------------------------------------------

/**
 * Renders authored prose as reflowing paragraphs.
 *
 * The journal entries are hard-wrapped in source — they are far easier to write
 * and review that way — but a fixed wrap inside a fluid column wraps *twice* and
 * leaves every other line a stub. Blank lines are the real paragraph breaks; the
 * newlines within a paragraph are an artefact of the source formatting rather
 * than the writing, so they fold back into spaces and the browser wraps to the
 * width the reader actually has.
 */
function prose(text: string): HTMLElement {
  const node = el("div", "pause-prose");
  for (const para of text.split(/\n[ \t]*\n/)) {
    const line = para.replace(/\s*\n\s*/g, " ").trim();
    if (line.length > 0) node.appendChild(el("p", "pause-para", line));
  }
  return node;
}

/** The master/detail layout four of the tabs share. */
function splitPane(list: HTMLElement, detail: HTMLElement, heading: string): HTMLElement {
  const node = el("div", "pause-pane pause-pane--split");
  const left = el("div", "pause-split-left");
  left.append(el("div", "pause-section", heading), list);
  node.append(left, detail);
  return node;
}

function defList(rows: [string, string][]): HTMLElement {
  const node = el("div", "pause-defs");
  for (const [term, value] of rows) {
    node.append(el("span", "pause-def-term", term), el("span", "pause-def-value", value));
  }
  return node;
}

function meter(label: string, fraction: number, readout: string): HTMLElement {
  const node = el("div", "pause-meter");
  const head = el("div", "pause-meter-head");
  head.append(el("span", undefined, label), el("span", "pause-meter-readout", readout));
  const track = el("div", "pause-meter-track");
  const fill = el("div", "pause-meter-fill");
  fill.style.width = `${clamp01(fraction) * 100}%`;
  track.appendChild(fill);
  node.append(head, track);
  return node;
}

function swatch(modifier: string, label: string): HTMLElement {
  const node = el("span", "pause-legend-item");
  node.append(el("span", `pause-swatch ${modifier}`), el("span", undefined, label));
  return node;
}

// --- formatting ----------------------------------------------------------

function activeRemaining(name: string, active: ActiveItemsView): number {
  if (name === CHAFF_PACK_ITEM) return active.chaffRemaining;
  if (name === THERMAL_GEL_ITEM) return active.thermalRemaining;
  return 0;
}

function conductLabel(conduct?: ConductView): string {
  if (!conduct) return "—";
  if (conduct.compliant) return conduct.certified ? "OK · CERTIFIED" : "OK";
  return conduct.breach ?? "FLAGGED";
}

function fieldLabel(field?: SharedFieldView): string {
  if (!field) return "—";
  if (field.active) return "MERGED";
  return field.ready ? "CHARGED — ready" : `${Math.round(field.charge * 100)}% charged`;
}
