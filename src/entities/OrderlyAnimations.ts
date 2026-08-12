import { type Dir8 } from "./directions";

/**
 * Frame manifest for the orderly (drawn by `CastArt` — a human
 * orderly in a utilitarian jumpsuit with a diagnostic tablet, high top-down,
 * 96x96, `mannequin` template). Only idle and walk are needed — an orderly is
 * a bystander, not a combatant, so it has no run/crouch.
 *
 * Frames are drawn at boot by `CastArt.buildCastTextures`.
 */
export type OrderlyAnimName = "idle" | "walk";

/**
 * Native pixel size of the source art — 96, up from the 84 it used to be.
 *
 * Paired with {@link ORDERLY_DISPLAY_TILES}: `(32 * 1.5) / 96 * 2` = exactly 1
 * screen pixel per source pixel. The old pairing with 84 gave 1.1429 — a
 * fraction, so under `pixelArt: true` most source pixels got one screen pixel
 * while every seventh got two, and which ones moved with the sprite, so the
 * outline crawled as the orderly walked. See `src/render/pixelScale.ts` for the
 * rule and its test.
 *
 * 96 is `84 * 8/7`, exactly the ratio the old scale was magnifying by, so the
 * orderly comes out the size it already was and the display height below does
 * not move: the art was redrawn larger rather than the display shrunk.
 */
export const ORDERLY_SOURCE_SIZE = 96;

/** Display height in tiles, matching the guards. @see ORDERLY_SOURCE_SIZE */
export const ORDERLY_DISPLAY_TILES = 1.5;

export const ORDERLY_ANIM_FRAME_COUNTS: Record<OrderlyAnimName, number> = {
  idle: 4,
  walk: 4,
};

export const ORDERLY_ANIM_FRAME_RATES: Record<OrderlyAnimName, number> = {
  idle: 4,
  walk: 6,
};

export function orderlyFrameKey(anim: OrderlyAnimName, dir: Dir8, frame: number): string {
  return `orderly-${anim}-${dir}-${frame}`;
}

export function orderlyAnimKey(anim: OrderlyAnimName, dir: Dir8): string {
  return `orderly-${anim}-${dir}`;
}

