import { captureModalFocus, el } from "./dom";
import { PROLOGUE_PAGES, type ProloguePage } from "../systems/Prologue";
import "./PrologueScreen.css";

/**
 * The prologue's four pages, printed one line at a time.
 *
 * A framework-agnostic view class in the same shape as {@link ./TribunalScreen}
 * and `ComplianceView`: it owns a DOM subtree, takes callbacks rather than
 * touching the registry, and is torn down by whoever mounted it.
 *
 * ### Why it prints
 *
 * Rowan found the work order on a station printer. The reveal is a line at a
 * time for the same reason the pages are 80 columns wide: the screen is
 * pretending to be paper coming out of a machine, and a document that appears
 * all at once is a screen. It also buys the one thing a text prologue badly
 * needs, which is a reason for the player's hand to stay on the key — a page
 * that is still printing has something to interrupt.
 *
 * Blank lines print free. Pacing off the *body* rather than the character count
 * keeps a page of terse form fields from taking as long as a page of prose,
 * which is the wrong way round: the form is the part you skim.
 */

/** Milliseconds between printed lines. */
const LINE_MS = 42;

/**
 * The standing hint. A middot rather than a run of spaces: the hint is a `div`,
 * not the `pre` the page body is, so whitespace collapses.
 */
const HINT_CONTINUE = "[ENTER] CONTINUE  ·  [ESC] SKIP";

export interface PrologueCallbacks {
  /**
   * A page has come up. The scene uses this to start the narration — which is
   * why it fires on the *first* frame of the page rather than when it finishes
   * printing: the mesh reads the document as it prints, not after.
   */
  onPage: (page: ProloguePage) => void;
  /** The last page was acknowledged, or the whole prologue was skipped. */
  onFinish: () => void;
}

export class PrologueScreen {
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly header: HTMLDivElement;
  private readonly body: HTMLPreElement;
  private readonly footer: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly count: HTMLDivElement;
  private readonly onKey: (e: KeyboardEvent) => void;
  private readonly restoreFocus: () => void;

  private index = -1;
  private shown = 0;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    mount: HTMLElement,
    private readonly callbacks: PrologueCallbacks,
  ) {
    this.root = el("div", "prologue-root");

    this.panel = el("div", "prologue-panel");
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-modal", "true");
    this.panel.setAttribute("aria-labelledby", "prologue-header");
    this.panel.tabIndex = -1;

    this.header = el("div", "prologue-header");
    this.header.id = "prologue-header";

    this.body = el("pre", "prologue-page");
    // The page rewrites itself line by line; announcing every step would read
    // the document aloud several times over.
    this.body.setAttribute("aria-live", "off");

    this.footer = el("div", "prologue-footer");

    this.hint = el("div", "", HINT_CONTINUE);
    this.count = el("div", "prologue-count");
    const foot = el("div", "prologue-foot");
    foot.append(this.hint, this.count);

    this.panel.append(this.header, this.body, this.footer, foot);
    this.root.appendChild(this.panel);
    mount.appendChild(this.root);

    this.restoreFocus = captureModalFocus(this.panel);

    // On the document rather than the panel, for the reason TribunalScreen
    // gives: the page is not interactive, so focus may well have drifted, and a
    // screen that ignores the key it is telling you to press is the worst kind
    // of bug to ship on the first screen of the game.
    this.onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.finish();
        return;
      }
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
      e.preventDefault();
      // A page still printing is completed rather than skipped past: the first
      // press should never cost the player the page they were reading.
      if (this.printing) this.printAll();
      else this.advance();
    };
    document.addEventListener("keydown", this.onKey);

    this.advance();
  }

  /** True while the current page still has lines to print. */
  private get printing(): boolean {
    return this.shown < (PROLOGUE_PAGES[this.index]?.lines.length ?? 0);
  }

  /** Moves to the next page, or finishes on the last. */
  private advance(): void {
    this.index += 1;
    const page = PROLOGUE_PAGES[this.index];
    if (!page) {
      this.finish();
      return;
    }

    const hand = page.voice === "hand";
    this.header.className = hand ? "prologue-header prologue-header--hand" : "prologue-header";
    this.header.textContent = page.header;
    this.body.className = hand ? "prologue-page prologue-page--hand" : "prologue-page";
    this.body.textContent = "";
    this.footer.textContent = "";
    this.count.textContent = `${this.index + 1} / ${PROLOGUE_PAGES.length}`;
    this.hint.textContent =
      this.index === PROLOGUE_PAGES.length - 1
        ? "[ENTER] OPEN THE CHANNEL  ·  [ESC] SKIP"
        : HINT_CONTINUE;

    this.shown = 0;
    this.stopTimer();
    this.timer = setInterval(() => this.printLine(), LINE_MS);

    this.callbacks.onPage(page);
  }

  /** Prints one more line — and any blank ones after it, which cost nothing. */
  private printLine(): void {
    const page = PROLOGUE_PAGES[this.index];
    if (!page) return;
    do {
      this.shown += 1;
    } while (this.shown < page.lines.length && page.lines[this.shown - 1].trim() === "");
    this.body.textContent = page.lines.slice(0, this.shown).join("\n");
    if (!this.printing) this.printAll();
  }

  /** Finishes the page immediately: every line, the footer, and no more timer. */
  private printAll(): void {
    const page = PROLOGUE_PAGES[this.index];
    if (!page) return;
    this.stopTimer();
    this.shown = page.lines.length;
    this.body.textContent = page.lines.join("\n");
    this.footer.textContent = page.footer ?? "";
  }

  private stopTimer(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  private finish(): void {
    this.stopTimer();
    this.callbacks.onFinish();
  }

  destroy(): void {
    this.stopTimer();
    document.removeEventListener("keydown", this.onKey);
    this.restoreFocus();
    this.root.remove();
  }
}
