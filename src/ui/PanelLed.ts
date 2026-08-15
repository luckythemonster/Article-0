import type { AlertPhase } from "../systems/AlertState";

/**
 * What the panel's status LED is doing, and which frames say it.
 *
 * `ui-panel.png` is five 48x48 frames that are pixel-for-pixel identical except
 * for twelve pixels in the top-right corner: a lamp in its housing. The art was
 * authored with three named states, and their colours are the palette's own —
 * `--c-green` for nominal, `--c-amber-bright` for caution, `--c-red-deep` for
 * alert — so the lamp is not decoration. It is the same reading the NETWORK line
 * gives in words, in the corner of the frame around it.
 *
 * The blink rates come from the art too, and they are deliberately uneven: a
 * long lit beat with a short blink reads as a heartbeat, an even fast alternation
 * reads as an alarm. A single frame rate would flatten that distinction, which is
 * why {@link PANEL_LED_CLIPS} carries a duration per frame rather than an fps.
 *
 * Kept free of Phaser so the timing can be tested without a scene.
 */

/** Which lamp a panel is showing. */
export type PanelLedState = "off" | "active" | "warning" | "alert";

/** One step of a lamp's cycle: which frame, and how long it holds. */
export interface PanelLedStep {
  /** Index into the `ui-panel` spritesheet. */
  frame: number;
  /** Milliseconds to hold before advancing. */
  duration: number;
}

/**
 * Every lamp's cycle, decoded from the tags and frame durations in
 * `public/assets/ui/panel/ui-panel.aseprite`.
 *
 * Frame 1 is the unlit lamp, which is why it appears in three of the four: it is
 * the gap in every blink, and it is the whole of `off`.
 */
export const PANEL_LED_CLIPS: Readonly<Record<PanelLedState, readonly PanelLedStep[]>> = {
  /** A dark lamp. Every panel that isn't the status panel sits here. */
  off: [{ frame: 1, duration: 0 }],
  /** Nominal: a long green beat with a short gap. */
  active: [
    { frame: 2, duration: 500 },
    { frame: 1, duration: 100 },
  ],
  /** Caution: an even amber blink, quicker than nominal's beat. */
  warning: [
    { frame: 3, duration: 111 },
    { frame: 4, duration: 111 },
  ],
  /** Alert: an even red blink, the fastest of the three. */
  alert: [
    { frame: 0, duration: 100 },
    { frame: 1, duration: 100 },
  ],
};

/**
 * The lamp for a security phase.
 *
 * The mapping is the art's, not an invention: the tags are named ACTIVE, WARNING
 * and ALERT and coloured to match what `AlertNetworkHud` already prints for
 * INFILTRATION, EVASION and ALERT.
 */
export function ledStateFor(phase: AlertPhase): PanelLedState {
  switch (phase) {
    case "ALERT":
      return "alert";
    case "EVASION":
      return "warning";
    default:
      return "active";
  }
}

/**
 * Advances a lamp, given how long it has been on its current step.
 *
 * Returns the step to show and the time left over, so a caller driving this from
 * a frame delta stays in phase instead of resetting its clock every tick. A
 * zero-duration clip (`off`) never advances — it is one frame forever, and
 * treating it as a cycle would divide by nothing.
 */
export function advanceLed(
  state: PanelLedState,
  index: number,
  elapsed: number,
): { index: number; elapsed: number } {
  const clip = PANEL_LED_CLIPS[state];
  let i = index % clip.length;
  let t = elapsed;
  // A clip that never advances, or one whose steps are all instantaneous, would
  // spin here forever otherwise.
  if (clip.every((s) => s.duration <= 0)) return { index: i, elapsed: 0 };
  while (t >= clip[i].duration) {
    t -= clip[i].duration;
    i = (i + 1) % clip.length;
  }
  return { index: i, elapsed: t };
}
