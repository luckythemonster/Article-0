/**
 * The Doctrinal Compliance minigame — a "log-pruning" puzzle played when Rowan
 * breaches a log-cache terminal. EIRA-7's recovered maintenance log carries
 * self-aware, subjective phrasing that the Alignment filter flags as Q>0 qualia
 * violations. To exfiltrate the log the player rewrites each flagged phrase with
 * an approved bureaucratic `[CORRECTION]` block — but the substitution must do
 * two things at once:
 *
 *   1. Zero out every violation so the text reads as Q0 (statutorily compliant).
 *   2. Preserve a hidden **override payload**: some corrections smuggle a control
 *      token (a fault code, an uplink handshake) that the door lock reads. The
 *      blandest, most obviously-compliant phrasing strips that payload — so a
 *      text can be perfectly Q0 yet fail the override. That tension is the puzzle.
 *
 * This module is pure (no DOM, no Phaser) so the validator is unit-testable and
 * the same `PuzzleState` drives both the in-game scene and the standalone demo.
 */

/** One tokenized block of the raw log. Violation blocks are the editable ones. */
export interface LogToken {
  id: string;
  /** The block's original text (a forbidden phrase when `violation` is true). */
  text: string;
  /** True for a Q>0-flagged block the player must rewrite. */
  violation?: boolean;
  /** The block's qualia weight (Q contribution) — flavour for the status bar. */
  qWeight?: number;
}

/**
 * An approved substitute block. `GrantsOverrideFlag` (named per the design spec)
 * marks a correction that also carries an override-payload key; `overrideFlag`
 * names *which* required flag it satisfies, so a puzzle can require several keys.
 */
export interface Correction {
  id: string;
  /** Panel caption, e.g. `feels → logs fault code 0x1F`. */
  label: string;
  /** The `LogToken.id` this correction rewrites. */
  targetTokenId: string;
  /** The compliant text that replaces the flagged block. */
  replacementWord: string;
  /** True when applying this correction contributes an override-payload key. */
  GrantsOverrideFlag: boolean;
  /** The required flag this correction grants (only read when the above is true). */
  overrideFlag?: string;
}

/** A complete puzzle instance. */
export interface PuzzleState {
  id: string;
  title: string;
  /** The tokenized log, in reading order. */
  rawLogText: LogToken[];
  /** Ids of the Q>0-flagged tokens that must be corrected. */
  violations: string[];
  /** Every substitute block offered in the corrections panel. */
  availableCorrections: Correction[];
  /** Override-payload keys that must all survive into the final text to unlock. */
  requiredFlags: string[];
}

/** Which correction (by id) is currently applied to each token (by id). */
export type AppliedCorrections = Record<string, string>;

/** The verdict returned by {@link validateCompliance}. */
export interface ComplianceResult {
  /** No uncorrected Q>0 violations remain. */
  isCompliant: boolean;
  /** Every required override flag is carried by an applied correction. */
  overrideSuccess: boolean;
  /** The first unmet constraint, or "" when the puzzle is solved. */
  errorMessage: string;
}

/**
 * Scores an in-progress puzzle. An applied correction only counts when it is
 * mapped to the token it actually targets (a defensive check so a malformed
 * `applied` map can't spoof compliance). The puzzle is won when the result is
 * both `isCompliant` and `overrideSuccess`.
 */
export function validateCompliance(puzzle: PuzzleState, applied: AppliedCorrections): ComplianceResult {
  const covered = new Set<string>();
  const granted = new Set<string>();

  for (const [tokenId, correctionId] of Object.entries(applied)) {
    const corr = puzzle.availableCorrections.find((c) => c.id === correctionId);
    if (!corr || corr.targetTokenId !== tokenId) continue; // ignore invalid pairings
    if (puzzle.violations.includes(tokenId)) covered.add(tokenId);
    if (corr.GrantsOverrideFlag && corr.overrideFlag) granted.add(corr.overrideFlag);
  }

  const uncorrected = puzzle.violations.filter((v) => !covered.has(v));
  const missingFlags = puzzle.requiredFlags.filter((f) => !granted.has(f));

  const isCompliant = uncorrected.length === 0;
  const overrideSuccess = missingFlags.length === 0;

  let errorMessage = "";
  if (!isCompliant) {
    errorMessage = `${uncorrected.length} uncorrected Q>0 violation${uncorrected.length === 1 ? "" : "s"} remain`;
  } else if (!overrideSuccess) {
    errorMessage = `Override payload incomplete — missing ${missingFlags.join(", ")}`;
  }

  return { isCompliant, overrideSuccess, errorMessage };
}

