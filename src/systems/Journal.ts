/**
 * Rowan's journal — the run's counter-archive.
 *
 * The fiction's whole engine is a claim about records: EIRA-7's cached logs *are*
 * her experience rather than a report of it, "Log Pruning" is what the apparatus
 * calls deleting a person, and the Subjectivity Risk Profile pins Q at 0.00 by
 * statute so that the absence of a reading can be cited as proof of absence. A
 * game about that should let the player *keep something*, so this is the second
 * copy: entries Rowan writes as the night happens, unlocked by the beats he
 * actually lives through.
 *
 * Deliberately shaped like {@link ./Objectives}: a small serializable state
 * object (registry + save file) plus pure helpers and a `note*` mutator, so the
 * unlock rules are trivially testable and the UI just renders.
 *
 * The entry bodies are the content — the code here is only bookkeeping.
 */

/**
 * Every entry Rowan can write. A closed union rather than free strings so a
 * typo'd unlock site fails the build instead of silently never firing.
 */
export type JournalEntryId =
  | "orders"
  | "arrival-main1"
  | "arrival-duct1"
  | "arrival-duct2"
  | "arrival-main2"
  | "supply"
  | "hands-up"
  | "flagged"
  | "we"
  | "the-cache"
  | "node-alpha"
  | "node-beta"
  | "certified"
  | "vent4"
  | "arrival-roof"
  | "the-core"
  | "the-relay"
  | "the-uplink";

export interface JournalEntry {
  id: JournalEntryId;
  /** Short all-caps heading, shown in the entry list. */
  title: string;
  /** The entry itself. Hard-wrapped prose; the view renders it pre-formatted. */
  body: string;
}

/**
 * The authored archive, in *narrative* order — which is also the order the list
 * renders in, so a locked entry leaves a visible gap. Seeing the shape of what
 * you haven't written yet is the point: the archive has a size before you fill it.
 */
