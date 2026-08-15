import type Phaser from "phaser";
import { UI_ICON_SIZE } from "../render/uiScale";

/**
 * The HUD's optional artwork.
 *
 * Everything the HUD draws today is `Graphics` and `Rectangle` primitives — there
 * is no atlas, no nine-slice and no panel art anywhere in the project. That is a
 * reasonable place to have started and a bad place to stay, because it means
 * hand-drawn chrome has nowhere to go: every widget would have to grow its own
 * loader, its own key and its own fallback.
 *
 * So the seam lives here instead. A texture listed below is *optional*: it is
 * probed for before boot, queued only if it is actually there, and each widget
 * asks {@link hasUiTexture} before using it and otherwise draws exactly what it
 * draws now. The game runs unchanged with none of these files present, which is
 * the state the repository is in — and it keeps running with three of the five
 * present, which is the state it will be in halfway through an art pass.
 *
 * `size` is the art's authored dimension and `display` the size it appears at.
 * `uiScale.test.ts` asserts every entry is pixel-perfect, so an entry added at the
 * wrong resolution fails the build instead of shipping a resampled panel.
 */
export interface UiTextureSpec {
  /** Phaser texture key, and the name widgets check for. */
  key: string;
  /** Path under `public/`. */
  path: string;
  /**
   * The art's authored pixel dimension (square).
   *
   * For a {@link UiTextureSpec.sheet}, this is one *frame* rather than the whole
   * image — which is what the scale rule cares about, and what keeps the file's
   * outer dimensions (144x144 for a 3x3 grid of 48s) from having to be square.
   */
  size: number;
  /** The dimension it is drawn at on screen. Defaults to {@link UiTextureSpec.size}. */
  display?: number;
  /**
   * Nine-slice inset, for panel art: how many pixels in from each edge are corner
   * rather than stretchable middle. Only meaningful for panels.
   */
  slice?: number;
  /**
   * Present when the file is a grid of frames rather than one image.
   *
   * Aseprite-family exporters often pad the sheet, so the offsets have to be
   * declared or every frame comes out shifted by a pixel — though not always:
   * the panel's own export is packed edge-to-edge with no padding at all, so
   * `margin`/`spacing` genuinely vary per file and have to be read off each
   * one rather than assumed. {@link UiSheetSpec.count} exists because a grid
   * rarely divides evenly: the panel's 8 frames sit in a 3x3 grid, and Phaser
   * will happily generate a 9th from the empty bottom-right slot.
   */
  sheet?: UiSheetSpec;
}

export interface UiSheetSpec {
  /** Blank border around the whole grid, in pixels. */
  margin: number;
  /** Blank gutter between adjacent frames, in pixels. */
  spacing: number;
  /** How many frames are actually drawn, counting across rows first. */
  count: number;
}

export const UI_TEXTURES: readonly UiTextureSpec[] = [
  /**
   * The generic HUD panel: border, corners and fill, stretched to any size.
   *
   * Eight frames: a shared casing, an idle frame, and a seven-frame bounce
   * (frames 1-7, ping-pong) where a corner LED trio and the nine-slice middle's
   * fill both animate. See {@link ./PanelLed} for what the frames mean and how
   * they're addressed.
   *
   * Exported 144x144, a tight 3x3 grid with no margin or spacing at all — see
   * {@link UiTextureSpec.sheet}'s doc comment for why that isn't assumed.
   */
  {
    key: "ui-panel",
    path: "assets/ui/panel/ui-panel.png",
    size: 48,
    slice: 12,
    sheet: { margin: 0, spacing: 0, count: 8 },
  },
  /**
   * The radar's ring. Drawn over the scope's masked contents, so its interior must
   * be transparent — see the note in `Radar.drawBezel`.
   */
  { key: "ui-radar-bezel", path: "assets/ui/radar/bezel.png", size: 96 },
] as const;

/** The size item icons are authored and drawn at. */
export const UI_ICON_DISPLAY = UI_ICON_SIZE;

/** Filled by {@link discoverUiTextures}; empty until it has run. */
let present: readonly UiTextureSpec[] = [];

/**
 * Works out which of the optional textures actually exist, before Phaser starts.
 *
 * Handing a missing file to the loader and catching the error afterwards does not
 * work: Phaser logs `Failed to process file` from inside the loader itself, so a
 * repository behaving exactly as intended would print an error per absent PNG on
 * every boot. Asking first is both quieter and cheaper than a failed image decode.
 *
 * Fails open, in the same spirit as `fontsReady`: a probe that throws is treated
 * as "no art", which costs the drawn fallback and never the game. Runs alongside
 * the font wait, so it adds no boot latency of its own.
 *
 * The content-type check is not belt-and-braces. Vite's dev server answers a
 * request for a file that isn't there with the SPA shell and a 200, so `res.ok`
 * alone reports every missing texture as present and hands Phaser an HTML document
 * to decode as a PNG — the exact error this function exists to avoid, only now
 * with a misleading cause.
 */
export async function discoverUiTextures(): Promise<void> {
  const found = await Promise.all(
    UI_TEXTURES.map(async (spec) => {
      try {
        const res = await fetch(spec.path, { method: "HEAD" });
        const type = res.headers.get("content-type") ?? "";
        return res.ok && type.startsWith("image/") ? spec : undefined;
      } catch {
        return undefined;
      }
    }),
  );
  present = found.filter((s): s is UiTextureSpec => s !== undefined);
}

/** Queues whichever optional textures {@link discoverUiTextures} found. */
export function preloadUiTextures(scene: Phaser.Scene): void {
  for (const spec of present) {
    if (spec.sheet) {
      scene.load.spritesheet(spec.key, spec.path, {
        frameWidth: spec.size,
        frameHeight: spec.size,
        margin: spec.sheet.margin,
        spacing: spec.sheet.spacing,
      });
    } else {
      scene.load.image(spec.key, spec.path);
    }
  }
}

/** Whether a piece of optional UI art actually loaded. */
export function hasUiTexture(scene: Phaser.Scene, key: string): boolean {
  return scene.textures.exists(key);
}
