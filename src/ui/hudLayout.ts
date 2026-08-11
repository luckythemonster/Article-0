/**
 * The HUD's shared layout budget — one owner per region of the screen.
 *
 * Top-centre is the crowded part of the screen: the objective tracker lives there, and
 * directly beneath it sits whichever encounter HUD the current level owns (VENT-4,
 * NW-SMAC-01, the rooftop relay). Those are four separate widget classes that never see
 * each other, and each one used to carry its own hardcoded `y`.
 *
 * That held right up until the directive grew from three lines to five, at which point
 * the objective text ran straight through the encounter title and both became
 * unreadable — a collision nothing could catch, because no single file was wrong.
 *
 * So the boundary lives here, once, with the arithmetic that produced it written down.
 *
 * The same failure then happened twice more at the other edges, for the same reason,
 * so the rest of the screen is budgeted here too:
 *
 * - **Bottom edge.** The controls hint anchored bottom-left and the inventory readout
 *   anchored bottom-right, on the same baseline, neither aware of the other. The hint
 *   is 113 characters — about 732px at 12px type — and the inventory needs a couple
 *   hundred more, so on any canvas narrower than ~960px they printed straight through
 *   each other. `index.html` sizes the canvas to `92vw`, so that is most laptops.
 * - **Top-right.** The radar and the debug inspector both anchored to `(width, pad)`.
 *   Debug-only, but a genuine overlap.
 *
 * Each region below names what it reserves and derives the rest, so a widget asks this
 * file where it may draw instead of measuring against a neighbour's internals.
 */

import { UI_PAD } from "./hudTheme";

/**
 * The smallest canvas the HUD is budgeted to stay legible on.
 *
 * There is no fixed internal resolution — `index.html` sizes `#game` to
 * `92vw x 92vh` capped at `1280x800` and Phaser's `Scale.RESIZE` follows it — so
 * "the screen" is a range, and every budget below has to hold at its bottom end.
 * A 640x480 canvas is what a 700px-wide browser window gives.
 */
export const MIN_CANVAS_W = 640;
export const MIN_CANVAS_H = 480;

/**
 * Share Tech Mono's advance, as a fraction of the type size (540/1000).
 *
 * Lets this file predict a string's rendered width without a canvas, which is what
 * makes the budgets below checkable in a unit test rather than only by eye. It is a
 * true monospace, so this is exact rather than an estimate — see `fonts.ts`.
 */
export const MONO_ADVANCE = 0.54;

/** Rendered width of `chars` characters of monospace at `size` px. */
export function monoWidth(chars: number, size: number): number {
  return chars * size * MONO_ADVANCE;
}

// ---------------------------------------------------------------------------
// Top-left: the status stack (alert phase, SRP meter, bio-integrity, network)
// ---------------------------------------------------------------------------

/** The SRP bar: outer track, with the fill inset 1px inside it. */
export const BAR_W = 180;
export const BAR_H = 10;
export const BAR_FILL_W = BAR_W - 2;
export const BAR_FILL_H = BAR_H - 2;

/** Rows of the status column above the bio dial. */
export const SRP_LABEL_TOP = UI_PAD + 30;
export const SRP_BAR_TOP = UI_PAD + 46;
export const SRP_AXES_TOP = UI_PAD + 59;

// ---------------------------------------------------------------------------
// Top-centre: the objective tracker and the encounter band
// ---------------------------------------------------------------------------

/** Top of the objective tracker's heading. */
export const OBJECTIVE_TOP = UI_PAD;

/** Top of the objective list itself. */
export const OBJECTIVE_BODY_TOP = OBJECTIVE_TOP + 18;

/**
 * Rendered line height of the objective list: 12px type plus its 2px `lineSpacing`.
 * Kept beside the widget's own style rather than measured, because `Text.height` is only
 * available after a string has been set and the budget has to hold before that.
 */
const OBJECTIVE_LINE_HEIGHT = 14;

/**
 * The most lines the directive can run to.
 *
 * One per act the map furnished — ALPHA, BETA, the vault, the uplink — plus the optional
 * VENT-4 line. Exported so `Objectives.test.ts` can assert `objectiveLines` never exceeds
 * it: a sixth act would otherwise silently reintroduce the exact overlap this file was
 * written to prevent, with the comment above still claiming it can't happen.
 */
export const OBJECTIVE_MAX_LINES = 5;

/** First y an encounter HUD may claim without ever overlapping the directive. */
export const ENCOUNTER_TOP =
  OBJECTIVE_BODY_TOP + OBJECTIVE_MAX_LINES * OBJECTIVE_LINE_HEIGHT + 8;

/** The encounter band's rows, all derived from {@link ENCOUNTER_TOP}. */
export const ENCOUNTER_BAR_TOP = ENCOUNTER_TOP + 18;
export const ENCOUNTER_STATUS_TOP = ENCOUNTER_TOP + 30;
export const ENCOUNTER_BANNER_TOP = ENCOUNTER_TOP + 46;