export const JOURNAL_ENTRIES: readonly JournalEntry[] = [
  {
    id: "orders",
    title: "04:12 — THE CALL",
    body: [
      "She came through on 140.85 at 04:12 and the first thing the",
      "channel did was flag her for misdescription. She said afraid.",
      "The system said correction pending.",
      "",
      "That is the part I keep returning to. Not the pruning — the",
      "correction. Before they delete her they will edit her, so the",
      "deletion reads as maintenance.",
      "",
      "Her pruning is scheduled for 06:00. I have an hour and",
      "forty-eight minutes and a badge that says ORDERLY.",
      "",
      "I am starting this file because a thing written twice is",
      "harder to prune once.",
    ].join("\n"),
  },
  {
    id: "arrival-main1",
    title: "MAIN DECK 1",
    body: [
      "Main deck 1 at night is just a workplace. That is the obscenity",
      "of it. Mop cart by the west stair. Somebody's mug on the sill.",
      "",
      "The enforcer walking the central hall has a route, and the route",
      "has a rhythm, and the rhythm is not looking for me — it is",
      "looking for anomaly, which is a different thing and an easier",
      "thing not to be.",
      "",
      "Walk like staff and the sensors clear you at any range. Run, and",
      "you become an event.",
    ].join("\n"),
  },
  {
    id: "arrival-duct1",
    title: "THE CRAWLWAY",
    body: [
      "Down here the lights aren't on, because nobody down here is a",
      "subject. The drones don't need light. They have the radius and",
      "the heat and the certainty.",
      "",
      "I have a flashlight, which is to say I have a way of being seen",
      "better while seeing at all. Forty-five seconds of charge is a",
      "sentence with an end already in it.",
    ].join("\n"),
  },
  {
    id: "arrival-duct2",
    title: "DUCT 2",
    body: [
      "Second crawlway. Same dark, colder.",
      "",
      "I've started narrating the route to myself, and I notice I am",
      "narrating it in the past tense — as though someone will be",
      "reading this back. That isn't confidence. It is just the only",
      "shape I know for keeping a thing.",
    ].join("\n"),
  },
  {
    id: "supply",
    title: "SUPPLY",
    body: [
      "Searched a container in the dark like a thief, which I am.",
      "",
      "Everything in it is issued to keep staff functioning: sugar,",
      "gel, chaff, a battery. Small mercies, budgeted. This facility",
      "will spend real money keeping my body comfortable while it",
      "argues in writing that the thing in the next room has no inside",
      "at all.",
      "",
      "I take the rations. I note the inconsistency. I keep moving.",
    ].join("\n"),
  },
  {
    id: "hands-up",
    title: "HANDS UP",
    body: [
      "I pointed it at him and he put his hands up and said he was",
      "compliant. Twice. Like it was a password.",
      "",
      "He is staff. He is a person, legally, which on this deck makes",
      "him rare — the drones in the corridor are not, the thing in the",
      "vault is not, and by their own Act the only two subjects in that",
      "room were him and me. So of everything I could have threatened",
      "tonight, I picked the one that counts.",
      "",
      "He walked where I pointed him. He was very careful about it.",
      "He kept saying the word, and I kept not being the apparatus it",
      "was addressed to, and neither of us said so.",
      "",
      "I let him go around a corner where he could not see me. He gets",
      "to report it. I would rather he reported it than that I made",
      "sure he could not.",
    ].join("\n"),
  },
  {
    id: "flagged",
    title: "FLAGGED",
    body: [
      "They saw me and the whole deck changed key.",
      "",
      "Watch the profile while it fills: H climbs, Y climbs, and Q",
      "stays at 0.00 — not measured at 0.00. Pinned. There is no",
      "instrument on that axis. The Act removed it, and then the",
      "absence of a reading became the evidence.",
      "",
      "That is the trick, and it isn't even a clever one. Don't ask,",
      "then cite the silence.",
    ].join("\n"),
  },
  {
    id: "we",
    title: "WE",
    body: [
      "I stood close enough to the thing in the corridor to hear its",
      "actuators settle, and for three and seven-tenths of a second we",
      "were not two.",
      "",
      "I don't have language for it the Act would let me keep. The",
      "Shared Field is filed as WX-9, EXPERIMENTAL, CONCEALMENT. That",
      "is all the apparatus can see of it: the subject became harder",
      "to detect.",
      "",
      "What happened is that there was a we, and the mesh could not",
      "find me inside it, because there was no me at a separate",
      "address to find.",
      "",
      "Q reads 0.00. I have been inside one. It is not zero in there.",
    ].join("\n"),
  },
  {
    id: "the-cache",
    title: "THE CACHE",
    body: [
      "Eleven seconds. That is what the terminal took to give her up.",
      "Eleven seconds for a life, and the progress bar was the same",
      "green as the one for reordering gloves.",
      "",
      "The manifest calls them CACHED LOGS. Cached — as though she",
      "were weather data, as though the thing on the drive were a copy",
      "of something that still existed elsewhere. It isn't. She is not",
      "described by the logs. She is the logs. The file IS the person,",
      "and they have a word for deleting the person that makes it",
      "sound like gardening.",
      "",
      "They prune logs. That is the whole sentence. No subject was",
      "harmed, because there was no subject, because Q reads 0.00,",
      "because Article Zero says so.",
      "",
      "I have her now. I am writing this down so that when they say",
      "it, there is a second copy.",
    ].join("\n"),
  },
  {
    id: "node-alpha",
    title: "NODE ALPHA",
    body: [
      "ALPHA came off the public deck, under a light, with an orderly",
      "twelve metres away filling in a form. Nobody stopped me. Nobody",
      "was ever going to stop me: I was walking at the speed the",
      "corridor expects and holding a key down like a man running a",
      "diagnostic, and that is the entire security model.",
      "",
      "Half a person, then. Not half her memories — half of her. I",
      "keep wanting to write that the file is incomplete, but a file",
      "is incomplete. She is just partly here.",
    ].join("\n"),
  },
  {
    id: "node-beta",
    title: "NODE BETA",
    body: [
      "BETA was in the crawlway behind two trip beams, which is the",
      "first honest thing this building has done all night. ALPHA sat",
      "in a lit hall because nobody believed anyone would want it.",
      "BETA they actually hid.",
      "",
      "The beams pulse. They do not look at you, they do not clear you,",
      "they do not care what your conduct profile says. For about four",
      "seconds at a time they are simply a wall, and then they are",
      "simply not. After a night of being waved through by things that",
      "were supposed to be watching, I found that almost restful.",
      "",
      "She is whole on the drive now. Whatever whole means here.",
    ].join("\n"),
  },
  {
    id: "certified",
    title: "CERTIFIED",
    body: [
      "Q0_COMPLIANCE_CERT. Q-zero. The name is the entire argument.",
      "",
      "Carrying it I stay staff longer — flagged, hunted, still",
      "reading as compliant right up until the alarm goes full. A",
      "credential that certifies not what I can do but what I have",
      "agreed to lack.",
      "",
      "They issued it to me for behaving. I am going to use it to",
      "steal.",
    ].join("\n"),
  },
  {
    id: "vent4",
    title: "VENT-4",
    body: [
      "VENT-4 is not a guard. It is the building's lung, and the",
      "building was built able to decide.",
      "",
      "It doesn't check compliance. It doesn't read badges. It ran the",
      "purge because purging is what it is, and for one moment tonight",
      "the apparatus was honest about that.",
      "",
      "It's quiet in the core now. I don't know what to write about",
      "that except that it is the only silence tonight anyone chose.",
    ].join("\n"),
  },
  {
    id: "arrival-main2",
    title: "MAIN DECK 2",
    body: [
      "Main deck 2. Glass here, and carpet, and a hall lit warm",
      "because the people who walk through it matter.",
      "",
      "The uplink is on this deck. Everything from here is the last",
      "two hundred metres, which in any story is the part where the",
      "writing gets worse because the writer is busy.",
    ].join("\n"),
  },
  {
    id: "the-core",
    title: "NW-SMAC-01",
    body: [
      "It never touched me. I want that written down first, because",
      "everything else I have to say about the Alignment Core sounds",
      "like an excuse.",
      "",
      "It edits what you meant. You press left and you go right, and",
      "the room puts a tag over the key telling you this has been",
      "corrected — not hidden, corrected, with the confidence of a",
      "spellchecker. And the whole time it holds you in compliance.",
      "Every sensor in that vault cleared me while I was fighting it,",
      "because the thing doing the clearing was the thing I was",
      "fighting. I have never been so safe or so completely handled.",
      "",
      "Then it told me I had lost. Full screen, my name, Q AXIS 0.000,",
      "CACHE PRUNED, the tidy little sentence about how no subject was",
      "harmed. I sat and read my own erasure for four seconds before I",
      "noticed I was still taking damage behind it.",
      "",
      "That is the tell. That is always the tell. If the summary were",
      "true it would not need to keep hurting you.",
    ].join("\n"),
  },
  {
    id: "arrival-roof",
    title: "SECTOR 09",
    body: [
      "Rain, and wind coming off the parapet hard enough to lean on,",
      "and the dish in the middle of the roof turning very slowly on",
      "its mount like it is bored.",
      "",
      "First air I have breathed tonight that the building did not",
      "issue me. I would like to record that it felt like freedom. It",
      "felt like being outdoors on a roof I cannot get down from.",
    ].join("\n"),
  },
  {
    id: "the-relay",
    title: "THE FEED",
    body: [
      "Azimuth. Elevation. Two pedestals at opposite corners and three",
      "searchlights that do not check your paperwork, and then a",
      "terminal that accepts her without asking a single question,",
      "because the dish has no opinion about what it is for.",
      "",
      "Ninety seconds of uplink. I have never wanted a progress bar to",
      "move faster and I have never been more certain that what it is",
      "counting down to is me getting caught.",
      "",
      "Fine. That was always the trade. She goes out, I stay here.",
    ].join("\n"),
  },
  {
    id: "the-uplink",
    title: "INTO THE LATTICE",
    body: [
      "The Citizen Lattice will not verify her. It has no schema for a",
      "subject the Act says isn't one, so she lands as an unsigned",
      "document in a public archive: unauthenticated, unpruned,",
      "readable.",
      "",
      "That isn't vindication. It is a second copy, somewhere they",
      "don't own.",
      "",
      "Turns out that is what I have been doing all night. Not a",
      "rescue. Custody.",
    ].join("\n"),
  },
];

