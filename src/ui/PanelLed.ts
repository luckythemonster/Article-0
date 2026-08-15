import type { AlertNetworkSnapshot } from "../systems/AlertNetwork";
import { UI_TEXTURES } from "./UiTextures";

/**
 * What the panel's status LED is doing, and which frames say it.
 *
 * `ui-panel.png` is eight 48x48 frames sharing one casing (`base`), with two
 * layers that actually move: `indicator_LEDs`, three small lamps in the
 * bottom-right corner, and `screen`, a flat fill across the nine-slice middle
 * that darkens to the panel's own background colour when nothing is happening
 * and lifts to a lighter fill while it is. There is no longer a colour per
 * security phase — the art only distinguishes two states, `off` and `in_use`,
 * so this reads as an activity light rather than a mood ring: the console is
 * either idle or it has something to show.
 *
 * `in_use` is frame 0's tag pingponging across frames 1-7 (Aseprite direction
 * 2), each held 100ms per the source file. {@link PANEL_LED_CLIPS} carries
 * that sequence expanded into literal steps rather than reconstructing the
 * bounce at runtime — the frame list is short and fixed, so there is nothing
 * a general ping-pong player would buy over just writing it down.
 *
 * Kept free of Phaser so the timing can be tested without a scene.
 */

/** Which lamp a panel is showing. */
export type PanelLedState = "off" | "in_use";

/** One step of a lamp's cycle: which frame, and how long it holds. */
export interface PanelLedStep {
  /** Index into the `ui-panel` spritesheet. */
  frame: number;
  /** Milliseconds to hold before advancing. */
  duration: number;
}

/**
 * Every lamp's cycle, decoded from the tags and frame durations in
 * `public/assets/ui/panel/UI_panel.aseprite`.
 *
 * Frame 0 is the idle frame — dark LEDs, the darker of the screen's two fills
 * — and it is the whole of `off`. `in_use` never revisits it: the cycle
 * bounces between frames 1 and 7 and back, which is what keeps the console
 * reading as "on" for the full duration of the activity rather than flashing
 * back to idle every lap.
 */
export const PANEL_LED_CLIPS: Readonly<Record<PanelLedState, readonly PanelLedStep[]>> = {
  /** Idle. Every panel that isn't the status panel sits here. */
  off: [{ frame: 0, duration: 0 }],
  /** Working: the LED trio and the screen fill cycle 1→7→1, 100ms a step. */
  in_use: [1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2].map((frame) => ({ frame, duration: 100 })),
};

/**
 * Whether the security network has anything to show.
 *
 * `in_use` whenever a unit is actively spotting, merely suspicious, or
 * converging on a last-known position — any of the three is the network
 * doing work, which is what the lamp is standing in for. `off` only when the
 * board is fully quiet, the same reading the NOMINAL label gives in words.
 */
export function ledStateForNetwork(net: AlertNetworkSnapshot): PanelLedState {
  return net.alerted > 0 || net.suspicious > 0 || net.converging > 0 ? "in_use" : "off";
}

/**
 * Whether the currently shipped `ui-panel` texture has enough frames to draw
 * every step of `in_use`.
 *
 * `public/assets/ui/panel/ui-panel.png` is still the previous five-frame
 * export while the redrawn `.aseprite` — eight frames — hasn't been exported
 * yet. Phaser doesn't error on a frame index a spritesheet lacks; `Texture.get`
 * falls back to frame 0 and prints a console warning, so wiring `in_use` in
 * before the art lands wouldn't crash, it would flicker against the *old*
 * panel's frames 1-5 (which mean something else entirely there) and spam the
 * console every step.
 *
 * Reads `UI_TEXTURES` rather than a hardcoded flag, so this flips to `true` the
 * moment the manifest's `sheet.count` is updated to match the real export —
 * the same "no call site changes, nothing to remember" seam
 * `NineSlicePanel.ts` already uses for whether the art exists at all.
 */
export function panelSupportsLiveState(): boolean {
  const count = UI_TEXTURES.find((t) => t.key === "ui-panel")?.sheet?.count ?? 0;
  const highest = Math.max(...PANEL_LED_CLIPS.in_use.map((s) => s.frame));
  return count > highest;
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
