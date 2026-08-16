/**
 * The alert-network panel's four indicators, and how game state picks a frame.
 *
 * The panel art carries three LED clusters and a status badge, each in its own
 * corner and each varying independently: 2 screen states x 8 x 8 x 8 counts x 4
 * badge states is 4096 combinations, which is why the panel is assembled at
 * runtime from a nine-slice chrome plus four small sprites rather than being a
 * flat animation. `tools/panel/build_panel.py` cuts the source into exactly
 * those pieces; this module is the other half of that contract, naming where
 * each indicator's frames live in the generated sheet.
 *
 * **The counts are binary, not a bargraph.** Three LEDs read as a 3-bit number,
 * leftmost worth 4 — `...` is 0, `..*` is 1, `.*.` is 2, up to `***` for 7. The
 * lit colours rotate red/yellow/green purely for looks and carry no meaning;
 * reading them as severity would be reading something the art does not say.
 *
 * Kept free of Phaser so the encoding can be tested without a scene.
 */
import type { AlertNetworkSnapshot } from "../systems/AlertNetwork";

/**
 * Indicator sprites are square and exactly the nine-slice inset.
 *
 * Not a coincidence and not free to change: each indicator is cropped to the
 * 12px corner it occupies, and nine-slice reproduces corners at native size
 * whatever the panel is stretched to. That is the whole reason these survive on
 * a panel sized for its text rather than for the art. Mirrored by `PANEL_INSET`
 * in `hudLayout.ts` and `slice` in `UiTextures.ts`.
 */
export const INDICATOR_SIZE = 12;

/** Highest number three LEDs can say. Larger counts clamp here. */
export const COUNT_MAX = 7;

/**
 * Where each indicator's frames begin in `network-indicators.png`.
 *
 * The sheet is an 8-wide grid, so each count indicator's eight frames occupy
 * exactly one row and these are just row starts. Frame order within a row is
 * the value itself, which is what makes {@link countFrame} arithmetic rather
 * than a lookup table.
 */
export const UNIT_BASE = 0;
export const SPOT_BASE = 8;
export const SUSP_BASE = 16;
export const BADGE_BASE = 24;

/** Total frames the generated sheet actually carries. */
export const INDICATOR_FRAME_COUNT = 28;

/** The chrome sheet's two frames: a dark screen and a lit one. */
export const SCREEN_OFF = 0;
export const SCREEN_ON = 1;

/**
 * What the badge is saying.
 *
 * `disconnected` is not an alert phase — it is the readout having no data yet,
 * which is a real state because `UIScene` only calls `AlertNetworkHud.update()`
 * once the scene has published a snapshot. The panel is built disconnected and
 * comes alive on the first frame that has something to show.
 */
export type BadgeState = "disconnected" | "warning" | "alert" | "nominal";

/** Badge frames, in the order the art draws them. */
const BADGE_ORDER: readonly BadgeState[] = ["disconnected", "warning", "alert", "nominal"];

/**
 * The frame showing `n`, clamped into what three LEDs can represent.
 *
 * Clamping rather than wrapping: a count of 8 shown as `...` would read as
 * "nothing here" at the exact moment the base is busiest. Pinning at `***`
 * costs precision and keeps the direction honest.
 */
export function countFrame(base: number, n: number): number {
  const clamped = Math.max(0, Math.min(COUNT_MAX, Math.floor(n)));
  return base + clamped;
}

/**
 * The badge for a published phase.
 *
 * Mirrors the fallback in `AlertNetworkHud`'s own `STATUS` lookup: `status` is a
 * plain string on the snapshot rather than an `AlertPhase`, so an unrecognised
 * value lands on the same nominal reading the text beside it would show, rather
 * than leaving the badge on whatever it happened to be.
 */
export function badgeStateFor(status: string): BadgeState {
  switch (status) {
    case "ALERT":
      return "alert";
    case "EVASION":
      return "warning";
    default:
      return "nominal";
  }
}

/** The frame showing a badge state. */
export function badgeFrame(state: BadgeState): number {
  const i = BADGE_ORDER.indexOf(state);
  return BADGE_BASE + (i < 0 ? BADGE_ORDER.indexOf("nominal") : i);
}

/** Every indicator frame for one published snapshot. */
export interface NetworkIndicatorFrames {
  screen: number;
  unit: number;
  spot: number;
  susp: number;
  badge: number;
}

/** The disconnected readout — no data, dark screen, counts blank. */
export function disconnectedFrames(): NetworkIndicatorFrames {
  return {
    screen: SCREEN_OFF,
    unit: countFrame(UNIT_BASE, 0),
    spot: countFrame(SPOT_BASE, 0),
    susp: countFrame(SUSP_BASE, 0),
    badge: badgeFrame("disconnected"),
  };
}

/**
 * The live readout for a snapshot.
 *
 * The three counts are the same numbers the detail lines below the panel print
 * as `UNITS n SPOT n SUSP n`, so the LEDs and the words cannot disagree.
 */
export function framesFor(net: AlertNetworkSnapshot): NetworkIndicatorFrames {
  return {
    screen: SCREEN_ON,
    unit: countFrame(UNIT_BASE, net.total),
    spot: countFrame(SPOT_BASE, net.alerted),
    susp: countFrame(SUSP_BASE, net.suspicious),
    badge: badgeFrame(badgeStateFor(net.status)),
  };
}
