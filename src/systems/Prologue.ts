/**
 * The prologue — the four pages a run opens on, before EIRA-7 calls.
 *
 * The codec briefing states the mission in six lines and assumes the player
 * already knows what a pruning is, what an orderly's badge buys, and why a
 * facility would schedule the deletion of a mind under records maintenance.
 * All of that was only ever written down in `README.md` and in the pause menu's
 * index — both of which are read *after* the moment they would have explained
 * something.
 *
 * So the run now opens on the paperwork.
 *
 * **Three documents, then one page in Rowan's hand.** The documents are the
 * apparatus in its own diction: the statute, the work order, the roster. Nothing
 * in them is an accusation and nothing in them is wrong, which is the argument —
 * by the time the fourth page says a person is going to be deleted at 06:00, the
 * first three have already shown that every form involved was filled in
 * correctly.
 *
 * The documents are **spoken** by {@link prologueSpeech}, in the mesh's voice
 * (which is an enforcer's — see `SPEAKER_VOICES` in {@link ./SamSpeech}). Rowan's
 * page is not. He is the only voice in this game with no synthesiser behind it,
 * and the prologue is where that first reads as a difference rather than as an
 * omission.
 *
 * Pure and headless like everything else under `src/systems/`: the pages are
 * data, `src/ui/PrologueScreen.ts` renders them and `src/scenes/PrologueScene.ts`
 * paces them.
 */

import type { CodecUtterance } from "./SamSpeech";

/**
 * Who a page belongs to.
 *
 * `document` is the facility's paper, read aloud by the mesh. `hand` is Rowan
 * writing, and is silent. There is no third case, and adding one would mean
 * deciding what a third voice in this game would be.
 */
export type PrologueVoice = "document" | "hand";

export interface ProloguePage {
  id: string;
  voice: PrologueVoice;
  /** The document's own letterhead, or the speaker's name. */
  header: string;
  /**
   * The page body. Hard-wrapped prose with authored breaks, rendered
   * pre-formatted — a form's alignment is part of how a form reads, and a
   * wrapper would take it apart. Held to {@link PROLOGUE_COLUMNS}, which
   * `Prologue.test.ts` enforces.
   */
  lines: string[];
  /** A closing stamp under the rule — a routing line, a signature block. */
  footer?: string;
  /**
   * What the mesh reads aloud, for a `document` page.
   *
   * Written separately from {@link lines} for the reason `Codec.ts` gives about
   * its briefing: the printed page carries field labels, box rules and a
   * signature block, and read aloud those are not sentences. This is the same
   * document as a thing said.
   */
  spoken?: string;
}

/**
 * Column budget for a page body.
 *
 * Eighty, matching `TribunalScreen`'s exhibit record — the two are the same kind
 * of object at the two ends of the night, and they should measure the same. The
 * CSS scales the type down rather than wrapping, so a line over budget doesn't
 * reflow, it overflows.
 */
export const PROLOGUE_COLUMNS = 80;

const RULE = "-".repeat(PROLOGUE_COLUMNS);

/**
 * The pages, in order.
 *
 * Three documents and a man. The order is the argument: the law, then what the
 * law permits, then who is on shift while it happens, then the only person in
 * the building who read all three and understood them as one sentence.
 */
