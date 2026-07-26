import { REQUIRED_FONTS } from "./fonts";

/**
 * Resolves once the game's webfonts are actually usable for drawing.
 *
 * This gate is not optional, and it is not about avoiding a flash. Phaser's
 * `Text` rasterises to a canvas texture **at construction** and never redraws
 * itself when a font arrives afterwards — so a `Text` created during the load
 * bakes in the fallback face permanently. Since the HUD builds its labels in
 * `UIScene.create()` and the title screen builds its in `create()` too, losing
 * that race means the game runs its whole session in Courier New with no visible
 * error and nothing to retry.
 *
 * `document.fonts.load()` is what forces the fetch: a CSS `@font-face` is lazy,
 * and a font nothing has *asked* for is never downloaded, so awaiting
 * `document.fonts.ready` alone can resolve immediately having loaded nothing.
 *
 * Deliberately fail-open. A blocked font request, a browser without the CSS Font
 * Loading API, or a slow CDN-less cold start should cost the player the typeface,
 * never the game — so every path resolves, and the timeout bounds the wait.
 */

/** How long to wait before giving up and drawing in the fallback face. */
const FONT_TIMEOUT_MS = 3000;

export function fontsReady(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts?.load) return Promise.resolve();

  // A size is required in the shorthand; which size is irrelevant to the fetch.
  const loads = REQUIRED_FONTS.map((family) => fonts.load(`16px "${family}"`).catch(() => []));

  return Promise.race([
    Promise.all(loads).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS)),
  ]);
}
