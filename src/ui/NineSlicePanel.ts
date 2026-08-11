import Phaser from "phaser";
import { UI, UI_DEPTH, hex } from "./hudTheme";
import { UI_TEXTURES, hasUiTexture } from "./UiTextures";

/**
 * A HUD panel background, drawn from art when there is art and from primitives
 * when there isn't.
 *
 * Panels are the one piece of chrome that cannot simply be a bigger PNG: the
 * shared-field bar, the encounter band and the debug inspector are all different
 * widths, and several change width at runtime. Stretching one bitmap across them
 * would smear the border; drawing one bitmap per size means an artist redrawing a
 * border every time a label grows. Nine-slice is the standard answer — corners
 * fixed, edges stretched along one axis, middle stretched both ways — and Phaser
 * has had `add.nineslice` since 3.60.
 *
 * The fallback matters as much as the art. Every widget that adopts this keeps
 * working with no PNG present, which is the state the repository is in today, and
 * keeps working with *some* panels drawn, which is the state it will be in during
 * an art pass. So this returns a `Rectangle` styled like the borders the HUD
 * already draws by hand, and swaps to the nine-slice the moment the texture
 * exists — no call site changes, nothing to remember.
 */
export interface UiPanelOptions {
  /** Manifest key to draw from. Defaults to the generic `ui-panel`. */
  key?: string;
  /** Defaults to {@link UI_DEPTH.PANEL} — behind whatever the panel contains. */
  depth?: number;
  /** Fill for the drawn fallback. Ignored when art is present. */
  fill?: number;
  /** Border for the drawn fallback. Ignored when art is present. */
  stroke?: number;
  /** Fill opacity for the drawn fallback. */
  alpha?: number;
}

/** The generic panel's manifest entry, for its nine-slice inset. */
const PANEL_SPEC = UI_TEXTURES.find((t) => t.key === "ui-panel");

/**
 * Creates a panel background at `(x, y)` sized `w` x `h`, with a top-left origin.
 *
 * Returns the created object so callers can reposition it on resize; both branches
 * accept `setPosition`/`setDepth` and expose `width`/`height`, which is the whole
 * surface a caller needs.
 */
export function uiPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: UiPanelOptions = {},
): Phaser.GameObjects.NineSlice | Phaser.GameObjects.Rectangle {
  const key = opts.key ?? "ui-panel";
  const depth = opts.depth ?? UI_DEPTH.PANEL;

  if (hasUiTexture(scene, key)) {
    const inset = (key === PANEL_SPEC?.key ? PANEL_SPEC?.slice : undefined) ?? 16;
    return scene.add
      .nineslice(x, y, key, undefined, w, h, inset, inset, inset, inset)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(depth);
  }

  return scene.add
    .rectangle(x, y, w, h, opts.fill ?? hex(UI.bgPanel), opts.alpha ?? 0.85)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(depth)
    .setStrokeStyle(1, opts.stroke ?? hex(UI.borderCool));
}
