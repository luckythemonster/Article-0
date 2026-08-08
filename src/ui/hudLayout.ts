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
 * nothing above it changed height, which is precisely what happened when that bar
 * became an EKG trace and grew by 18px.
 *
 * All offsets are from the HUD's 12px pad, which is the origin every widget in this
 * column already uses.
 */

/** Heading of the bio-integrity readout. */
export const BIO_LABEL_TOP = 80;

/** Drop from that heading to the top of the framed trace window. */
export const BIO_FRAME_TOP = 16;

/** Height of the framed trace window itself. */
export const BIO_FRAME_HEIGHT = 28;

/** First y below the status column that another widget may claim. */
export const STATUS_STACK_BOTTOM = BIO_LABEL_TOP + BIO_FRAME_TOP + BIO_FRAME_HEIGHT + 12;
