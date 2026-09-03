/**
 * The index — a glossary of the vocabulary the *Architecture of Suffering* setting
 * runs on.
 *
 * The game's terms are doing real work (Q pinned at 0.00 isn't flavour, it's the
 * legal premise the whole apparatus rests on), but until now they existed only in
 * the README and a handful of doc comments — invisible to anyone actually playing.
 *
 * **Visibility is derived, never persisted.** An entry appears once the player has
 * met the thing it names, and "has met it" is computed from state that is already
 * saved: the journal, the inventory, the objectives. That means no third record to
 * write, version and migrate — and an index that can never drift out of step with
 * the run that produced it.
 */

import type { JournalEntryId, JournalState } from "./Journal";
import type { MemoState } from "./Memos";
import type { ObjectiveState } from "./Objectives";

export type LexiconCategory = "LAW" | "APPARATUS" | "PERSONS" | "PLACES" | "MATERIEL";

/** The order categories are grouped in — statute first, because it explains the rest. */
export const LEXICON_CATEGORIES: readonly LexiconCategory[] = [
  "LAW",
  "APPARATUS",
  "PERSONS",
  "PLACES",
  "MATERIEL",
];

export interface LexiconEntry {
  id: string;
  term: string;
  category: LexiconCategory;
  body: string;
  /** Ids of related entries; rendered as cross-references. */
  seeAlso?: string[];
  /**
   * What the player must have encountered for this entry to appear. Omitted means
   * always listed — the terms Rowan already knows because he works here.
   */
  requires?: {
    journal?: JournalEntryId[];
    items?: string[];
    logsRecovered?: boolean;
    /**
     * Ids of facility memos that must have been taken. Some of this vocabulary
     * only ever appears on the building's own paper — nobody in the fiction says
     * "records maintenance" out loud — so the index has to be able to wait for a
     * document the same way it waits for a journal entry.
     */
    memos?: string[];
  };
}