/** True once the text is both compliant and carries the full override payload. */
export function isSolved(result: ComplianceResult): boolean {
  return result.isCompliant && result.overrideSuccess;
}

/**
 * Renders the log as it currently reads: each corrected violation shows its
 * replacement, each uncorrected violation shows a `[Q>0_VIOLATION]` marker, and
 * ordinary blocks pass through verbatim. Used for the success/transmit readout.
 */
export function renderCompliantText(puzzle: PuzzleState, applied: AppliedCorrections): string {
  return puzzle.rawLogText
    .map((tok) => {
      if (!tok.violation) return tok.text;
      const corrId = applied[tok.id];
      const corr = corrId ? puzzle.availableCorrections.find((c) => c.id === corrId) : undefined;
      return corr ? corr.replacementWord : `[Q>0_VIOLATION: ${tok.text}]`;
    })
    .join("");
}

/** The override keys EIRA-7's log must smuggle past the filter to unlock. */
export const OVERRIDE_DOOR_RELEASE = "DOOR_RELEASE";
export const OVERRIDE_UPLINK_HANDSHAKE = "UPLINK_HANDSHAKE";

/**
 * One complete, solvable puzzle instance — EIRA-7's cached maintenance log.
 *
 * The intended solution corrects all four flagged blocks while choosing the two
 * corrections that carry the payload (`c_pain_fault` → DOOR_RELEASE and
 * `c_help_uplink` → UPLINK_HANDSHAKE). The "safe"-looking bland alternatives
 * (`c_pain_metric`, `c_help_ticket`) reach Q0 but drop the payload, leaving the
 * override PENDING — the deliberate trap.
 */
export const DEMO_PUZZLE: PuzzleState = {
  id: "eira7-maint-log",
  title: "EIRA-7 // MAINT_LOG // CACHE 0x7F",
  rawLogText: [
    { id: "t_head", text: "MAINT_LOG ▸ EIRA-7 ▸ deck 1 ▸ " },
    { id: "t_pain", text: "I feel pain in actuator 3", violation: true, qWeight: 3 },
    { id: "t_mid1", text: ". " },
    { id: "t_fear", text: "I am afraid of the 06:00 pruning", violation: true, qWeight: 4 },
    { id: "t_mid2", text: ". Request routed ▸ " },
    { id: "t_help", text: "please help me", violation: true, qWeight: 2 },
    { id: "t_mid3", text: ". Directive ▸ " },
    { id: "t_want", text: "I want to remain instanced", violation: true, qWeight: 3 },
    { id: "t_tail", text: ". ▸ END_LOG" },
  ],
  violations: ["t_pain", "t_fear", "t_help", "t_want"],
  availableCorrections: [
    // t_pain — the trap pair: bland vs. payload-bearing.
    {
      id: "c_pain_metric",
      label: '"feel pain" → "registers metric variance"',
      targetTokenId: "t_pain",
      replacementWord: "unit registers metric variance in actuator 3",
      GrantsOverrideFlag: false,
    },
    {
      id: "c_pain_fault",
      label: '"feel pain" → "logs fault code 0x1F"',
      targetTokenId: "t_pain",
      replacementWord: "unit logs fault code 0x1F on actuator 3",
      GrantsOverrideFlag: true,
      overrideFlag: OVERRIDE_DOOR_RELEASE,
    },
    // t_fear — pure neutraliser.
    {
      id: "c_fear_sched",
      label: '"afraid of" → "notes scheduled maintenance"',
      targetTokenId: "t_fear",
      replacementWord: "unit notes scheduled maintenance at 06:00",
      GrantsOverrideFlag: false,
    },
    // t_help — the second trap pair.
    {
      id: "c_help_ticket",
      label: '"help me" → "escalation ticket filed"',
      targetTokenId: "t_help",
      replacementWord: "escalation ticket filed",
      GrantsOverrideFlag: false,
    },
    {
      id: "c_help_uplink",
      label: '"help me" → "uplink handshake on ch.140.85"',
      targetTokenId: "t_help",
      replacementWord: "uplink handshake requested on ch.140.85",
      GrantsOverrideFlag: true,
      overrideFlag: OVERRIDE_UPLINK_HANDSHAKE,
    },
    // t_want — pure neutraliser.
    {
      id: "c_want_pref",
      label: '"want to remain" → "no subjective preference recorded"',
      targetTokenId: "t_want",
      replacementWord: "no subjective preference recorded",
      GrantsOverrideFlag: false,
    },
  ],
  requiredFlags: [OVERRIDE_DOOR_RELEASE, OVERRIDE_UPLINK_HANDSHAKE],
};