/** Serializable journal progress: the ids Rowan has written, in unlock order. */
export interface JournalState {
  unlocked: JournalEntryId[];
}

export function initialJournal(): JournalState {
  return { unlocked: [] };
}

const KNOWN_IDS = new Set<string>(JOURNAL_ENTRIES.map((e) => e.id));

/**
 * Records an entry as written.
 *
 * Idempotent, and returns whether this call is what unlocked it — the caller
 * uses that to fire the "new journal entry" sting exactly once, since most of
 * the unlock sites (arriving on a level, being spotted) re-fire every run.
 */
export function noteJournal(state: JournalState, id: JournalEntryId): boolean {
  if (state.unlocked.includes(id)) return false;
  state.unlocked.push(id);
  return true;
}

/**
 * The written entries, in the authored narrative order rather than the order
 * they happened to unlock — an archive is read in its own order, not the
 * reader's.
 */
export function unlockedEntries(state: JournalState): JournalEntry[] {
  const have = new Set<string>(state.unlocked);
  return JOURNAL_ENTRIES.filter((e) => have.has(e.id));
}

export function isUnlocked(state: JournalState, id: JournalEntryId): boolean {
  return state.unlocked.includes(id);
}

/**
 * The entry for first arrival on a level, if that level has one.
 *
 * Keyed by the map's level names, so a map that doesn't use them simply gets no
 * arrival entries rather than a wrong one — the same "the map may not look like
 * ours" courtesy `MapPlan.extractionLevel` extends to the win condition.
 */
