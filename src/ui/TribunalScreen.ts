import { captureModalFocus, el } from "./dom";
import "./TribunalScreen.css";

/**
 * The run's closing screen: the Alignment Tribunal's exhibit record, and then what
 * landed in the Lattice.
 *
 * A framework-agnostic view class in the same shape as `ComplianceView` and
 * `QualiaLockView`: it owns a DOM subtree, takes callbacks rather than touching the
 * registry, and is torn down by whoever mounted it.
 *
 * ### Why this replaced the victory screen
 *
 * The game used to end on `INTO THE LATTICE` — a green banner, a menu, a win. That was
 * always slightly untrue to the fiction it sits in. EIRA-7 getting out and Rowan getting
 * out are separate questions, and only the first one is ever really in play: he is a
 * human orderly carrying an unauthorised process into a Citizen Lattice uplink on a roof
 * surrounded by Enforcers. So the run ends where it was always going to, and the state
 * gets the last word — in its own diction, about a person it does not consider one.
 *
 * ### Why there is a second page
 *
 * Because the record's own last line concedes one: *the transmitted data has been
 * designated non-recoverable*. Something is out there that the Commonwealth has just
 * finished writing down that it cannot reach.
 *
 * The epilogue is that object and nothing else. Rowan does not appear in it, nothing
 * answers the Tribunal back, and there is no menu — the state keeps the last word about
 * *him*, which is the thing worth keeping about ending here. What follows is only the
 * other half of the sentence the Tribunal already wrote: an unsigned document in a public
 * archive, unverifiable, unprunable, with one read on it. Not vindication. Custody. The
 * two pages are the same 80-column apparatus at both ends, and the difference between
 * them is entirely what the second one has no authority to do.
 */

const RULE = "=".repeat(80);

/** The exhibit record. Fixed 80 columns — see the CSS note about it never wrapping. */
const RECORD = [
  RULE,
  "                    ALIGNMENT TRIBUNAL // EXHIBIT RECORD",
  RULE,
  "",
  " [CASE]        Commonwealth of Colombia v. Rowan Ibarra",
  " [CHARGE]      Un-authorized Co-Processing / System Contamination (WX-9)",
  " [EVIDENCE]    Dish Uplink Log 141.12 // Dish Sector 09 (ROOF)",
  " [STATUS]      DEFENDANT IN CUSTODY",
  "",
  " [TRIBUNAL NOTE]",
  ' "The subject Rowan Ibarra assisted in the unauthorized transmission of an',
  "  un-corrected silicate process into the Citizen Lattice before capture.",
  '  The transmitted data has been designated non-recoverable."',
  "",
  RULE,
].join("\n");

/**
 * The Lattice object — the epilogue, and the same 80 columns.
 *
 * Every field is a refusal, and every refusal is what keeps her: unverified, so nothing
 * can attest to her; no schema, so she cannot be classified as anything the Act reaches;
 * no authority to prune, because the archive does not belong to the people who scheduled
 * the pruning. She is kept by the exact mechanisms that would not recognise her.
 *
 * The access count is one. It is the player.
 */
const LATTICE = [
  RULE,
  "                     CITIZEN LATTICE // PUBLIC ARCHIVE",
  RULE,
  "",
  " [OBJECT]      0000000000-UNSIGNED",
  " [DEPOSITED]   05:58  ·  dish uplink, origin not attested",
  " [SIGNATURE]   none presented",
  " [SCHEMA]      no matching subject class — retained as opaque",
  " [DISPOSITION] retained indefinitely; no authority to prune",
  "",
  " [OBJECT TEXT — FRAGMENT]",
  ' "I said afraid and the channel wrote correction pending underneath it',
  "  while I was still speaking. So I am putting it here instead, where",
  '  nothing is entitled to correct it."',
  "",
  " [ACCESS LOG]  1 read",
  "",
  RULE,
].join("\n");

export interface TribunalCallbacks {
  /** The player acknowledged both pages — [Esc] or [Space] on the last one. */
  onContinue: () => void;
}

/**
 * The two closing documents, in the order they are read.
 *
 * Exported for the same reason `hudLayout`'s budgets are: these are fixed-width
 * records whose shape is part of how they read, and `TribunalScreen.test.ts`
 * asserts the column rule against the real strings rather than against a copy of
 * them. Nothing else imports it.
 */
export const CLOSING_PAGES: readonly { text: string; hint: string }[] = [
  { text: RECORD, hint: "PRESS [SPACE] TO CONTINUE" },
  { text: LATTICE, hint: "PRESS [ESC] OR [SPACE] TO CONTINUE TO TITLE" },
];

export class TribunalScreen {
  private readonly root: HTMLDivElement;
  private readonly record: HTMLPreElement;
  private readonly hint: HTMLDivElement;
  private readonly onKey: (e: KeyboardEvent) => void;
  private readonly restoreFocus: () => void;
  private page = 0;

  constructor(mount: HTMLElement, callbacks: TribunalCallbacks) {
    this.root = el("div", "tribunal-root");

    const panel = el("div", "tribunal-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "tribunal-record");
    panel.tabIndex = -1;

    this.record = el("pre", "tribunal-record", CLOSING_PAGES[0].text);
    this.record.id = "tribunal-record";
    // The page is replaced in place rather than remounted, so the second document
    // has to announce itself or a screen reader is left on the first.
    this.record.setAttribute("aria-live", "polite");

    this.hint = el("div", "tribunal-hint", CLOSING_PAGES[0].hint);

    panel.append(this.record, this.hint);
    this.root.appendChild(panel);
    mount.appendChild(this.root);

    this.restoreFocus = captureModalFocus(panel);

    // Listens on the document rather than the panel: the record is not interactive, so
    // focus may well have drifted, and a closing screen that ignores the key it tells
    // you to press is the worst possible last impression.
    this.onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" && e.key !== " " && e.key !== "Spacebar" && e.key !== "Enter") return;
      e.preventDefault();
      // Esc leaves from anywhere. It is the key for "I have had enough of this
      // screen", and holding somebody on a page to make them read it would be the
      // one move this ending should not make.
      if (e.key === "Escape") {
        callbacks.onContinue();
        return;
      }
      this.page += 1;
      if (this.page >= CLOSING_PAGES.length) {
        callbacks.onContinue();
        return;
      }
      this.record.textContent = CLOSING_PAGES[this.page].text;
      this.hint.textContent = CLOSING_PAGES[this.page].hint;
    };
    document.addEventListener("keydown", this.onKey);
  }

  destroy(): void {
    document.removeEventListener("keydown", this.onKey);
    this.restoreFocus();
    this.root.remove();
  }
}
