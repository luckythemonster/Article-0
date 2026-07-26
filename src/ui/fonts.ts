/**
 * The game's typefaces, in one place.
 *
 * Two faces from the same family (Carrois Type Design), self-hosted from
 * `public/fonts` — no CDN request, so the game still works offline and makes no
 * third-party calls:
 *
 *   Share Tech Mono — everything. A true monospace (every advance is 540/1000),
 *     which the HUD depends on: the SRP axes, the inventory's right-aligned
 *     counts, the objective ticks and the pause menu's indented rows all line up
 *     by character cell.
 *   Share Tech — the proportional cut, used *only* for the three big standalone
 *     scene titles. It must never be used where columns line up.
 *
 * Neither face carries the eight symbols the UI leans on — ✓ ○ ▸ ◎ ← → ↑ ↓ —
 * so those fall back per glyph to the stack below. That is fine for centred
 * one-off lines (the codec's ◎ header, the pause hint's arrows) and for the
 * objective list, where *every* line starts with a fallback glyph and so they
 * all shift together. It is not fine anywhere a glyph's width has to match a
 * space's: see the caret handling in {@link ./Menu}.
 *
 * `Text` objects rasterise at creation and never re-render when a webfont
 * arrives later, so the fonts are awaited before the game boots — see
 * {@link ./fontsReady}.
 */

/** The workhorse. Use this for anything that is not one of the scene titles. */
export const FONT_MONO = '"Share Tech Mono", "Courier New", monospace';

/** The proportional cut — scene titles only, never tabular text. */
export const FONT_DISPLAY = '"Share Tech", "Share Tech Mono", "Courier New", monospace';

/** Families that must be resident before any `Text` is drawn. */
export const REQUIRED_FONTS = ["Share Tech Mono", "Share Tech"] as const;