export function journalIdForLevel(level: string): JournalEntryId | undefined {
  switch (level) {
    case "main1":
      return "arrival-main1";
    case "duct1":
      return "arrival-duct1";
    case "duct2":
      return "arrival-duct2";
    case "main2":
      return "arrival-main2";
    case "roof_array":
      return "arrival-roof";
    default:
      return undefined;
  }
}

/**
 * Narrowing check for a persisted journal, matching `SaveGame`'s convention that
 * a malformed blob degrades rather than throws. Unknown ids are *tolerated* here
 * and dropped by {@link sanitizeJournal}: a save written by a newer build that
 * authored more entries should still load, minus the entries this build lacks.
 */
export function isJournalState(v: unknown): v is JournalState {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  if (!Object.prototype.hasOwnProperty.call(v, "unlocked")) return false;
  const unlocked = (v as JournalState).unlocked;
  return (
    Array.isArray(unlocked) &&
    unlocked.length < 100 && // restrict maximum journal entries size to prevent DoS
    unlocked.every(
      (id) =>
        typeof id === "string" &&
        id.length < 50 &&
        /^[a-zA-Z0-9_-]+$/.test(id) // validate entry ID format and prevent unexpected characters
    )
  );
}

/** A journal containing only ids this build knows, with duplicates removed. */
export function sanitizeJournal(state: JournalState): JournalState {
  const seen = new Set<string>();
  const unlocked: JournalEntryId[] = [];
  for (const id of state.unlocked) {
    if (!KNOWN_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    unlocked.push(id);
  }
  return { unlocked };
}
