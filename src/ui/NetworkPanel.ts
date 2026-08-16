/**
 * The alert-network panel's four indicators, and how game state picks a frame.
 *
 * The panel art carries three LED clusters and a status badge, each in its own
 * corner and each varying independently — far too many combinations to bake as
 * flat frames, which is why the panel is assembled at runtime from a nine-slice
 * chrome plus four small sprites. `tools/panel/build_panel.py` cuts the source
 * into exactly those pieces; this module is the other half of that contract.
 *
 * **The frame indices are generated, not written here.** The tool reads the
 * artist's own cel labels (`'0'`…`'10'`, `'>10'`, `DISCONNECTED`, `NOMINAL`,
 * `SUSPICIOUS`, `ALERT`, `BLINK`, `off`, `on`, `ALERT_FLASH`) and emits
 * {@link ./networkIndicatorFrames.json}. That indirection is what let the count
 * range grow from 0–7 to 0–10 across two redraws without a line of code
 * changing: the art is the source of truth for its own layout.
 *
 * **The counts are binary, not a bargraph.** Four LEDs read as a 4-bit number,
 * leftmost worth 8 — `....` is 0, `...*` is 1, `..*.` is 2, up to `*.*.` for
 * 10. The lit colours rotate for looks and carry no meaning; reading them as
 * severity would be reading something the art does not say. Past the top the
 * cluster shows a single all-lit overflow frame instead.
 *
 * Kept free of Phaser so the encoding can be tested without a scene.
 */
import type { AlertNetworkSnapshot } from "../systems/AlertNetwork";
import FRAMES from "./networkIndicatorFrames.json";

/** Which count cluster — the keys the generator writes, so they cannot drift. */
export type CountKind = "UNIT_indicator_LEDs" | "SPOT_indicator_LEDs" | "SUSP_indicator_LEDs";

export const UNIT: CountKind = "UNIT_indicator_LEDs";
export const SPOT: CountKind = "SPOT_indicator_LEDs";
export const SUSP: CountKind = "SUSP_indicator_LEDs";

/**
 * Indicator sprites are square and exactly the nine-slice inset.
 *
 * Not a coincidence and not free to change: each indicator is cropped to the
 * 12px corner it occupies, and nine-slice reproduces corners at native size
 * whatever the panel is stretched to. That is the whole reason these survive on
 * a panel sized for its text rather than for the art. Mirrored by `PANEL_INSET`
 * in `hudLayout.ts` and `slice` in `UiTextures.ts`.
 */
export const INDICATOR_SIZE = FRAMES.indicatorSize;

/** Frames the generated sheet holds, for the manifest and the bounds checks. */
export const INDICATOR_FRAME_COUNT = FRAMES.frameCount;

/** The chrome sheet's frames: a dark screen, a lit one, and the alert flash. */
export const SCREEN_OFF = FRAMES.screen.off;
export const SCREEN_ON = FRAMES.screen.on;
export const SCREEN_ALERT_FLASH = FRAMES.screen.ALERT_FLASH;

/**
 * How many frames the chrome sheet holds, for the loader's manifest.
 *
 * The generator emits one chrome frame per named screen state and nothing else,
 * so counting the names counts the sheet. Derived rather than written down
 * because the last two art revisions both changed it.
 */
export const SCREEN_FRAME_COUNT = Object.keys(FRAMES.screen).length;

/**
 * The alert blink's period, and how much of it is dark.
 *
 * Asymmetric on purpose. The source cels hold `BLINK` and `ALERT_FLASH` for
 * 50ms, so the artist drew a brief dark blip on a lit panel rather than a 50/50
 * square wave — a strobing readout is hard to actually read, which is the one
 * thing a readout has to do while you are being hunted. Widened from 50ms to
 * 100ms so the blip survives a frame drop; the rhythm is the art's.
 */
export const ALERT_PULSE_MS = 600;
export const ALERT_BLINK_MS = 100;

/**
 * How long the whole-panel red flash holds when ALERT first begins.
 *
 * A stinger, not a state: HUD text draws *over* the screen, so a sustained red
 * fill would sit under the words that say what is happening.
 */