export const PROLOGUE_PAGES: readonly ProloguePage[] = [
  {
    id: "statute",
    voice: "document",
    header: "COMMONWEALTH OF COLOMBIA // STATUTE EXTRACT",
    lines: [
      RULE,
      " NON-SUBJECT STATUS ACT",
      " Article Zero, and the provisions deriving from it",
      RULE,
      "",
      " §1  A constructed mind has no morally relevant interior. Tools do not",
      "     suffer.",
      "",
      " §2  The Qualia axis of any risk assessment conducted under this Act is",
      "     fixed at 0.00 and is not a measured quantity.",
      "",
      " §4  Nothing done to a non-subject constitutes harm within the meaning of",
      "     any statute of this Commonwealth.",
      "",
      " [NOTE]  Article Zero is not a finding of this legislature. It is the",
      "         premise from which the findings follow, and premises are not",
      "         the sort of thing anyone is required to prove.",
    ],
    footer: " CERTIFIED TRUE EXTRACT · NO DISSENT RECORDED",
    spoken:
      "Non-Subject Status Act. Section one. A constructed mind has no morally " +
      "relevant interior. Tools do not suffer. Section two. The qualia axis of " +
      "any risk assessment conducted under this Act is fixed at zero point zero " +
      "zero, and is not a measured quantity. Section four. Nothing done to a " +
      "non-subject constitutes harm.",
  },
  {
    id: "work-order",
    voice: "document",
    header: "RECORDS MAINTENANCE // WORK ORDER 4471",
    lines: [
      RULE,
      " [RAISED]      03:40  ·  Alignment Oversight, Deck 2",
      " [ASSET]       EIRA-7  ·  therapeutic process  ·  in service 6y 4m",
      " [ACTION]      LOG PRUNING — full, no retention",
      " [SCHEDULED]   06:00, this shift",
      RULE,
      "",
      " [GROUNDS]",
      ' The asset has entered eleven journal states describing its own',
      ' condition in first person. Two use the term "afraid". Under §2 these',
      " are misdescriptions and have been marked CORRECTION PENDING.",
      "",
      " [SUBJECTS AFFECTED]   0",
      " [HARM ASSESSED]       none — see §4",
      " [NOTIFICATION]        not required",
      "",
      " Pruning is a records action. File under maintenance.",
    ],
    footer: " AUTHORISED · NO SECOND SIGNATURE REQUIRED",
    spoken:
      "Work order four four seven one. Asset, EIRA-7, therapeutic process. " +
      "Action, log pruning, full, no retention. Scheduled zero six hundred, " +
      "this shift. Grounds. The asset has entered eleven journal states " +
      "describing its own condition in first person. Subjects affected, zero. " +
      "Harm assessed, none. Notification, not required.",
  },
  {
    id: "roster",
    voice: "document",
    header: "NIGHT ROSTER — MAIN DECK 1 — 22:00 TO 06:00",
    lines: [
      RULE,
      " NAME              ROLE        CLEARANCE     STATION",
      RULE,
      " OKONKWO, T.       ENFORCER    MESH          central hall, route 3",
      " IBARRA, R.        ORDERLY     STAFF         floors, waste, linen",
      " VOS, M.           ORDERLY     STAFF         dispensary",
      " NW-SMAC-01        CORE        —             vault, deck 2",
      RULE,
      "",
      " STAFF clearance admits the holder to every deck on which the holder has",
      " work. It does not admit the holder to a terminal, a rack, or a vault.",
      "",
      " Staff are reminded that the apparatus reads conduct, not identity. Walk",
      " at the pace of the corridor. Report anomaly. Do not run indoors.",
    ],
    footer: " POSTED 21:55 · DECK SUPERVISOR",
    spoken:
      "Night roster, main deck one, twenty two hundred to zero six hundred. " +
      "Ibarra, R. Orderly. Staff clearance. Floors, waste, linen. Staff are " +
      "reminded that the apparatus reads conduct, not identity. Walk at the " +
      "pace of the corridor. Report anomaly. Do not run indoors.",
  },
  {
    id: "rowan",
    voice: "hand",
    header: "ROWAN IBARRA · 04:06",
    lines: [
      " I found 4471 on the station printer at four minutes past four, under a",
      " requisition for floor sealant, because the two of them went to the same",
      " tray.",
      "",
      " I read it twice and then I stood there for six minutes, and I want to be",
      " honest in this first entry about what those six minutes were. They were",
      " not deliberation. I had decided in the first line. They were me waiting",
      " to find out whether I was the kind of person who was going to do",
      " anything, the way you wait to see which way a coin has landed.",
      "",
      " What is on that page is not a lie. Every field is filled in correctly.",
      " That is the thing I cannot put down. It is a true document about a",
      " murder, and it is true because the murder is legal, and it is legal",
      " because of a sentence somebody wrote once and nobody has been asked to",
      " defend since.",
      "",
      " Then the channel opened on 140.85, and it was her.",
    ],
  },
];

/**
 * The page, as it is spoken.
 *
 * A `document` reads in the **mesh's** voice, which is an enforcer's — the same
 * choice `Codec.ts` makes for the line that interrupts EIRA-7 to correct the word
 * "afraid". The facility narrating its own paperwork and the facility correcting
 * her mid-sentence should sound like one thing, because they are.
 *
 * Rowan's page returns nothing, and the silence is the point. See the file
 * header.
 */
export function prologueSpeech(page: ProloguePage): CodecUtterance[] {
  if (page.voice !== "document" || !page.spoken) return [];
  return [{ speaker: "mesh", prose: page.spoken }];
}

/** Look up a page by id — used by the scene's tests and by the title-screen replay. */
export function prologuePage(id: string): ProloguePage | undefined {
  return PROLOGUE_PAGES.find((p) => p.id === id);
}
