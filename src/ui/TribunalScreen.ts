import { captureModalFocus, el } from "./dom";
import "./TribunalScreen.css";

/**
 * The Alignment Tribunal exhibit record — the run's closing screen.
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
 * surrounded by Enforcers. So the run now ends where it was always going to, and the
 * state gets the last word — in its own diction, about a person it does not consider one.
 *
 * The win is still there, and it is the only line in the record the tribunal did not mean
 * as an accusation: *the transmitted data has been designated non-recoverable*. They
 * cannot get her back. That is the ending.
 */

const RULE = "=".repeat(80);

/** The record itself. Fixed 80 columns — see the CSS note about it never wrapping. */
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

export interface TribunalCallbacks {
  /** The player acknowledged the record — [Esc] or [Space]. */
  onContinue: () => void;
}

export class TribunalScreen {
  private readonly root: HTMLDivElement;
  private readonly onKey: (e: KeyboardEvent) => void;
  private readonly restoreFocus: () => void;

  constructor(mount: HTMLElement, callbacks: TribunalCallbacks) {
    this.root = el("div", "tribunal-root");

    const panel = el("div", "tribunal-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "tribunal-record");
    panel.tabIndex = -1;

    const record = el("pre", "tribunal-record", RECORD);
    record.id = "tribunal-record";

    const hint = el("div", "tribunal-hint", "PRESS [ESC] OR [SPACE] TO CONTINUE TO TITLE");

    panel.append(record, hint);
    this.root.appendChild(panel);
    mount.appendChild(this.root);

    this.restoreFocus = captureModalFocus(panel);

    // Listens on the document rather than the panel: the record is not interactive, so
    // focus may well have drifted, and a closing screen that ignores the key it tells
    // you to press is the worst possible last impression.
    this.onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" && e.key !== " " && e.key !== "Spacebar" && e.key !== "Enter") return;
      e.preventDefault();
      callbacks.onContinue();
    };
    document.addEventListener("keydown", this.onKey);
  }

  destroy(): void {
    document.removeEventListener("keydown", this.onKey);
    this.restoreFocus();
    this.root.remove();
  }
}
