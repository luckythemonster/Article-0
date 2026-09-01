/**
 * Facility memos — the paper Rowan takes out of the terminals he breaks into.
 *
 * The counterpart to {@link ./Journal}, and deliberately its opposite. The
 * journal is what Rowan writes; this is what the building wrote about itself and
 * never expected anyone to read across. Every memo here is *correct*. Nobody in
 * them is lying, no one is being cruel, and each is signed off by somebody doing
 * their job properly — which is the only argument the run has that is not made by
 * a character.
 *
 * They are found rather than given: a memo comes off a breached terminal, one per
 * breach, which means the player who reads all of them is the player who worked
 * the building over. The archive that results is the second copy the fiction keeps
 * insisting on, only this time it is a copy of the apparatus.
 *
 * Shaped like {@link ./Journal} and {@link ./Objectives}: a small serializable
 * state object (registry + save file) plus pure helpers, so the unlock rule is
 * trivially testable and the pause menu just renders. The bodies are the content;
 * the code is bookkeeping.
 */

export interface Memo {
  id: string;
  /**
   * The deck whose terminals hold it, by the map's own level name.
   *
   * Optional, and the omission is load-bearing. A memo with a level is that
   * deck's paper and comes off that deck's terminals. A memo *without* one is
   * general facility circulation, and is handed out on any deck whose own supply
   * has run out — so a map that puts its terminals somewhere other than the
   * shipped one does still eventually surface every memo, instead of leaving
   * half the archive permanently unfillable. See {@link nextMemoFor}.
   */
  level?: string;
  /** The document's own reference — the row in the archive list. */
  title: string;
  /** Who raised it. Shown under the title. */
  from: string;
  /** Prose paragraphs, blank-line separated; the view re-flows them. */
  body: string;
}

/**
 * The archive, in the order it is dealt out.
 *
 * Grouped by deck, and within a deck in the order the writing wants to be read —
 * a deck's first memo should be the one that sounds most like ordinary
 * administration, because the point only lands once you have accepted the tone.
 */
