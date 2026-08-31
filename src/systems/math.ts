/**
 * Small numeric helpers shared across the systems and the HUD.
 *
 * Both of these existed four times over as private copies — in `GridMotion`,
 * `QualiaLock`, `PauseMenuView` and `ekg` — which is three chances for one of them
 * to disagree about an edge case. The `ekg` copy was the one that had already
 * thought about `NaN`; that behaviour is the one kept here.
 *
 * Headless by construction (see AGENTS.md): pure arithmetic, no Phaser and no DOM,
 * so the UI can import it as freely as the systems do.
 */

/** `v` held to the inclusive range `[lo, hi]`. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * `v` held to 0..1, with junk floored rather than raised.
 *
 * A non-finite input (`NaN`, `±Infinity`) reads as **0**, not as full. These drive
 * meters — the bio-integrity bar, the EKG trace — and a bad divide upstream should
 * flatline the readout rather than silently pin it to a full, healthy-looking bar.
 */
export function clamp01(v: number): number {
  // `v > 0` rather than `v < 0` on the low side so that -0 normalises to 0, which
  // is what the `Math.max(0, …)` copy this replaces returned. Both call sites feed
  // the result to string interpolation or arithmetic where the two are
  // indistinguishable, but a helper handing back -0 is a trap for the next one.
  return Number.isFinite(v) ? (v > 0 ? (v > 1 ? 1 : v) : 0) : 0;
}
