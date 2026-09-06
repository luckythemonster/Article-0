import type { AlertPhase } from "./AlertState";

/**
 * The rules behind a breached terminal's camera feed: which cameras a deck
 * offers, what each channel is called, which one is on the monitor, and how long
 * a looped channel stays blind.
 *
 * Pure — no Phaser, no DOM — so vitest drives it directly and the scene shell in
 * `src/scenes/game/CameraFeeds.ts` is left with nothing but the second camera and
 * the registry. Same split the three bosses use, and for the same reason: every
 * number below is a design decision, and design decisions belong where a test can
 * hold them still.
 *
 * The feature's own argument, since it undoes something the game deliberately
 * withholds elsewhere (`docs/DESIGN_NOTES.md` — *Vision cones are not drawn*): a
 * camera's picture is not free information, it is bought. The terminal has to be
 * breached first, Rowan stands frozen at the panel with `UNAUTHORIZED` on his
 * record for as long as he watches, and {@link feedJammed} takes the whole thing
 * away on ALERT — the same trade the radar makes.
 */

/**
 * How long a looped channel stays blind, in seconds.
 *
 * Long enough to cross the room the camera watches at a walk, short enough that
 * it is a window rather than a deletion — the same shape as the blackout an
 * orderly is sent to undo. A camera does not know it has been looped and neither
 * does the mesh, so nothing is dispatched: the cost is the tampering flag and the
 * time spent at the panel arranging it.
 */
export const LOOP_SECONDS = 12;

/** One camera on the deck, as the monitor addresses it. */
export interface FeedChannel {
  /**
   * Index into the scene's `sensors` array — how a channel names its camera.
   *
   * An index rather than the `Sensor` itself, because this module never sees a
   * Phaser object and the scene rebuilds every camera on a level change. The
   * array it indexes is rebuilt in the same breath as the channels are, so the
   * two cannot drift apart.
   */
  unit: number;
  /** `CAM 03 · NE` — printed on the monitor and in the channel list. */
  label: string;
  tx: number;
  ty: number;
}

/** Which channel is up, and what is looped. Held by the scene across frames. */
export interface SurveillanceState {
  channels: FeedChannel[];
  /** The channel on the monitor. Always a valid index while a feed is open. */
  index: number;
  /**
   * Seconds of loop left per channel, parallel to {@link channels}; 0 is live.
   *
   * Parallel to the channels rather than a field on each one because it is the
   * only part of a channel that changes, and it is ticked every frame for the
   * whole deck whether the monitor is up or not — a looped camera stays blind
   * after the player walks away from the terminal, which is the entire point of
   * looping it.
   */
  loops: number[];
}

/** A camera as this module needs it: a tile, and nothing else. */
export interface FeedUnit {
  tx: number;
  ty: number;
}

/** The nine bearings a label can carry, by third of the level in each axis. */
const BEARINGS = [
  ["NW", "N", "NE"],
  ["W", "CENTRAL", "E"],
  ["SW", "S", "SE"],
] as const;

/**
 * Which third of `span` `v` falls in — 0, 1 or 2.
 *
 * Clamped rather than trusted: a generated level can place a camera on its very
 * last column, where `v / span` is exactly 1 and the floor would index off the
 * end of the row.
 */
function third(v: number, span: number): number {
  if (span <= 0) return 1;
  return Math.min(2, Math.max(0, Math.floor((v / span) * 3)));
}

/**
 * What one channel is called: its number, and where on the deck it is looking.
 *
 * The bearing is derived from the camera's own position rather than authored,
 * because the map has no name for a room — the levels are flat tile grids with
 * boards on them, not a set of labelled spaces (see `src/map/types.ts`). A third
 * of the deck is the coarsest description that still tells the player which way
 * to walk, which is all the label is for.
 */
export function feedLabel(index: number, tx: number, ty: number, width: number, height: number): string {
  const number = String(index + 1).padStart(2, "0");
  return `CAM ${number} · ${BEARINGS[third(ty, height)][third(tx, width)]}`;
}

/**
 * The deck's channels, in a stable order.
 *
 * Sorted row-major by tile rather than left in whatever order `EntityIndex`
 * happened to sweep the boards in: `CAM 02` has to be the same camera every time
 * the player opens a feed on that deck, or the numbers teach them nothing. The
 * board sweep is stable in practice today, but it is stable by accident — it
 * follows layer order, and `main2` files its cameras on a board of their own
 * while `main1` and `main2vault` use `sensors`.
 */
