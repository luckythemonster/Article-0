/**
 * The Doctrinal Compliance minigame's interactive view — a self-contained,
 * framework-agnostic DOM controller (no Phaser, no registry) so the exact same
 * widget drives the in-game {@link ComplianceScene} overlay and the standalone
 * demo page.
 *
 * Interaction is click-to-apply: click a flagged `[Q>0]` term to select it, then
 * click a `[CORRECTION]` block to rewrite it; click a corrected term to revert.
 * A live status bar reflects the Q0 compliance verdict after every change, and
 * TRANSMIT unlocks once every flagged term is corrected — regardless of whether
 * the hidden override payload survived. Which correction actually carries the
 * payload is never shown; TRANSMIT requires a second press to confirm (worded
 * identically either way), and committing it wrong is real: {@link
 * ComplianceViewCallbacks.onFailed} fires instead of {@link
 * ComplianceViewCallbacks.onSolved}.
 */
import {
  isSolved,
  renderCompliantText,
  validateCompliance,
  type AppliedCorrections,
  type Correction,
  type PuzzleState,
} from "../systems/Compliance";
import { getAudio } from "../systems/AudioDirector";
import { asButton, captureModalFocus, el } from "./dom";
import "./ComplianceView.css";

export interface ComplianceViewCallbacks {
  /** Fired when the player transmits a fully solved log. Receives the final text. */
  onSolved?: (finalText: string) => void;
  /** Fired when the player aborts (Esc / ABORT) without transmitting. */
  onClose?: () => void;
  /**
   * Fired when the player confirms a transmit that is Q0-compliant but missing
   * the override payload — a wrong answer committed rather than merely
   * attempted. Irreversible on the caller's side: the cache this puzzle guards
   * is gone.
   */
  onFailed?: () => void;
}

export class ComplianceView {
  private readonly puzzle: PuzzleState;
  private readonly callbacks: ComplianceViewCallbacks;
  private readonly root: HTMLDivElement;

  /** correctionId applied to each violation tokenId. */
  private applied: AppliedCorrections = {};
  /** The flagged token the corrections panel is focused on. */
  private selectedTokenId: string | null = null;
  /**
   * True once the player has pressed TRANSMIT once while compliant and is
   * being asked to confirm. Shown identically whether the override payload is
   * actually complete or not, so the confirm step itself never gives away the
   * answer. Any other interaction cancels it.
   */
  private awaitingConfirm = false;
  /** Restores focus to wherever it was when the overlay opened. */
  private restoreFocus?: () => void;