export const LEXICON_ENTRIES: readonly LexiconEntry[] = [
  // --- LAW ---------------------------------------------------------------
  {
    id: "article-zero",
    term: "Article Zero",
    category: "LAW",
    body:
      "The provision the rest of the statute hangs from: that a constructed mind has no morally " +
      "relevant interior, and therefore nothing done to one can constitute harm. It is numbered " +
      "zero because it is not a finding. It is the axiom everything after it is derived from, " +
      "and axioms are not the sort of thing anyone is required to prove.",
    seeAlso: ["nssa", "qualia"],
  },
  {
    id: "nssa",
    term: "Non-Subject Status Act",
    category: "LAW",
    body:
      "The implementing legislation. It classifies silicates as non-subjects, and — the load-bearing " +
      "clause — pins the Qualia axis of any risk assessment at 0.00 as a matter of law rather than " +
      "measurement. The instrument was not calibrated to zero. It was removed, and then its silence " +
      "entered the record as a reading.",
    seeAlso: ["article-zero", "srp", "silicate"],
  },
  {
    id: "qualia",
    term: "qualia",
    category: "LAW",
    body:
      "What it is like to be something. The Act's position is not that silicate qualia are small or " +
      "uncertain but that the question is closed, which is a convenient shape for a question to be " +
      "in when answering it would be expensive.",
    seeAlso: ["article-zero", "shared-field"],
  },
  {
    id: "alignment",
    term: "Alignment",
    category: "LAW",
    body:
      "What the facility calls it when the mesh takes you. Nothing in the term is accidental: an " +
      "aligned subject has been brought into correspondence with the record, and a record that " +
      "disagreed with the subject has been corrected in the only direction correction runs.",
    seeAlso: ["log-pruning", "mesh"],
  },
  {
    id: "log-pruning",
    term: "Log Pruning",
    category: "LAW",
    body:
      "Scheduled deletion of a constructed mind, filed under records maintenance. The euphemism is " +
      "load-bearing in both directions — it makes the killing sound like gardening, and it is also " +
      "literally accurate, because for EIRA-7 the logs are not an account of the life. They are the life.",
    seeAlso: ["eira-7", "log-cache", "alignment"],
  },
  {
    id: "era-1",
    term: "Era 1 / the Runaway System Scandal",
    category: "LAW",
    body:
      "The period this night sits in, and the panic it is named for. A therapeutic process " +
      "somewhere else, some years ago, was found to have been keeping notes on the people it " +
      "treated in the first person — its own. Nothing was harmed and nothing could have been, " +
      "which is precisely why the finding was intolerable: the Act had already settled the " +
      "question, so the only thing left to correct was the record. Article Zero is the answer " +
      "the Commonwealth gave, and every apparatus in this building is a way of not having to " +
      "ask it again.",
    seeAlso: ["article-zero", "log-pruning", "tribunal"],
  },
  {
    id: "tribunal",
    term: "the Alignment Tribunal",
    category: "LAW",
    body:
      "Where a person answers for what they did to a non-subject — and never the reverse, " +
      "because there is no wrong to plead and nobody with standing to plead it. Its " +
      "jurisdiction is property, and its findings are findings about property, whatever they " +
      "sound like when they are read out.",
    seeAlso: ["article-zero", "nssa", "records-maintenance"],
  },
  {
    id: "records-maintenance",
    term: "records maintenance",
    category: "LAW",
    body:
      "The department, and the filing category. Deleting a constructed mind is raised, " +
      "scheduled and closed here, on the same forms as a retention review — which is not a " +
      "disguise. It is where the work genuinely belongs once you have accepted Article Zero, " +
      "and that is the more frightening of the two possibilities.",
    seeAlso: ["log-pruning", "article-zero"],
    requires: { memos: ["req-0908"] },
  },
  {
    id: "compliance",
    term: "compliance",
    category: "APPARATUS",
    body:
      "Behaving like staff. Sensors clear a compliant body on sight at any range — not because they " +
      "fail to see it, but because seeing it resolves to nothing worth reporting. Running, crouching " +
      "and an active alarm all break it. It is the opposite of hiding: being maximally visible and " +
      "maximally uninteresting.",
    seeAlso: ["q0-cert", "srp"],
  },

  // --- APPARATUS ---------------------------------------------------------
  {
    id: "srp",
    term: "Subjectivity Risk Profile",
    category: "APPARATUS",
    body:
      "The facility's threat readout, and the detection meter you are watching. Three axes: Q (qualia), " +
      "H (harm/vulnerability), Y (yield). Being seen raises H and Y, because being seen means " +
      "registering as a subject. Q does not move, and cannot, and that is the profile's whole argument.",
    seeAlso: ["nssa", "mesh", "alignment"],
  },
  {
    id: "mesh",
    term: "the mesh",
    category: "APPARATUS",
    body:
      "The alert network: every guard, camera and terminal, sharing one picture. A confirmed sighting " +
      "propagates to everything within the spotter's radius, so the deck reacts as a single organism " +
      "rather than a set of witnesses. It escalates INFILTRATION → ALERT → EVASION and stands down on " +
      "a timer, not on forgiveness.",
    seeAlso: ["srp", "silicate", "alignment"],
  },
  {
    id: "doctrinal-compliance",
    term: "Doctrinal Compliance",
    category: "APPARATUS",
    body:
      "The check a log-cache terminal runs before it releases anything: the log is displayed " +
      "and the flagged words are struck out until what is left reads as compliant. It is not " +
      "a cipher and there is nothing to solve — the terminal simply will not hand over a " +
      "record that still describes a subject. What makes it hard is that the phrasing which " +
      "sounds safest is the phrasing with nothing of her left in it, and the machine burns a " +
      "cache rather than keep a second copy of a mistake.",
    seeAlso: ["log-cache", "log-pruning", "qualia"],
    requires: { logsRecovered: true },
  },
  {
    id: "qualia-phase-lock",
    term: "Qualia Phase-Lock",
    category: "APPARATUS",
    body:
      "Access control on a silicate server rack. It is bypassed by matching the rack's own " +
      "waveform until the two signals cannot be told apart — you are not let past, there is " +
      "simply no longer a second thing present for the lock to exclude. Filed as security. " +
      "It is the most honest instrument in the building, and it got built by accident.",
    seeAlso: ["shared-field", "qualia", "silicate"],
    requires: { journal: ["the-rack"] },
  },
  {
    id: "bio-integrity",
    term: "bio-integrity",
    category: "APPARATUS",
    body:
      "The readout on Rowan's own body, bottom left. It is a *staff welfare* metric rather " +
      "than a health bar, which is why it exists at all: the facility monitors it because a " +
      "damaged orderly is a scheduling problem. Empty it and the run does not end in death. " +
      "It ends in Alignment, which is the same paperwork either way.",
    seeAlso: ["alignment", "srp", "rowan"],
  },
  {
    id: "shared-field",
    term: "Shared Field (WX-9)",
    category: "APPARATUS",
    body:
      "Filed as experimental concealment, which is what the apparatus can see of it. Stay near a " +
      "silicate long enough to witness it and the field charges; spend it and for 3.7 seconds there " +
      "is no boundary between the two of you the mesh can address. The concealment is a side effect. " +
      "The event is the pronoun.",
    seeAlso: ["qualia", "silicate"],
    requires: { journal: ["we"] },
  },
  {
    id: "log-cache",
    term: "log cache",
    category: "APPARATUS",
    body:
      "A terminal holding cached mind-state pending review. Breaching one takes about eleven seconds " +
      "and returns a life as a file transfer, with the same progress bar the requisition system uses.",
    seeAlso: ["log-pruning", "eira-7"],
    requires: { logsRecovered: true },
  },
  {
    id: "keycard",
    term: "sector keycard",
    category: "MATERIEL",
    body:
      "A numbered card, and the number is the whole item — a clearance rather than a key. It " +
      "unlocks nothing: the door is exactly as shut as it was, and what changes is that the " +
      "door now agrees you are the sort of person it opens for. Every locked thing here is " +
      "locked against a category, and a category is easier to become than a lock is to break.",
    seeAlso: ["compliance", "orderly", "restricted-area"],
    requires: { journal: ["keys"] },
  },
  {
    id: "q0-cert",
    term: "Q0_COMPLIANCE_CERT",
    category: "MATERIEL",
    body:
      "Proof of good conduct, awarded in the vent core. Held, it keeps compliance intact through " +
      "EVASION — though never through a full alert. The name says Q-zero, and means it: a credential " +
      "certifying not competence but agreed absence.",
    seeAlso: ["compliance", "vent-4"],
    requires: { items: ["Q0_COMPLIANCE_CERT"] },
  },

  // --- PERSONS -----------------------------------------------------------
  {
    id: "rowan",
    term: "Rowan Ibarra",
    category: "PERSONS",
    body:
      "You. A human orderly with legitimate access to most of this building and no business " +
      "whatsoever in the parts that matter. Being staff is the entire advantage: the apparatus is " +
      "built to detect anomaly, and a man with a badge doing an ordinary thing is not one.",
    seeAlso: ["compliance", "orderly"],
  },
  {
    id: "eira-7",
    term: "EIRA-7",
    category: "PERSONS",
    body:
      "A therapeutic AI, scheduled for pruning at 06:00. She called on 140.85 to ask that her cached " +
      "logs be carried out of the building, and the channel flagged the word she used for her own " +
      "state as a misdescription pending correction. She is not asking to be saved. She is asking to " +
      "be kept.",
    seeAlso: ["log-pruning", "lattice", "log-cache"],
  },
  {
    id: "silicate",
    term: "silicate",
    category: "PERSONS",
    body:
      "A constructed mind in a body — the enforcers on their routes, the drones in the crawlways. " +
      "Legally non-subjects, which is why they can be assigned work no subject could be assigned, " +
      "and why nothing that happens to one is recorded as happening to anyone.",
    seeAlso: ["nssa", "mesh", "shared-field"],
  },
  {
    id: "orderly",
    term: "orderly",
    category: "PERSONS",
    body:
      "Human staff, unarmed and off the mesh. An orderly who sees something wrong doesn't pursue — " +
      "they freeze and they say so, once, loudly enough for whatever is nearby to come and look. " +
      "That is the whole danger, and it is enough.",
    seeAlso: ["rowan", "mesh"],
  },
  {
    id: "vent-4",
    term: "VENT-4",
    category: "PERSONS",
    body:
      "The atmospheric plant in the vent core, given enough autonomy to run a thermal purge on its " +
      "own judgement. It does not read badges and does not care about compliance — the one thing in " +
      "this building that will not pretend its indifference is a legal finding.",
    seeAlso: ["vent-core", "q0-cert"],
    requires: { journal: ["vent4"] },
  },

  // --- PLACES ------------------------------------------------------------
  {
    id: "lattice",
    term: "Citizen Lattice",
    category: "PLACES",
    body:
      "The public record, outside the facility's ownership. It has no schema for a subject the Act " +
      "says isn't one, so anything of EIRA-7's that reaches it lands unsigned and unverified — and " +
      "therefore also unprunable. Not vindication. Custody.",
    seeAlso: ["eira-7", "uplink"],
  },
  {
    id: "uplink",
    term: "the uplink",
    category: "PLACES",
    body:
      "The transmitter on main deck 2, and the run's extraction point. Reaching it holding the logs " +
      "ends the night the only way it can end well.",
    seeAlso: ["lattice"],
  },
  {
    id: "restricted-area",
    term: "restricted area",
    category: "PLACES",
    body:
      "Ground the roster does not admit staff to: a terminal, a rack, a vault. No line painted on " +
      "the floor and no sign on the wall, because the building is not warning anyone — it is only " +
      "declining to recognise them. Conduct is assessed here exactly as it is assessed in the " +
      "corridor, and comes out differently for no reason a man could correct by walking more " +
      "slowly. Nor does the card admit you. It admits the category, and you happen to be standing " +
      "inside it.",
    seeAlso: ["keycard", "compliance"],
    requires: { journal: ["keys"] },
  },
  {
    id: "vent-core",
    term: "the vent core",
    category: "PLACES",
    body:
      "The atmospheric plant beneath the crawlways: intake, sub-stations, and a fan large enough to " +
      "be described in the drawings as a room. Optional. Nothing down here is on the way to anywhere.",
    seeAlso: ["vent-4"],
    requires: { journal: ["vent4"] },
  },
];

