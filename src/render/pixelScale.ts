/**
 * The one arithmetic rule every character sprite in the game has to satisfy.
 *
 * A sprite is drawn at `(tileSize * displayTiles) / sourceSize`, and the world
 * camera then multiplies that by its zoom. The product is how many screen pixels
 * one pixel of the source art covers, and with `pixelArt: true` — nearest
 * neighbour, no filtering — only a whole number is stable:
 *
 * - **Exactly 1, or 2, or 3.** Each source pixel maps onto a fixed block of
 *   screen pixels. The art is reproduced, never resampled.
 * - **Between whole numbers**, say 1.09: most source pixels get one screen
 *   pixel and every eleventh gets two. Which ones are doubled depends on where
 *   the sprite sits, so as the camera pans the grid re-snaps: outlines break up,
 *   line weights flicker, interior detail crawls.
 * - **Below 1**, say 0.56: pixels are being thrown away outright, and *which*
 *   ones survive changes with the sprite's subpixel position. This is the worst
 *   case and it cannot be fixed by drawing the art better.
 *
 * Two of the four characters satisfied this by accident and two did not, which
 * is why it lives here as a function with a test rather than as a comment. If
 * you change a `displayTiles` or a `sourceSize`, the test says whether you broke
 * the pairing.
 */

/** The world camera's zoom. `UIScene` is deliberately unzoomed and unaffected. */
export const CAMERA_ZOOM = 2;

/**
 * Tile size the shipped maps use (`TileWidth` in the edplay format).
 *
 * The scenes read the real value off the loaded map; this is here so the scale
 * rule can be checked without one.
 */
export const DEFAULT_TILE_SIZE = 32;

/** How many screen pixels one pixel of a sprite's source art covers. */
export function screenPixelsPerSourcePixel(
  displayTiles: number,
  sourceSize: number,
  tileSize: number = DEFAULT_TILE_SIZE,
  zoom: number = CAMERA_ZOOM,
): number {
  return ((tileSize * displayTiles) / sourceSize) * zoom;
}

/** Whether a sprite's art reaches the screen without being resampled. */
export function isPixelPerfect(
  displayTiles: number,
  sourceSize: number,
  tileSize: number = DEFAULT_TILE_SIZE,
  zoom: number = CAMERA_ZOOM,
): boolean {
  const ratio = screenPixelsPerSourcePixel(displayTiles, sourceSize, tileSize, zoom);
  return ratio >= 1 && Number.isInteger(ratio);
}
