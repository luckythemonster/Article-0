/**
 * The game's typefaces, in one place.
 *
 * Three faces, all self-hosted from `./fonts` — no CDN request, so the game still
 * works offline and makes no third-party calls:
 *
 *   Share Tech Mono — everything. A true monospace (every advance is 540/1000),
 *     which the HUD depends on: the SRP axes, the inventory's right-aligned
 *     counts, the objective ticks and the pause menu's indented rows all line up
 *     by character cell.
 *   Article Zero Symbols — the fourteen geometric marks the UI is built out of
 *     that Share Tech Mono does not carry: ← ↑ → ↓ ⏸ ⓿ ▸ ◈ ○ ◎ ⚠ ✓ ✔ ✖. Drawn
 *     to the same 540 cell and the same stroke weight, so they sit in text rather
 *     than on top of it. Built by `tools/font/build_symbols.py`.
 *   Share Tech — the proportional cut, used *only* for the three big standalone
 *     scene titles. It must never be used where columns line up.
 *
 * The symbol face is a separate font rather than those glyphs added to Share Tech
 * Mono because that file carries Reserved Font Name 'Share' (see `fonts/OFL.txt`),
 * and OFL 1.1 clause 3 bars a modified version from keeping the name. Listing it
 * *after* Share Tech Mono is what makes this work: CSS and canvas both resolve
 * fallback per glyph, so the base face serves the text and this picks up only
 * what it lacks.
 *
 * `Text` objects rasterise at creation and never re-render when a webfont
 * arrives later, so the fonts are awaited before the game boots — see
 * {@link ./fontsReady}.
 */

/** The workhorse. Use this for anything that is not one of the scene titles. */
export const FONT_MONO = '"Share Tech Mono", "Article Zero Symbols", "Courier New", monospace';

/** The proportional cut — scene titles only, never tabular text. */
export const FONT_DISPLAY =
  '"Share Tech", "Share Tech Mono", "Article Zero Symbols", "Courier New", monospace';

/** Families that must be resident before any `Text` is drawn. */
export const REQUIRED_FONTS = ["Share Tech Mono", "Article Zero Symbols", "Share Tech"] as const;