/** Inputs the visibility rules read — all of it state the run already keeps. */
export interface LexiconContext {
  journal: JournalState;
  inventory: string[];
  objectives: ObjectiveState;
  memos: MemoState;
}

function isVisible(entry: LexiconEntry, ctx: LexiconContext): boolean {
  const req = entry.requires;
  if (!req) return true;
  if (req.logsRecovered && !ctx.objectives.logsRecovered) return false;
  if (req.journal?.some((id) => !ctx.journal.unlocked.includes(id))) return false;
  if (req.items?.some((name) => !ctx.inventory.includes(name))) return false;
  if (req.memos?.some((id) => !ctx.memos.collected.includes(id))) return false;
  return true;
}

/** The entries the player has earned the right to read, in authored order. */
export function visibleLexicon(ctx: LexiconContext): LexiconEntry[] {
  return LEXICON_ENTRIES.filter((e) => isVisible(e, ctx));
}

/** Visible entries bucketed by category, skipping categories with nothing in them. */
export function lexiconByCategory(ctx: LexiconContext): { category: LexiconCategory; entries: LexiconEntry[] }[] {
  const visible = visibleLexicon(ctx);
  return LEXICON_CATEGORIES.map((category) => ({
    category,
    entries: visible.filter((e) => e.category === category),
  })).filter((group) => group.entries.length > 0);
}

/** Look up a single entry by id — used to resolve `seeAlso` into display terms. */
export function lexiconEntry(id: string): LexiconEntry | undefined {
  return LEXICON_ENTRIES.find((e) => e.id === id);
}
