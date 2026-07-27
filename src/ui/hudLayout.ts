/**
 * The HUD's shared vertical budget.
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
 */

/** Top of the objective tracker's heading. */
export const OBJECTIVE_TOP = 10;

/** Top of the objective list itself. */
export const OBJECTIVE_BODY_TOP = 28;

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
 * VENT-4 line. See `objectiveLines`.
 */
const OBJECTIVE_MAX_LINES = 5;

/** First y an encounter HUD may claim without ever overlapping the directive. */
export const ENCOUNTER_TOP =
  OBJECTIVE_BODY_TOP + OBJECTIVE_MAX_LINES * OBJECTIVE_LINE_HEIGHT + 8;

/** The encounter band's rows, all derived from {@link ENCOUNTER_TOP}. */
export const ENCOUNTER_BAR_TOP = ENCOUNTER_TOP + 18;
export const ENCOUNTER_STATUS_TOP = ENCOUNTER_TOP + 30;
export const ENCOUNTER_BANNER_TOP = ENCOUNTER_TOP + 46;
