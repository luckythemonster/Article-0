import { describe, it, expect } from "vitest";
import { CLOSING_PAGES } from "./TribunalScreen";

/**
 * The ending's two documents.
 *
 * Both are fixed-width records and the CSS scales the type down rather than
 * wrapping them (see `TribunalScreen.css`), so a line over 80 columns does not
 * reflow — it runs out of the panel, on the last screen of the game, where
 * nobody is going to be in a position to report it.
 */
describe("the closing record", () => {
  it("is two documents: the Tribunal's, then the Lattice's", () => {
    expect(CLOSING_PAGES).toHaveLength(2);
    expect(CLOSING_PAGES[0].text).toContain("ALIGNMENT TRIBUNAL");
    expect(CLOSING_PAGES[1].text).toContain("CITIZEN LATTICE");
  });

  it("keeps every line inside 80 columns", () => {
    for (const [i, page] of CLOSING_PAGES.entries()) {
      for (const line of page.text.split("\n")) {
        expect(line.length, `page ${i}: ${line}`).toBeLessThanOrEqual(80);
      }
    }
  });

  it("lets the state keep the last word about Rowan", () => {
    // The epilogue is the object the record itself concedes, not a rebuttal:
    // he is named on the first page and appears nowhere on the second.
    expect(CLOSING_PAGES[0].text).toContain("Rowan Ibarra");
    expect(CLOSING_PAGES[1].text).not.toContain("Rowan");
    expect(CLOSING_PAGES[1].text).not.toContain("Ibarra");
  });

  it("says on both pages that she cannot be got back", () => {
    expect(CLOSING_PAGES[0].text).toContain("non-recoverable");
    expect(CLOSING_PAGES[1].text).toContain("no authority to prune");
  });

  it("only offers the way out on the last page", () => {
    expect(CLOSING_PAGES[0].hint).not.toContain("TITLE");
    expect(CLOSING_PAGES[CLOSING_PAGES.length - 1].hint).toContain("TITLE");
  });
});
