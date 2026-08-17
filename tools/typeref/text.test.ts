import { describe, it, expect } from "vitest";
import { collapse, stripComments, truncate } from "./text";

describe("stripComments", () => {
  it("drops a comment-only line", () => {
    expect(stripComments("const a = [\n  // why\n  1,\n];")).toBe("const a = [\n  \n  1,\n];");
  });

  it("drops a trailing comment but keeps the code before it", () => {
    expect(stripComments('const a = 1; // set to one')).toBe("const a = 1; ");
  });

  it("keeps a // that lives inside a string — the URL case", () => {
    const src = 'const home = "https://example.com/docs";';
    expect(stripComments(src)).toBe(src);
  });

  it("keeps // inside single quotes and template literals", () => {
    expect(stripComments("const a = 'a//b';")).toBe("const a = 'a//b';");
    expect(stripComments("const a = `a//b`;")).toBe("const a = `a//b`;");
  });

  it("does not mistake an escaped quote for the end of a string", () => {
    const src = 'const a = "she said \\"//\\" out loud";';
    expect(stripComments(src)).toBe(src);
  });

  it("removes a block comment, including one spanning lines", () => {
    expect(stripComments("const /* mid */ a = 1;")).toBe("const   a = 1;");
    expect(stripComments("const a = 1; /* one\ntwo */ const b = 2;")).toBe(
      "const a = 1;   const b = 2;",
    );
  });

  it("leaves code with no comments untouched", () => {
    const src = "export type Dir = 'n' | 's' | 'e' | 'w';";
    expect(stripComments(src)).toBe(src);
  });
});

describe("collapse", () => {
  it("flattens a declaration onto one line", () => {
    expect(collapse("const a = [\n  1,\n  2,\n];")).toBe("const a = [ 1, 2, ];");
  });

  /**
   * The regression this module exists for: a line comment inside a declaration
   * used to swallow everything after it once the declaration was flattened, so
   * the emitted snippet silently lost its tail while still parsing.
   */
  it("keeps the tail of a declaration that contains a line comment", () => {
    const out = collapse('const RUN_KEYS = [\n  "a",\n  // why b matters\n  "b",\n] as const;');
    expect(out).toBe('const RUN_KEYS = [ "a", "b", ] as const;');
    expect(out).not.toContain("//");
    expect(out).toContain('"b"');
  });

  it("still collapses a URL-bearing declaration without eating it", () => {
    expect(collapse('const u = {\n  home: "https://example.com",\n};')).toBe(
      'const u = { home: "https://example.com", };',
    );
  });
});

describe("truncate", () => {
  it("leaves a short string alone", () => {
    expect(truncate("abc", 10)).toBe("abc");
  });

  it("cuts a long string and marks the cut", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcd…");
  });
});