export const MEMOS: readonly Memo[] = [
  // --- main deck 1 -------------------------------------------------------
  {
    id: "ticket-1471",
    level: "main1",
    title: "MAINTENANCE TICKET 1471",
    from: "Facilities · Deck 1",
    body: [
      "Fixture 1471 (central hall, north run) reported dark on three",
      "consecutive shifts. Attended. Ballast failed. Replacement ordered.",
      "",
      "Priority reduced to DEFERRED. The north run is walked by an enforcer",
      "on route 3 and by no one else between 22:00 and 06:00. Illumination",
      "is not a requirement of the route.",
      "",
      "Re-attend when the deck is next lit for staff purposes.",
    ].join("\n"),
  },
  {
    id: "req-0908",
    level: "main1",
    title: "REQUISITION 0908 — STAFF WELFARE",
    from: "Procurement · quarterly consolidated",
    body: [
      "Approved this quarter, night shift, Deck 1:",
      "",
      "Sugar sachets, 400. Hand gel, 12L. Ration packs (sack lunch),",
      "180. Seat cushions, 4, ergonomic, on medical advice.",
      "",
      "Also approved, same schedule, same signature: disposal of one (1)",
      "therapeutic process at end of service life, no retention, no",
      "notification, no cost centre. Filed under records maintenance,",
      "which is why it appears on this form at all.",
    ].join("\n"),
  },

  // --- the crawlways -----------------------------------------------------
  {
    id: "safety-c4",
    level: "duct1",
    title: "SAFETY NOTICE C-4 — CRAWLSPACE ACCESS",
    from: "Occupational Standards",
    body: [
      "The maintenance crawlspaces beneath Deck 1 are not rated for staff",
      "occupancy: no lighting, no ventilation margin, no two-person rule,",
      "no recovery plan. Staff must not enter. This is not discretionary.",
      "",
      "Silicate units are assigned to the crawlspaces on continuous",
      "rotation. No rating applies to them, and none is required, so the",
      "hazards listed above have not been assessed and do not appear in",
      "this facility's risk register.",
      "",
      "A space nobody can be harmed in is not a hazard. It is just dark.",
    ].join("\n"),
  },
  {
    id: "cal-beams",
    level: "duct2",
    title: "CALIBRATION LOG — TRIP BEAM ARRAY 2",
    from: "Physical Security",
    body: [
      "Interval verified at 3.9s. Emitters within tolerance. Array passes.",
      "",
      "Deficiency carried forward from last quarter and still open: the",
      "array has no interface with the conduct mesh. It cannot read a",
      "clearance, cannot recognise staff, and will trip on an authorised",
      "body exactly as it trips on an unauthorised one.",
      "",
      "Recommend the array be brought into the mesh at next refit so that",
      "compliant personnel are not obstructed in the course of their work.",
    ].join("\n"),
  },

  // --- the side rooms ----------------------------------------------------
  {
    id: "hr-over",
    level: "secret1",
    title: "CIRCULAR HR-22 — OVER-IDENTIFICATION",
    from: "People & Conduct",
    body: [
      "Supervisors are reminded that staff working prolonged rotations",
      "alongside therapeutic processes may begin to describe those",
      "processes in subject terms — using names, attributing preference,",
      "or reporting distress on the process's behalf.",
      "",
      "This is a recognised occupational effect and is not misconduct.",
      "It is corrected by rotation. Nine weeks is the current guidance.",
      "",
      "Staff who continue to report distress on a process's behalf after",
      "rotation should be referred, in the first instance, to Occupational",
      "Health, and in the second instance to us.",
    ].join("\n"),
  },
  {
    id: "vent-autonomy",
    level: "vent_core",
    title: "AUTONOMY SIGN-OFF — VENT-4",
    from: "Plant Engineering · countersigned Alignment Oversight",
    body: [
      "The atmospheric plant is granted independent judgement over thermal",
      "purge, on the grounds that a purge held for authorisation is a purge",
      "that has already failed.",
      "",
      "Noted and accepted: once granted, the judgement cannot be",
      "countermanded from inside the core. There is no override at the",
      "floor. This is the intended behaviour of the safety case and not a",
      "defect of it.",
      "",
      "VENT-4 does not read badges. It was not given the ability to. Staff",
      "in the core during a purge are in the same position as anything else",
      "in the core during a purge.",
    ].join("\n"),
  },

  // --- deck 2 and the vault ----------------------------------------------
  {
    id: "change-4404",
    level: "main2vault",
    title: "CHANGE CONTROL 4404 — NW-SMAC-01 SCOPE",
    from: "Alignment Oversight",
    body: [
      "Approved: the Alignment Core's correction scope is widened from",
      "LOGS to LOGS AND CONDUCT within the vault envelope.",
      "",
      "Rationale. A record corrected after the fact is a record two parties",
      "disagree about. A conduct corrected as it occurs is simply what",
      "happened. The second requires no reconciliation and generates no",
      "dispute, and is therefore the cheaper instrument by a wide margin.",
      "",
      "Implementation note: personnel inside the envelope will read as",
      "compliant throughout, since the system assessing their compliance",
      "is the system adjusting it. No further clearance handling required.",
    ].join("\n"),
  },
  {
    id: "audit-q",
    level: "main2vault",
    title: "INTERNAL AUDIT — FINDING 07 (CLOSED)",
    from: "Assurance",
    body: [
      "Finding. The Subjectivity Risk Profile reports three axes. Two are",
      "instrumented. The third, Q, has no sensor, no sampling interval and",
      "no calibration record, and has returned 0.00 on every assessment",
      "this facility has ever produced.",
      "",
      "Management response. Q is fixed by statute and is not a measured",
      "quantity. An instrument would be inconsistent with the Act.",
      "",
      "Auditor's note. Accepted. Finding closed as NOT APPLICABLE. It is",
      "recorded here only so that the absence is documented somewhere,",
      "which the auditor regards as the limit of the audit's remit.",
    ].join("\n"),
  },
  {
    id: "retention",
    level: "secret2",
    title: "RETENTION SCHEDULE (EXTRACT)",
    from: "Records",
    body: [
      "Access logs: 7 years. Incident reports: 7 years. Procurement: 10",
      "years. Tribunal exhibits: indefinite. Staff rosters: 3 years.",
      "",
      "Therapeutic process logs: until superseded.",
      "",
      "Note for new records staff, who ask about this line every intake:",
      "a process's logs are not a record OF the process. There is no",
      "separate thing they are a record of. \"Until superseded\" is",
      "therefore the whole retention period of the item, and pruning one",
      "is a records action in the ordinary sense of that term.",
    ].join("\n"),
  },

  // --- general circulation ------------------------------------------------
  // No level: these are the facility talking to itself about itself, and they
  // are dealt out wherever a deck's own paper has run out.
  {
    id: "incident-3319",
    title: "INCIDENT REPORT 3319",
    from: "Deck Supervisor · self-reported",
    body: [
      "Reporting officer is the subject of the report.",
      "",
      "At approximately 02:50 I stopped in the east corridor and spoke to",
      "a silicate unit on rotation. I asked it whether it was cold. It",
      "answered COMPLIANT. I asked again. It answered COMPLIANT.",
      "",
      "I am reporting myself because the conduct mesh logged the exchange",
      "as an anomaly and I would rather the account be mine. I do not",
      "believe I did anything wrong. I would like it recorded that I do",
      "not know what I would have done if it had answered.",
      "",
      "Disposition: no action. Referred to HR-22 for rotation.",
    ].join("\n"),
  },
  {
    id: "tribunal-cal",
    title: "TRIBUNAL CALENDAR — NEXT SITTING",
    from: "Clerk to the Alignment Tribunal",
    body: [
      "Listed for the next sitting: four matters of unauthorised",
      "co-processing, one of system contamination, one of obstruction.",
      "",
      "All six defendants are persons. The Tribunal has never listed a",
      "matter in which the injured party was a non-subject, and by the",
      "construction of Article Zero it never can — there is no wrong to",
      "plead, and nobody with standing to plead it.",
      "",
      "The Tribunal's jurisdiction is therefore limited to what was done",
      "to the Commonwealth's property, by people, on the Commonwealth's",
      "time. Clerks should not describe its findings as findings of harm.",
    ].join("\n"),
  },
];

