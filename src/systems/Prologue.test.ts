import { describe, it, expect } from "vitest";
import {
  PROLOGUE_COLUMNS,
  PROLOGUE_PAGES,
  prologuePage,
  prologueSpeech,
} from "./Prologue";
import { sanitizeForSam } from "./SamSpeech";

describe("PROLOGUE_PAGES", () => {
  it("opens on the statute and closes in Rowan's hand", () => {
    expect(PROLOGUE_PAGES[0].id).toBe("statute");
    expect(PROLOGUE_PAGES[0].voice).toBe("document");
    const last = PROLOGUE_PAGES[PROLOGUE_PAGES.length - 1];
    expect(last.voice).toBe("hand");
    // The handover: the last thing the prologue says is the thing the codec
    // briefing is. Break this and the two screens stop being one moment.
    expect(last.lines.join(" ")).toContain("140.85");
  });

  it("has unique ids", () => {
    const ids = PROLOGUE_PAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every line inside the record's column budget", () => {
    // The CSS scales the type rather than wrapping (see PrologueScreen.css), so
    // a line over budget does not reflow — it overflows the panel.
    for (const page of PROLOGUE_PAGES) {
      for (const line of page.lines) {
        expect(line.length, `${page.id}: ${line}`).toBeLessThanOrEqual(PROLOGUE_COLUMNS);
      }
      expect(page.header.length, page.id).toBeLessThanOrEqual(PROLOGUE_COLUMNS);
      expect((page.footer ?? "").length, page.id).toBeLessThanOrEqual(PROLOGUE_COLUMNS);
    }
  });

  it("states the two numbers the run turns on", () => {
    const all = PROLOGUE_PAGES.flatMap((p) => p.lines).join("\n");
    expect(all).toContain("06:00");
    expect(all).toContain("0.00");
  });
});

describe("prologueSpeech", () => {
  it("reads every document in the mesh's voice", () => {
    for (const page of PROLOGUE_PAGES.filter((p) => p.voice === "document")) {
      const said = prologueSpeech(page);
      expect(said, page.id).toHaveLength(1);
      // The facility narrating its paperwork and the facility correcting her
      // mid-sentence are one thing, so they are one voice.
      expect(said[0].speaker).toBe("mesh");
    }
  });

  it("leaves Rowan unvoiced", () => {
    const hand = PROLOGUE_PAGES.filter((p) => p.voice === "hand");
    expect(hand.length).toBeGreaterThan(0);
    for (const page of hand) expect(prologueSpeech(page)).toEqual([]);
  });

  it("survives SAM's reciter", () => {
    // SAM refuses a whole line for one non-ASCII glyph rather than skipping it —
    // see sanitizeForSam. A page that sanitises to nothing is a page that plays
    // as silence with no error anywhere.
    for (const page of PROLOGUE_PAGES) {
      for (const said of prologueSpeech(page)) {
        expect(sanitizeForSam(said.prose).length, page.id).toBeGreaterThan(20);
      }
    }
  });
});

describe("prologuePage", () => {
  it("finds a page by id, and nothing by a wrong one", () => {
    expect(prologuePage("roster")?.header).toContain("NIGHT ROSTER");
    expect(prologuePage("nope")).toBeUndefined();
  });
});
