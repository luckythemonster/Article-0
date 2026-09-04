/**
 * Where the camera feed's monitor sits on screen.
 *
 * The rect below has two owners: `GameScene` opens a second Phaser camera on it
 * (`src/scenes/game/CameraFeeds.ts`), and `UIScene` draws the bezel, the channel
 * list and the veil around it (`src/ui/CameraFeedHud.ts`). Those two never see
 * each other, which is exactly the arrangement `hudLayout.ts` was written after
 * three separate collisions — so the arithmetic lives here, once, with a test.
 *
 * Its own module rather than another region in `hudLayout.ts` because the feed is
 * not a HUD region: it is a window over the middle of the play field that exists
 * only while the player is standing at a breached terminal. It *reads*
 * `hudLayout`'s budgets to keep out of the permanent furniture's way, which is
 * the relationship `ElevatorPanel.ts` has with the same file.
 */

import {
  ENCOUNTER_TOP,
  SHARED_FIELD_BAR_UP,
  STATUS_STACK_RIGHT,
  radarLeft,
} from "./hudLayout";
import { UI_PAD } from "./hudTheme";

/**
 * The monitor's preferred size.
 *
 * 448 × 256 is 7 × 4 tiles at `CAMERA_ZOOM` 2 and a 32px tile — wide enough to
 * hold a whole room at the default six-tile camera reach, and a shape that reads
 * as a screen rather than as a porthole. It is a *preference*: {@link feedViewport}
 * shrinks it on a canvas with no room, which costs nothing, because a Phaser
 * camera's viewport is a clipping rect. The pixel-perfect rule
 * (`src/render/pixelScale.ts`) is about the camera's *zoom* and its scroll
 * landing on whole pixels, not about how big a window you look through.
 */
export const FEED_W = 448;
export const FEED_H = 256;

/**
 * The smallest monitor worth opening.
 *
 * A floor rather than a further shrink: below about this the picture stops
 * showing enough of the room to be worth the walk, and a feed the size of a
 * postage stamp reads as a rendering bug. On the 640×480 floor the HUD budgets
 * leave more than this, so it never actually binds — it is here so a future
 * widget claiming more of the edge cannot silently squeeze the feed to nothing.
 */
export const FEED_MIN_W = 240;
export const FEED_MIN_H = 144;

/**
 * How much of the bottom edge the feed keeps clear.
 *
 * The conduct readout, the controls hint and the inventory all live down there,
 * and the Shared Field gauge's centreline is {@link SHARED_FIELD_BAR_UP} up from
 * the bottom. The conduct line is what the player is checking while they watch —
 * it is the `UNAUTHORIZED` the feed is costing them — so it has to stay visible.
 */
const BOTTOM_RESERVE = SHARED_FIELD_BAR_UP + 14;

/** A screen-space rectangle, in whole pixels. */
export interface FeedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Clamps `v` into `[lo, hi]`, tolerating an inverted range by preferring `lo`. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi));
}

/**
 * The monitor's rect on a `canvasWidth` × `canvasHeight` canvas.
 *
 * Screen-centred while that clears the permanent HUD columns — the status stack
 * and network panel on the left, the radar on the right — and nudged aside just
 * far enough when it does not. That is `objectiveCentre`'s rule
 * (`hudLayout.ts`), applied to a box rather than a centreline, and for the same
 * reason: being centred on the *screen* rather than on the space actually
 * available is what put the directive through the SRP meter at 640px.
 *
 * Every component is rounded to a whole pixel. A Phaser camera with a fractional
 * viewport origin resamples its contents under `pixelArt: true`, which is the
 * failure `src/render/pixelScale.ts` exists to prevent, arrived at from the
 * viewport's side instead of the sprite's.
 */
export function feedViewport(canvasWidth: number, canvasHeight: number): FeedRect {
  const left = STATUS_STACK_RIGHT + UI_PAD;
  const right = radarLeft(canvasWidth) - UI_PAD;
  const top = ENCOUNTER_TOP;
  const bottom = canvasHeight - BOTTOM_RESERVE;

  const w = Math.round(clamp(FEED_W, FEED_MIN_W, Math.max(FEED_MIN_W, right - left)));
  const h = Math.round(clamp(FEED_H, FEED_MIN_H, Math.max(FEED_MIN_H, bottom - top)));

  // Centred on the screen where it fits, pushed clear of the left column where it
  // does not. `min` wins a crossover for the same reason it does in
  // `objectiveCentre`: on a canvas too narrow for both, the column holding the
  // alert phase, the bio dial and the network count is the one worth keeping.
  const cx = clamp(canvasWidth / 2, left + w / 2, Math.max(left + w / 2, right - w / 2));
  const cy = clamp(canvasHeight / 2, top + h / 2, Math.max(top + h / 2, bottom - h / 2));

  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h };
}

/**
 * The four bands that cover the screen everywhere the monitor does not.
 *
 * The veil has to be a hole rather than a translucent sheet: the picture is
 * rendered by a camera belonging to `GameScene`, and `UIScene` sits above that
 * scene entirely, so anything drawn across the viewport is drawn over the feed.
 * Four rectangles is the whole trick.
 *
 * Ordered top, bottom, left, right, with the side bands taking only the height
 * between the other two so no two overlap — a translucent veil drawn twice over
 * the same pixel is visibly darker there, which reads as a seam.
 */
export function chromeRects(
  vp: FeedRect,
  canvasWidth: number,
  canvasHeight: number,
): FeedRect[] {
  const bands: FeedRect[] = [
    { x: 0, y: 0, w: canvasWidth, h: vp.y },
    { x: 0, y: vp.y + vp.h, w: canvasWidth, h: canvasHeight - (vp.y + vp.h) },
    { x: 0, y: vp.y, w: vp.x, h: vp.h },
    { x: vp.x + vp.w, y: vp.y, w: canvasWidth - (vp.x + vp.w), h: vp.h },
  ];
  // A viewport flush against an edge produces a zero- or negative-width band,
  // which Phaser will happily draw as an inverted rectangle.
  return bands.filter((b) => b.w > 0 && b.h > 0);
}
