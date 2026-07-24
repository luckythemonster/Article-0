/**
 * Tiny DOM helpers shared by the framework-agnostic overlay views
 * (ComplianceView, QualiaLockView, …). No Phaser, no registry — just typed
 * element construction and a couple of accessibility affordances, so the
 * minigame widgets stay dependency-free and keyboard/AT-friendly.
 */

/** Builds an element with an optional class and text content in one call. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Makes a non-button element behave like a button for keyboard and assistive
 * tech: exposes it as a `button` role in the tab order and invokes `activate`
 * on Enter/Space (matching a native button) in addition to click. Returns the
 * element so calls can be chained inline.
 */
export function asButton<T extends HTMLElement>(node: T, activate: () => void): T {
  node.setAttribute("role", "button");
  node.tabIndex = 0;
  node.addEventListener("click", activate);
  node.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      activate();
    }
  });
  return node;
}

/**
 * A minimal focus manager for a modal overlay. Records the element that had
 * focus when the modal opened and moves focus onto `panel`; call the returned
 * function on teardown to restore focus to where it was. `panel` should carry
 * `tabindex="-1"` so it can receive programmatic focus without joining the tab
 * order. Guarded so a stale/detached previous element can't throw.
 */
export function captureModalFocus(panel: HTMLElement): () => void {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  // Defer one frame so the panel is laid out before it takes focus.
  panel.focus({ preventScroll: true });
  return () => {
    if (previouslyFocused && document.contains(previouslyFocused)) {
      previouslyFocused.focus({ preventScroll: true });
    }
  };
}