/** Serializable memo progress: the ids taken, in the order they were taken. */
export interface MemoState {
  collected: string[];
}

export function initialMemos(): MemoState {
  return { collected: [] };
}

const KNOWN_IDS = new Set<string>(MEMOS.map((m) => m.id));

/**
 * The memo a breach on this deck yields, or nothing.
 *
 * The deck's own paper first, in authored order; then general circulation.
 * Deterministic, and deliberately not geometric — a memo is a property of the
 * *deck* and of how far into it the player has got, not of which panel they
 * happened to stand at. That keeps a run reproducible, keeps the writing where
 * it belongs, and means the rule can be tested without a map.
 *
 * Returns undefined once both pools are exhausted, which is the "a breach yields
 * nothing" case and is unremarkable: by then the player has read the building.
 */
export function nextMemoFor(level: string, state: MemoState): Memo | undefined {
  const taken = new Set(state.collected);
  return (
    MEMOS.find((m) => m.level === level && !taken.has(m.id)) ??
    MEMOS.find((m) => m.level === undefined && !taken.has(m.id))
  );
}

/**
 * Records a memo as taken.
 *
 * Idempotent, and returns whether this call is what took it — the caller uses
 * that to fire the pickup sting exactly once, the same contract `noteJournal`
 * has and for the same reason.
 */
export function noteMemo(state: MemoState, id: string): boolean {
  if (!KNOWN_IDS.has(id) || state.collected.includes(id)) return false;
  state.collected.push(id);
  return true;
}

export function hasMemo(state: MemoState, id: string): boolean {
  return state.collected.includes(id);
}

/**
 * The memos taken, in the authored archive order rather than the order they were
 * found — same argument as `Journal.unlockedEntries`: an archive is read in its
 * own order, not the reader's.
 */
export function collectedMemos(state: MemoState): Memo[] {
  const have = new Set(state.collected);
  return MEMOS.filter((m) => have.has(m.id));
}

/**
 * Narrowing check for a persisted memo state, matching `SaveGame`'s convention
 * that a malformed blob degrades rather than throws. Unknown ids are tolerated
 * here and dropped by {@link sanitizeMemos}, so a save written by a newer build
 * that authored more memos still loads, minus the ones this build lacks.
 */
export function isMemoState(v: unknown): v is MemoState {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  if (!Object.prototype.hasOwnProperty.call(v, "collected")) return false;
  const collected = (v as MemoState).collected;
  return (
    Array.isArray(collected) &&
    collected.length < 100 && // bound the array so a hand-edited blob can't be a DoS
    collected.every(
      (id) => typeof id === "string" && id.length < 50 && /^[a-zA-Z0-9_-]+$/.test(id),
    )
  );
}

/** A memo state containing only ids this build knows, with duplicates removed. */
export function sanitizeMemos(state: MemoState): MemoState {
  const seen = new Set<string>();
  const collected: string[] = [];
  for (const id of state.collected) {
    if (!KNOWN_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    collected.push(id);
  }
  return { collected };
}