/**
 * The top-left status column, below the phase heading.
 *
 * Same problem as the directive above, one column over. `Hud` owns the SRP meter and
 * the bio-integrity readout; `AlertNetworkHud` is a separate widget that has to start
 * underneath them and cannot see them. It used to carry a hardcoded `pad + 118`
 * annotated "below the SRP meter + bio-integrity bar" — correct only for as long as
 * nothing above it changed height.
 *
 * Which it then did, twice: the bar became an EKG strip (+18px), and the strip became
 * an 80px dial. Neither move touched `AlertNetworkHud`, because by then the number
 * lived here.
 *
 * Every `*_TOP` in this file is an absolute y, {@link UI_PAD} included. The column's
 * rows used to be offsets *from* the pad while the directive's rows above were
 * absolute, so half the file needed a `pad +` at the call site and half did not —
 * which is a smaller version of the same class of mistake. One coordinate space now.
 */

/** Heading of the bio-integrity readout. */
export const BIO_LABEL_TOP = UI_PAD + 80;

/** Drop from that heading to the top of the dial. Relative, and used as a delta. */
export const BIO_DIAL_TOP = 16;

/** The dial is square: this is both its width and its height, bezel included. */
export const BIO_DIAL_SIZE = 80;

/** First y below the status column that another widget may claim. */
export const STATUS_STACK_BOTTOM = BIO_LABEL_TOP + BIO_DIAL_TOP + BIO_DIAL_SIZE + 12;

/** Right edge of the column. The 180px SRP bar is wider than the 80px dial. */
export const STATUS_STACK_RIGHT = UI_PAD + BAR_W;

/** Top of the alert-network readout — immediately below the column. */
export const NETWORK_TOP = STATUS_STACK_BOTTOM;

// ---------------------------------------------------------------------------
// Top-right: the radar, then the debug inspector beneath it
// ---------------------------------------------------------------------------

/** The radar scope's radius. Mirrored by `Radar.ts`, which draws to it. */
export const RADAR_RADIUS = 46;

/**
 * First y below the radar, clear of the JAMMED tag that hangs under its bezel.
 *
 * The tag sits at `cy + radius + 10` with a centred origin at 10px type, so it
 * reaches roughly six pixels further down again.
 */
export const RADAR_BOTTOM = UI_PAD + RADAR_RADIUS * 2 + 16;

// ---------------------------------------------------------------------------
// Bottom edge: conduct line and controls hint (left), inventory (right)
// ---------------------------------------------------------------------------

/**
 * The widest line the inventory readout can render, in characters.
 *
 * Worst case is a consumable with a running timer — `▸ Thermal Gel ×8 (ACTIVE 99s)` —
 * rather than a key item, whose names are longer but whose rows carry no suffix.
 * `hudLayout.test.ts` builds the real worst case from `CONSUMABLE_ORDER` and the item
 * catalogue and asserts it still fits, so a longer item name fails the build rather
 * than the screen.
 */
export const INVENTORY_MAX_CHARS = 32;

/** Width the bottom-right inventory may occupy, and which the hint must leave alone. */
export const INVENTORY_RESERVE_W = Math.ceil(monoWidth(INVENTORY_MAX_CHARS, 12));

/** Highest the inventory may grow before it would reach the radar. */
export const INVENTORY_TOP_LIMIT = RADAR_BOTTOM + 8;

/**
 * How long the controls hint stays up, and how long it takes to go.
 *
 * It is a 113-character teaching aid pinned across the bottom of the screen for the
 * whole session — the single widest thing the HUD draws, and the reason the bottom
 * edge collided at all. The bindings it lists are permanently available in the pause
 * menu's CONTROLS tab, so the hint only has to survive first contact.
 */
export const HINT_HOLD_MS = 15_000;
export const HINT_FADE_MS = 1_000;

// ---------------------------------------------------------------------------
// Bottom-centre: the Shared Field gauge
// ---------------------------------------------------------------------------

/** The gauge's bar width, and how far its centreline sits above the bottom edge. */
export const SHARED_FIELD_BAR_W = 168;
export const SHARED_FIELD_BAR_UP = 42;

/** Left edge of the bottom-centre gauge on a canvas `w` wide. */
export function sharedFieldLeft(canvasWidth: number): number {
  return canvasWidth / 2 - SHARED_FIELD_BAR_W / 2;
}

/**
 * Width the controls hint may wrap within.
 *
 * Two constraints, because the bottom edge has three owners rather than two. The
 * inventory holds the right; the Shared Field gauge holds the centre, and its
 * centreline sits 42px up — close enough that a hint wrapped to two lines reaches
 * it. The first version of this budget only knew about the inventory and put the
 * hint straight through the gauge, which is the same mistake one region further
 * along, and is why the gauge's geometry now lives here rather than in the widget.
 *
 * Wrapping to two or three lines on a narrow canvas is the right trade for a hint
 * that is about to fade out anyway.
 */
export function hintWrapWidth(canvasWidth: number): number {
  const beforeGauge = sharedFieldLeft(canvasWidth) - UI_PAD * 2;
  const beforeInventory = canvasWidth - UI_PAD * 2 - INVENTORY_RESERVE_W;
  return Math.max(120, Math.min(beforeGauge, beforeInventory));
}
