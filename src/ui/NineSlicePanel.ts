import Phaser from "phaser";
import { UI, UI_DEPTH, hex } from "./hudTheme";
import { UI_TEXTURES, hasUiTexture } from "./UiTextures";
import { PANEL_LED_CLIPS, advanceLed, type PanelLedState } from "./PanelLed";

/**
 * How often the lamp driver wakes.
 *
 * The shortest step in the art is 100ms, so this is comfortably finer than the
 * fastest blink while still being a twentieth of the work a per-frame update
 * would do. The driver carries its own remainder, so the tick does not have to
 * divide the durations evenly.
 */
const LED_TICK_MS = 25;

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
   * Which status lamp the panel's corner shows. Defaults to `"off"`.
   *
   * Every panel drawn from this art carries the same lamp, so leaving the default
   * alone matters: a HUD of six framed blocks all blinking in unison would read
   * as a fault, not a readout. Exactly one panel should be lit — see
   * {@link attachPanelLed}.
   */
  led?: PanelLedState;
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
    const frame = PANEL_LED_CLIPS[opts.led ?? "off"][0].frame;
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
 * is `attachPanelLed`'s job, not this one's. Phaser's own doc comment on
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

/** Drives a panel's status lamp. Returned by {@link attachPanelLed}. */
export interface PanelLedHandle {
  /** Points the lamp at a new state. A no-op if it is already there. */
  set(state: PanelLedState): void;
  /** Stops the driver. Safe to call more than once. */
  stop(): void;
}

/**
 * Blinks a panel's status lamp, and lets the caller re-aim it.
 *
 * Phaser animations cannot drive this. `play()` belongs to `Sprite`, and a
 * `NineSlice` is not one — it is a nine-quad mesh that happens to mix in the
 * texture component. So the frames are stepped by hand off a scene timer.
 *
 * **`setFrame` alone is not enough.** The texture component sets `this.frame` and
 * stops; the nine quads keep the UVs they were built with, so the panel goes on
 * drawing the old frame. `updateUVs()` is what remaps them, and omitting it fails
 * silently — the panel looks right and simply never blinks.
 *
 * A `Rectangle` fallback (no art present) has no frames, so this returns a handle
 * that does nothing rather than making every caller check.
 */
export function attachPanelLed(
  scene: Phaser.Scene,
  panel: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Rectangle,
  initial: PanelLedState = "off",
): PanelLedHandle {
  if (!(panel instanceof Phaser.GameObjects.NineSlice)) {
    return { set: () => {}, stop: () => {} };
  }

  let state = initial;
  let index = 0;
  let elapsed = 0;

  const draw = (): void => {
    // `false, false` suppresses setFrame's size and origin side effects: the
    // panel is sized to the region it frames, not to the 48px frame it samples.
    panel.setFrame(PANEL_LED_CLIPS[state][index].frame, false, false);
    // See the note above: without this the frame changes and nothing moves.
    panel.updateUVs();
  };

  const timer = scene.time.addEvent({
    delay: LED_TICK_MS,
    loop: true,
    callback: () => {
      const before = index;
      ({ index, elapsed } = advanceLed(state, index, elapsed + LED_TICK_MS));
      if (index !== before) draw();
    },
  });

  // The panel owns the timer: a scene shutdown that left it running would tick
  // against a destroyed game object every frame.
  panel.once(Phaser.GameObjects.Events.DESTROY, () => timer.remove());

  draw();

  return {
    set(next: PanelLedState): void {
      if (next === state) return;
      state = next;
      index = 0;
      elapsed = 0;
      draw();
    },
    stop(): void {
      timer.remove();
    },
  };
}