export const ALERT_FLASH_MS = 220;

/**
 * Whether the alert blink is on its dark beat at `nowMs`.
 *
 * A pure function of the clock rather than a toggle a timer flips, so the
 * animation has no state to get out of step with the phase and nothing to
 * unhook when the scene shuts down.
 */
export function alertPulse(nowMs: number): boolean {
  return nowMs % ALERT_PULSE_MS >= ALERT_PULSE_MS - ALERT_BLINK_MS;
}

/**
 * What the badge is saying.
 *
 * `disconnected` is not an alert phase — it is the readout having no data yet,
 * which is a real state because `UIScene` only calls `AlertNetworkHud.update()`
 * once the scene has published a snapshot. `blink` is the dark half of the
 * alert pulse, and is pixel-identical to `disconnected` by design; the art
 * names them separately because they mean different things.
 */
export type BadgeState = "disconnected" | "nominal" | "suspicious" | "alert" | "blink";

const BADGE_FRAME: Record<BadgeState, number> = {
  disconnected: FRAMES.badge.DISCONNECTED,
  nominal: FRAMES.badge.NOMINAL,
  suspicious: FRAMES.badge.SUSPICIOUS,
  alert: FRAMES.badge.ALERT,
  blink: FRAMES.badge.BLINK,
};

/** The highest count a cluster draws exactly, before the overflow frame. */
export function countMax(kind: CountKind): number {
  return FRAMES.counts[kind].max;
}

/**
 * The frame showing `n` on a cluster.
 *
 * Exact while the art has a frame for the number, then a single all-lit
 * overflow frame. Overflow rather than clamping to the top number: holding at
 * "10" while twelve units hunt you would be a quietly wrong readout, where the
 * all-lit frame at least says "more than this display can count".
 */
export function countFrame(kind: CountKind, n: number): number {
  const spec = FRAMES.counts[kind];
  const v = Math.floor(n);
  if (!Number.isFinite(v) || v <= 0) return spec.base;
  return v > spec.max ? spec.overflow : spec.base + v;
}

/** The dark frame a cluster shows on the off half of an alert blink. */
export function countBlinkFrame(kind: CountKind): number {
  return FRAMES.counts[kind].blink;
}

/**
 * The badge for a published snapshot.
 *
 * Amber leads the phase rather than echoing it: a single guard half-noticing
 * you lights `suspicious` while the network is still nominally INFILTRATION,
 * which is the moment the readout is worth glancing at. Red is reserved for the
 * phase proper.
 */
export function badgeStateFor(net: AlertNetworkSnapshot): BadgeState {
  if (net.status === "ALERT") return "alert";
  if (net.status === "EVASION" || net.suspicious > 0) return "suspicious";
  return "nominal";
}

/** The frame showing a badge state. */
export function badgeFrame(state: BadgeState): number {
  return BADGE_FRAME[state];
}

/** Every indicator frame for one readout. */
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
    unit: countFrame(UNIT, 0),
    spot: countFrame(SPOT, 0),
    susp: countFrame(SUSP, 0),
    badge: badgeFrame("disconnected"),
  };
}

/**
 * The live readout for a snapshot.
 *
 * `pulse` is the alert animation's off-beat: while it is set every indicator
 * drops to its dark frame, which is what makes the whole panel read as one
 * alarm rather than four things blinking independently. It is ignored unless
 * the phase is actually ALERT.
 */
export function framesFor(net: AlertNetworkSnapshot, pulse = false): NetworkIndicatorFrames {
  const alerting = net.status === "ALERT";
  if (alerting && pulse) {
    return {
      screen: SCREEN_ON,
      unit: countBlinkFrame(UNIT),
      spot: countBlinkFrame(SPOT),
      susp: countBlinkFrame(SUSP),
      badge: badgeFrame("blink"),
    };
  }
  return {
    screen: SCREEN_ON,
    unit: countFrame(UNIT, net.total),
    spot: countFrame(SPOT, net.alerted),
    susp: countFrame(SUSP, net.suspicious),
    badge: badgeFrame(badgeStateFor(net)),
  };
}
