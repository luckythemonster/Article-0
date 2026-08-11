/**
 * The arithmetic rule for UI art, which is the world's rule with the zoom removed.
 *
 * `pixelScale.ts` governs sprites in the world: they are drawn at a size derived
 * from the tile grid and then multiplied by the camera's 2x zoom, and the product
 * has to be a whole number or nearest-neighbour sampling starts throwing pixels
 * away as the camera pans.
 *
 * The HUD has no camera. `UIScene` is deliberately unzoomed and screen-anchored —
 * that is the entire reason it is a separate scene — so a UI texture reaches the
 * screen at whatever scale it is drawn at, and the rule collapses to something
 * simpler and stricter: **author it at the size it appears.**
 *
 * This is not hypothetical. Nine of the ten item icons are 256x256 line art shown
 * in a 32px box — a ratio of 0.125, which is the "below 1" case in `pixelScale.ts`
 * where most of the source is discarded outright and which pixels survive depends
 * on where the box lands. `image-rendering: pixelated` on the element does not fix
 * that; it only makes the discarding sharp-edged instead of blurry. The single
 * icon that reads correctly next to the world art, `sack_lunch.png`, is the one
 * authored at 32x32.
 */

/**
 * The HUD's zoom.
 *
 * Exists as a named constant rather than being folded into the arithmetic so the
 * connection to {@link ./pixelScale.CAMERA_ZOOM} stays visible: if the HUD ever
 * gains a zoom, this is the one place that has to change.
 */
export const UI_ZOOM = 1;

/** The size every HUD icon is authored and displayed at. */
export const UI_ICON_SIZE = 32;

/** How many screen pixels one pixel of a UI texture covers. */
export function uiSpriteScale(sourceSize: number, displaySize: number): number {
  return (displaySize / sourceSize) * UI_ZOOM;
}

/**
 * Whether a UI texture reaches the screen without being resampled.
 *
 * Integer and at least 1, for the reasons spelled out in `pixelScale.ts`: a
 * fractional ratio re-snaps its doubled pixels depending on subpixel position, and
 * a ratio below 1 is discarding source rows and columns outright.
 */
export function isUiPixelPerfect(sourceSize: number, displaySize: number): boolean {
  const ratio = uiSpriteScale(sourceSize, displaySize);
  return ratio >= 1 && Number.isInteger(ratio);
}