export function buildChannels(
  units: readonly FeedUnit[],
  width: number,
  height: number,
): FeedChannel[] {
  const ordered = units
    .map((u, unit) => ({ unit, tx: u.tx, ty: u.ty }))
    .sort((a, b) => (a.ty === b.ty ? a.tx - b.tx : a.ty - b.ty));
  return ordered.map((u, i) => ({
    unit: u.unit,
    label: feedLabel(i, u.tx, u.ty, width, height),
    tx: u.tx,
    ty: u.ty,
  }));
}

/** A fresh state for a deck. `index` is 0 when there is anything to watch. */
export function surveillanceState(channels: FeedChannel[]): SurveillanceState {
  return {
    channels,
    index: channels.length > 0 ? 0 : -1,
    loops: channels.map(() => 0),
  };
}

/**
 * Moves the monitor `delta` channels along, wrapping.
 *
 * Every channel is selectable, looped ones included — a looped camera still shows
 * its picture to the person who looped it, which is the joke the verb is built on.
 */
export function nextChannel(state: SurveillanceState, delta: number): void {
  const n = state.channels.length;
  if (n === 0) return;
  state.index = (((state.index + delta) % n) + n) % n;
}

/** Starts (or restarts) a channel's loop. Ignores an index with no channel. */
export function loopFeed(state: SurveillanceState, index: number): boolean {
  if (index < 0 || index >= state.channels.length) return false;
  state.loops[index] = LOOP_SECONDS;
  return true;
}

/** Whether channel `index` is currently looped. */
export function isLooped(state: SurveillanceState, index: number): boolean {
  return index >= 0 && index < state.loops.length && state.loops[index] > 0;
}

/** Seconds of loop left on channel `index`, or 0. */
export function loopRemaining(state: SurveillanceState, index: number): number {
  if (index < 0 || index >= state.loops.length) return 0;
  return state.loops[index];
}

/**
 * Runs every channel's loop down by `dt`.
 *
 * Ticked from the scene's live frame, not from the monitor: a loop set on the way
 * past keeps running while the player walks into the room it blinded, and expires
 * whether or not anybody is watching it.
 */
export function tickLoops(state: SurveillanceState, dt: number): void {
  for (let i = 0; i < state.loops.length; i++) {
    if (state.loops[i] > 0) state.loops[i] = Math.max(0, state.loops[i] - dt);
  }
}

/** One channel as the monitor's chrome needs to draw it. */
export interface SurveillanceChannelView {
  label: string;
  looped: boolean;
  /** Seconds of loop left, for the countdown. 0 while live. */
  remaining: number;
}

/**
 * Everything the monitor's chrome needs for one frame.
 *
 * Deliberately carries no geometry: where the monitor sits is
 * `src/ui/CameraFeed.ts`'s answer and the widget asks it directly, so the rect
 * cannot arrive here stale from a frame published before the last resize.
 *
 * Absent from the registry entirely while no feed is open, which is how
 * `CameraFeedHud` knows to draw nothing — the same contract the encounter HUDs
 * use rather than a `visible` flag nobody would remember to clear.
 */
export interface SurveillanceView {
  channels: SurveillanceChannelView[];
  index: number;
  jammed: boolean;
}

/** The registry key {@link SurveillanceView} is published on. */
export const SURVEILLANCE_KEY = "surveillance";

/** Builds this frame's view of `state`. */
export function surveillanceView(state: SurveillanceState, jammed: boolean): SurveillanceView {
  return {
    channels: state.channels.map((c, i) => ({
      label: c.label,
      looped: state.loops[i] > 0,
      remaining: state.loops[i],
    })),
    index: state.index,
    jammed,
  };
}

/**
 * Whether the feed is showing static rather than a picture.
 *
 * The radar's rule, applied to the monitor: during ALERT the facility's own
 * network is what is hunting Rowan, and the channel he is riding on it goes with
 * it. Exported and shared rather than retyped in the widget so the two readouts
 * can never disagree about when the signal is gone — see `src/systems/Radar.ts`,
 * where `jammed` short-circuits the whole snapshot.
 */
export function feedJammed(phase: AlertPhase): boolean {
  return phase === "ALERT";
}
