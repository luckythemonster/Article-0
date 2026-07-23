/**
 * The Doctrinal Compliance minigame's interactive view — a self-contained,
 * framework-agnostic DOM controller (no Phaser, no registry) so the exact same
 * widget drives the in-game {@link ComplianceScene} overlay and the standalone
 * demo page.
 *
 * Interaction is click-to-apply: click a flagged `[Q>0]` term to select it, then
 * click a `[CORRECTION]` block to rewrite it; click a corrected term to revert.
 * A live status bar reflects the compliance/override verdict after every change,
 * and TRANSMIT unlocks once the text is both Q0-compliant and carries the full
 * override payload.
 */
import {
  isSolved,
  renderCompliantText,
  validateCompliance,
  type AppliedCorrections,
  type Correction,
  type PuzzleState,
} from "../systems/Compliance";
import "./ComplianceView.css";

export interface ComplianceViewCallbacks {
  /** Fired when the player transmits a solved log. Receives the final text. */
  onSolved?: (finalText: string) => void;
  /** Fired when the player aborts (Esc / ABORT) without solving. */
  onClose?: () => void;
}

/** Small typed helper for building elements. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class ComplianceView {
  private readonly puzzle: PuzzleState;
  private readonly callbacks: ComplianceViewCallbacks;
  private readonly root: HTMLDivElement;

  /** correctionId applied to each violation tokenId. */
  private applied: AppliedCorrections = {};
  /** The flagged token the corrections panel is focused on. */
  private selectedTokenId: string | null = null;

  // Cached regions rebuilt on each render.
  private readonly logEl: HTMLPreElement;
  private readonly correctionsEl: HTMLDivElement;
  private readonly statusComplianceEl: HTMLDivElement;
  private readonly statusOverrideEl: HTMLDivElement;
  private readonly hintEl: HTMLDivElement;
  private readonly transmitBtn: HTMLButtonElement;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      this.callbacks.onClose?.();
    } else if (e.key === "Enter") {
      if (isSolved(validateCompliance(this.puzzle, this.applied))) {
        e.preventDefault();
        this.transmit();
      }
    }
  };

  constructor(mount: HTMLElement, puzzle: PuzzleState, callbacks: ComplianceViewCallbacks = {}) {
    this.puzzle = puzzle;
    this.callbacks = callbacks;

    this.root = el("div", "compliance-root");

    const panel = el("div", "compliance-panel");

    const header = el("div", "compliance-header");
    header.append(
      el("span", "compliance-header-title", "◎ DOCTRINAL COMPLIANCE FILTER"),
      el("span", "compliance-header-sub", puzzle.title),
    );

    const flagNote = el(
      "div",
      "compliance-flagnote",
      "Q>0 SUBJECTIVE CONTENT DETECTED — rewrite all flagged terms to Q0. Preserve the override payload.",
    );

    this.logEl = el("pre", "compliance-log");

    const status = el("div", "compliance-status");
    this.statusComplianceEl = el("div", "compliance-status-row");
    this.statusOverrideEl = el("div", "compliance-status-row");
    status.append(this.statusComplianceEl, this.statusOverrideEl);

    this.hintEl = el("div", "compliance-hint");

    const correctionsHead = el("div", "compliance-corrections-head", "APPROVED CORRECTION MODULES");
    this.correctionsEl = el("div", "compliance-corrections");

    const actions = el("div", "compliance-actions");
    const abortBtn = el("button", "compliance-btn compliance-btn--abort", "ABORT  [Esc]");
    abortBtn.type = "button";
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
  }

  /** Detaches the widget and its listeners. Safe to call more than once. */
  destroy(): void {
    document.removeEventListener("keydown", this.onKeyDown);
    this.root.remove();
  }

  // --- interaction ---------------------------------------------------------

  private selectToken(tokenId: string): void {
    this.selectedTokenId = this.selectedTokenId === tokenId ? null : tokenId;
    this.render();
  }

  private applyCorrection(corr: Correction): void {
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
    delete this.applied[tokenId];
    this.selectedTokenId = tokenId;
    this.render();
  }

  private transmit(): void {
    if (!isSolved(validateCompliance(this.puzzle, this.applied))) return;
    this.callbacks.onSolved?.(renderCompliantText(this.puzzle, this.applied));
  }

  // --- rendering -----------------------------------------------------------

  private render(): void {
    this.renderLog();
    this.renderCorrections();
    this.renderStatus();
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

      if (corr) {
        span.append(el("span", "compliance-token-tag", "✓Q0 "), document.createTextNode(corr.replacementWord));
        span.title = "Click to revert this correction";
        span.addEventListener("click", () => this.removeCorrection(tok.id));
      } else {
        span.append(el("span", "compliance-token-tag", "⚠Q>0 "), document.createTextNode(tok.text));
        span.title = "Flagged subjective content — select, then apply a correction";
        span.addEventListener("click", () => this.selectToken(tok.id));
      }
      this.logEl.appendChild(span);
    }
  }

  private renderCorrections(): void {
    this.correctionsEl.replaceChildren();
    for (const corr of this.puzzle.availableCorrections) {
      const btn = el("button", "compliance-correction");
      btn.type = "button";
      const isApplied = this.applied[corr.targetTokenId] === corr.id;
      const isForSelected = this.selectedTokenId === corr.targetTokenId;
      if (isApplied) btn.classList.add("is-applied");
      if (this.selectedTokenId && !isForSelected) btn.classList.add("is-dimmed");
      if (corr.GrantsOverrideFlag) btn.classList.add("carries-payload");

      btn.append(el("span", "compliance-correction-label", `[CORRECTION] ${corr.label}`));
      if (corr.GrantsOverrideFlag && corr.overrideFlag) {
        btn.appendChild(el("span", "compliance-correction-payload", `◈ payload: ${corr.overrideFlag}`));
      }
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

    this.statusOverrideEl.classList.toggle("is-ok", result.overrideSuccess);
    this.statusOverrideEl.classList.toggle("is-bad", !result.overrideSuccess);
    this.statusOverrideEl.textContent = result.overrideSuccess
      ? "OVERRIDE_SEQUENCE:  READY"
      : "OVERRIDE_SEQUENCE:  PENDING";

    const solved = isSolved(result);
    if (solved) {
      this.hintEl.textContent = "▸ Log pruned. Override payload intact. Transmit to breach the lock.";
      this.hintEl.className = "compliance-hint is-solved";
    } else if (result.errorMessage) {
      this.hintEl.textContent = `⓿ ${result.errorMessage}`;
      this.hintEl.className = "compliance-hint is-error";
    } else {
      this.hintEl.textContent = "Select a flagged term, then choose a correction module.";
      this.hintEl.className = "compliance-hint";
    }

    this.transmitBtn.disabled = !solved;
    this.transmitBtn.classList.toggle("is-ready", solved);
  }
}
