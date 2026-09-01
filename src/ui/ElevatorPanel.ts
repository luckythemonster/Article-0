/**
 * The elevator car's control panel: which button art for which floor, and where
 * every part of the plate sits.
 *
 * Phaser-free, in the shape {@link ./NetworkPanel} and {@link ./ObjectivePanel}
 * already use — the scene owns the objects, this owns the arithmetic and the
 * state read, and the tests drive it directly.
 *
 * Where those two are fed by a generated JSON, this declares its frame order
 * here instead. Their art exists and is therefore the source of truth for its
 * own layout; the elevator's does not exist yet, and a hand-written
 * `elevatorPanelFrames.json` would be a fabricated build artefact claiming
 * otherwise. `tools/panel/build_elevator_panel.py` lays the strip out in
 * {@link BUTTON_STATES} order for that reason, exactly as
 * `build_objective_panel.py` lays its own out in a fixed tuple.
 */
import { PANEL_INSET } from "./hudLayout";

/**
 * What a call button is doing, and the order the built strip draws them in.
 *
 * `PRESSED` is the confirmation flash — the beat between choosing a floor and
 * the car actually leaving, which is the only feedback that the press landed
 * before the screen fades.
 */
export const BUTTON_STATES = ["IDLE", "LIT", "SEALED", "PRESSED"] as const;

export type ButtonState = (typeof BUTTON_STATES)[number];

/** The strip index for a button state — the art's frame, once art exists. */
export function elevatorButtonFrame(state: ButtonState): number {
  return BUTTON_STATES.indexOf(state);
}

/**
 * Which state one floor's button is in.
 *
 * Sealed wins over selected: a floor the run has not earned reads as sealed
 * even while the cursor rests on it, because the lamp is describing the floor
 * rather than the cursor. Navigation skips it anyway, so the two only coincide
 * when a panel is all-sealed and there is nothing to move to.
 */
export function buttonStateFor(floor: {
  sealed: boolean;
  selected: boolean;
  pressed: boolean;
}): ButtonState {
  if (floor.sealed) return "SEALED";
  if (floor.pressed) return "PRESSED";
  return floor.selected ? "LIT" : "IDLE";
}

/** The call button's authored and displayed size. Square, and `UI_ZOOM` is 1. */
export const BUTTON_SIZE = 24;

/** Vertical gap between two buttons' boxes. */
export const BUTTON_GAP = 8;

/** Gap between a button and the floor name beside it. */
export const LABEL_GAP = 10;

/** Width reserved for the floor name — the widest label the panel will hold. */
export const LABEL_WIDTH = 190;

/**
 * From the top of the well to the first button: the title line, the floor
 * readout beside it, and the rule under both.
 */
export const READOUT_HEIGHT = 64;

/**
 * Where the rule under the header sits, from the top of the plate.
 *
 * Below the readout's own line box, not level with it: the title is 20px and
 * the floor name 13px, stacked from {@link PANEL_INSET}, and a rule drawn at
 * their sum strikes through the floor name instead of underlining the pair.
 */
export const RULE_OFFSET = 56;

/**
 * From the last button to the bottom of the well: the gap, then the hint line.
 *
 * Budgeted rather than eyeballed because the casing's bottom edge is 12px of
 * nine-slice that the hint must clear — text placed relative to the plate's
 * outer edge lands *on* the casing and is clipped by it.
 */
export const HINT_HEIGHT = 30;

/** Baseline of the hint line, up from the bottom of the plate. */
export const HINT_BASELINE = PANEL_INSET + 16;

/** One button row's pitch — box plus the gap under it. */
export const ROW_PITCH = BUTTON_SIZE + BUTTON_GAP;

/**
 * The plate's size for a given number of floors.
 *
 * Grows with the shaft rather than being fixed, which is the whole reason the
 * casing is nine-sliced: a three-stop lift and an eight-stop one are the same
 * art at two heights. Insets are {@link PANEL_INSET} so the contents land in
 * the well rather than on the casing — the same budget every other widget keeps.
 */
export function panelSize(floorCount: number): { w: number; h: number } {
  const rows = Math.max(floorCount, 1);
  return {
    w: PANEL_INSET * 2 + BUTTON_SIZE + LABEL_GAP + LABEL_WIDTH,
    h:
      PANEL_INSET * 2 +
      READOUT_HEIGHT +
      rows * ROW_PITCH -
      BUTTON_GAP +
      HINT_HEIGHT,
  };
}

/**
 * Where one floor's button box sits, relative to the plate's top-left.
 *
 * The label is placed from the same numbers by the scene, so a row's lamp and
 * its name cannot drift apart.
 */
export function buttonAt(index: number): { x: number; y: number } {
  return {
    x: PANEL_INSET,
    y: PANEL_INSET + READOUT_HEIGHT + index * ROW_PITCH,
  };
}

/**
 * The next selectable row in a direction, skipping sealed floors.
 *
 * Stops at the ends rather than wrapping, matching {@link ./SelectList} and for
 * its stated reason: a list that wraps makes it impossible to tell you are at
 * the bottom without looking. Returns `from` unchanged when there is nowhere to
 * go, so a caller can compare and decide whether anything moved (and whether to
 * click the selection sound).
 */
export function nextSelectable(
  sealed: readonly boolean[],
  from: number,
  delta: number,
): number {
  for (let i = from + delta; i >= 0 && i < sealed.length; i += delta) {
    if (!sealed[i]) return i;
  }
  return from;
}

/** The first floor a freshly opened panel rests on, or -1 if all are sealed. */
export function firstSelectable(sealed: readonly boolean[]): number {
  return sealed.findIndex((s) => !s);
}
