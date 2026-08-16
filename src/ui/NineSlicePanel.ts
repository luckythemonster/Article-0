import Phaser from "phaser";
import { UI, UI_DEPTH, hex } from "./hudTheme";
import { UI_TEXTURES, hasUiTexture } from "./UiTextures";
import { SCREEN_ON } from "./NetworkPanel";

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
  /**
   * Which chrome frame to draw: a lit screen ({@link SCREEN_ON}, the default) or
   * a dark one ({@link SCREEN_OFF}).
   *
   * Only the alert-network readout has any use for the dark frame — it means
   * "no data published yet". Everything else is a panel that simply exists, and
   * wants the lit interior, which is `--c-bg-panel`.
   */
  frame?: number;
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
    const inset = (key === PANEL_SPEC?.key ? PANEL_SPEC?.slice : undefined) ?? 12;
    const frame = opts.frame ?? SCREEN_ON;
    return scene.add
      .nineslice(x, y, key, frame, w, h, inset, inset, inset, inset)
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

/**
 * Moves and resizes a panel, whichever branch {@link uiPanel} returned.
 *
 * `NineSlice.setSize` records the new dimensions and updates the display origin
 * but does *not* rebuild the mesh, so a panel resized with it alone keeps drawing
 * at its old size. `updateVertices()` is the half that does the work. (The UVs are
 * the other way round — they only need touching when the *frame* changes, which
 * is {@link setPanelFrame}'s job, not this one's. Phaser's own doc comment on
 * `updateUVs` spells out the split.)
 */
export function placePanel(
  panel: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Rectangle,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  panel.setPosition(x, y);
  panel.setSize(w, h);
  if (panel instanceof Phaser.GameObjects.NineSlice) panel.updateVertices();
}

/**
 * Switches which frame a panel draws.
 *
 * **`setFrame` alone is not enough.** The texture component sets `this.frame`
 * and stops; the nine quads keep the UVs they were built with, so the panel goes
 * on drawing the old frame. `updateUVs()` is what remaps them, and omitting it
 * fails *silently* — the panel looks correct and simply never changes.
 *
 * The `false, false` arguments suppress `setFrame`'s size and origin side
 * effects: a panel is sized to the region it frames, not to the 48px frame it
 * samples from, and letting Phaser resize it to the frame would collapse it.
 *
 * A `Rectangle` fallback (no art present) has no frames, so this is a no-op
 * rather than something every caller has to guard.
 */
export function setPanelFrame(
  panel: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Rectangle,
  frame: number,
): void {
  if (!(panel instanceof Phaser.GameObjects.NineSlice)) return;
  panel.setFrame(frame, false, false);
  panel.updateUVs();
}