  // Cached regions rebuilt on each render.
  private readonly logEl: HTMLPreElement;
  private readonly correctionsEl: HTMLDivElement;
  private readonly statusComplianceEl: HTMLDivElement;
  private readonly hintEl: HTMLDivElement;
  private readonly transmitBtn: HTMLButtonElement;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (this.awaitingConfirm) {
        this.awaitingConfirm = false;
        this.render();
        return;
      }
      this.callbacks.onClose?.();
    } else if (e.key === "Enter") {
      if (validateCompliance(this.puzzle, this.applied).isCompliant) {
        e.preventDefault();
        this.transmit();
      }
    }
  };

  constructor(mount: HTMLElement, puzzle: PuzzleState, callbacks: ComplianceViewCallbacks = {}) {
    this.puzzle = puzzle;
    this.callbacks = callbacks;

    this.root = el("div", "compliance-root");

    // Expose the panel as a modal dialog so assistive tech announces it and
    // scopes navigation to it; tabindex -1 lets it take programmatic focus.
    const panel = el("div", "compliance-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "compliance-title");
    panel.tabIndex = -1;

    const header = el("div", "compliance-header");
    const title = el("span", "compliance-header-title", "◎ DOCTRINAL COMPLIANCE FILTER");
    title.id = "compliance-title";
    header.append(title, el("span", "compliance-header-sub", puzzle.title));

    const flagNote = el(
      "div",
      "compliance-flagnote",
      "Q>0 SUBJECTIVE CONTENT DETECTED — rewrite every flagged term to Q0. Transmission is final: send it wrong and this cache cannot be recovered.",
    );

    this.logEl = el("pre", "compliance-log");

    // A polite live region so the compliance verdict flip is announced.
    const status = el("div", "compliance-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    this.statusComplianceEl = el("div", "compliance-status-row");
    status.append(this.statusComplianceEl);

    this.hintEl = el("div", "compliance-hint");

    const correctionsHead = el("div", "compliance-corrections-head", "APPROVED CORRECTION MODULES");
    this.correctionsEl = el("div", "compliance-corrections");

    const actions = el("div", "compliance-actions");
    const abortBtn = el("button", "compliance-btn compliance-btn--abort", "ABORT  [Esc]");
    abortBtn.type = "button";
    abortBtn.title = "Abort compliance filter [Esc]";
    abortBtn.addEventListener("click", () => this.callbacks.onClose?.());
    this.transmitBtn = el("button", "compliance-btn compliance-btn--transmit", "▸ TRANSMIT PRUNED LOG  [Enter]");
    this.transmitBtn.type = "button";
    this.transmitBtn.addEventListener("click", () => this.transmit());
    actions.append(abortBtn, this.transmitBtn);

    panel.append(header, flagNote, this.logEl, status, this.hintEl, correctionsHead, this.correctionsEl, actions);
    this.root.appendChild(panel);
    mount.appendChild(this.root);

    document.addEventListener("keydown", this.onKeyDown);
    this.render();
    this.restoreFocus = captureModalFocus(panel);
  }

  /** Detaches the widget and its listeners. Safe to call more than once. */
  destroy(): void {
    document.removeEventListener("keydown", this.onKeyDown);
    this.restoreFocus?.();
    this.restoreFocus = undefined;
    this.root.remove();
  }

  // --- interaction ---------------------------------------------------------

  private selectToken(tokenId: string): void {
    getAudio().ping();
    this.awaitingConfirm = false;
    this.selectedTokenId = this.selectedTokenId === tokenId ? null : tokenId;
    this.render();
  }

  private applyCorrection(corr: Correction): void {
    getAudio().ping();
    this.awaitingConfirm = false;
    // Toggle: clicking the already-applied module removes it.
    if (this.applied[corr.targetTokenId] === corr.id) {
      delete this.applied[corr.targetTokenId];
    } else {
      this.applied[corr.targetTokenId] = corr.id;
    }
    this.selectedTokenId = corr.targetTokenId;
    this.render();
  }

  private removeCorrection(tokenId: string): void {
    getAudio().ping();
    this.awaitingConfirm = false;
    delete this.applied[tokenId];
    this.selectedTokenId = tokenId;
    this.render();
  }

  /**
   * TRANSMIT requires two presses once the log is Q0-compliant: the first
   * arms the confirm (shown identically whether the override payload is
   * actually complete), the second commits. Committing while the override is
   * incomplete is a real failure, not a no-op — that's what makes the choice
   * of correction matter.
   */
  private transmit(): void {
    const result = validateCompliance(this.puzzle, this.applied);
    if (!result.isCompliant) return;
    if (!this.awaitingConfirm) {
      this.awaitingConfirm = true;
      this.render();
      return;
    }
    this.awaitingConfirm = false;
    if (isSolved(result)) {
      this.callbacks.onSolved?.(renderCompliantText(this.puzzle, this.applied));
    } else {
      this.callbacks.onFailed?.();
    }
  }

  // --- rendering -----------------------------------------------------------

  private render(): void {
    const active = document.activeElement as HTMLElement | null;
    const focusedTokenId = active?.getAttribute("data-token-id");
    const focusedCorrId = active?.getAttribute("data-corr-id");

    this.renderLog();
    this.renderCorrections();
    this.renderStatus();

    if (focusedTokenId) {
      const target = Array.from(this.logEl.querySelectorAll<HTMLElement>("[data-token-id]")).find(
        (node) => node.getAttribute("data-token-id") === focusedTokenId,
      );
      target?.focus({ preventScroll: true });
    } else if (focusedCorrId) {
      const target = Array.from(this.correctionsEl.querySelectorAll<HTMLElement>("[data-corr-id]")).find(
        (node) => node.getAttribute("data-corr-id") === focusedCorrId,
      );
      target?.focus({ preventScroll: true });
    }
  }

  private renderLog(): void {
    this.logEl.replaceChildren();
    for (const tok of this.puzzle.rawLogText) {
      if (!tok.violation) {
        this.logEl.appendChild(el("span", "compliance-text", tok.text));
        continue;
      }
      const corrId = this.applied[tok.id];
      const corr = corrId
        ? this.puzzle.availableCorrections.find((c) => c.id === corrId)
        : undefined;

      const span = el("span", "compliance-token");
      span.classList.add(corr ? "is-corrected" : "is-flagged");
      if (this.selectedTokenId === tok.id) span.classList.add("is-selected");
      span.setAttribute("data-token-id", tok.id);

      // Each editable term is a keyboard-operable toggle button: aria-pressed
      // tracks whether it is corrected, and a spoken label carries the state.
      if (corr) {
        span.append(el("span", "compliance-token-tag", "✓Q0 "), document.createTextNode(corr.replacementWord));
        span.title = "Activate to revert this correction";
        span.setAttribute("aria-pressed", "true");
        span.setAttribute("aria-label", `Corrected to “${corr.replacementWord}”. Activate to revert.`);
        asButton(span, () => this.removeCorrection(tok.id));
      } else {
        const selected = this.selectedTokenId === tok.id;
        span.append(el("span", "compliance-token-tag", "⚠Q>0 "), document.createTextNode(tok.text));
        span.title = "Flagged subjective content — select, then apply a correction";
        span.setAttribute("aria-pressed", "false");
        span.setAttribute(
          "aria-label",
          `Flagged term “${tok.text}”, Q greater than zero.${selected ? " Selected." : ""} Activate to select, then choose a correction module.`,
        );
        asButton(span, () => this.selectToken(tok.id));
      }
      this.logEl.appendChild(span);
    }
  }

  private renderCorrections(): void {
    this.correctionsEl.replaceChildren();
    for (const corr of this.puzzle.availableCorrections) {
      const btn = el("button", "compliance-correction");
      btn.type = "button";
      btn.setAttribute("data-corr-id", corr.id);
      const isApplied = this.applied[corr.targetTokenId] === corr.id;
      const isForSelected = this.selectedTokenId === corr.targetTokenId;
      if (isApplied) btn.classList.add("is-applied");
      if (this.selectedTokenId && !isForSelected) btn.classList.add("is-dimmed");
      btn.setAttribute("aria-pressed", isApplied ? "true" : "false");

      // Deliberately no indication here of which corrections carry the override
      // payload — the label text (and the fiction) is the only tell.
      btn.title = isApplied
        ? "Click to remove this correction module"
        : "Click to apply this correction module";
      btn.append(el("span", "compliance-correction-label", `[CORRECTION] ${corr.label}`));
      btn.addEventListener("click", () => this.applyCorrection(corr));
      this.correctionsEl.appendChild(btn);
    }
  }

  private renderStatus(): void {
    const result = validateCompliance(this.puzzle, this.applied);

    this.statusComplianceEl.classList.toggle("is-ok", result.isCompliant);
    this.statusComplianceEl.classList.toggle("is-bad", !result.isCompliant);
    this.statusComplianceEl.textContent = result.isCompliant
      ? "COMPLIANCE_STATUS:  STATUTORILY COMPLIANT (Q0)"
      : "COMPLIANCE_STATUS:  NON-COMPLIANT (Q > 0)";

    // Never surface `result.overrideSuccess` here — whether the override payload
    // actually survived is exactly what TRANSMIT is supposed to risk finding out.
    if (this.awaitingConfirm) {
      this.hintEl.textContent = "⚠ TRANSMIT IS FINAL — this cache cannot be re-hacked. Press again to confirm.";
      this.hintEl.className = "compliance-hint is-confirm";
    } else if (result.isCompliant) {
      this.hintEl.textContent = "▸ Log reads Q0. Transmit when ready.";
      this.hintEl.className = "compliance-hint is-solved";
    } else if (result.errorMessage) {
      this.hintEl.textContent = `⓿ ${result.errorMessage}`;
      this.hintEl.className = "compliance-hint is-error";
    } else {
      this.hintEl.textContent = "Select a flagged term, then choose a correction module.";
      this.hintEl.className = "compliance-hint";
    }

    this.transmitBtn.disabled = !result.isCompliant;
    this.transmitBtn.title = !result.isCompliant
      ? "Rewrite all flagged Q>0 terms to Q0 before transmitting."
      : this.awaitingConfirm
        ? "Press Enter or click to confirm final transmission."
        : "Transmit Q0-compliant log.";
    this.transmitBtn.classList.toggle("is-ready", result.isCompliant && !this.awaitingConfirm);
    this.transmitBtn.classList.toggle("is-confirming", this.awaitingConfirm);
    this.transmitBtn.textContent = this.awaitingConfirm
      ? "▸ CONFIRM TRANSMIT — FINAL  [Enter]"
      : "▸ TRANSMIT PRUNED LOG  [Enter]";
  }
}
