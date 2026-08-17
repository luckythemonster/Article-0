/**
 * Text helpers for the type-reference generator.
 *
 * Split out from `generate.ts` because that file runs `main()` on import — the
 * same pure-core / shell split the systems under `src/systems/` use, and for the
 * same reason: it lets these unit-test directly without generating a document as
 * a side effect.
 */

/**
 * Strip `//` and block comments out of a declaration.
 *
 * {@link collapse} flattens a multi-line declaration onto one line, so a line
 * comment left in place would swallow everything after it — the emitted snippet
 * would silently lose the tail of the declaration, which is worse than useless
 * because it still parses as TypeScript. Quotes are tracked so a `//` *inside* a
 * string (a URL, say) survives untouched.
 */
export function stripComments(s: string): string {
  let out = "";
  let quote: string | null = null;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      // Leave the newline itself for collapse() to turn into the joining space.
      while (i < s.length && s[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i += 1;
      i += 2;
      out += " ";
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Flatten a declaration onto one line, comments removed. */
export const collapse = (s: string): string =>
  stripComments(s)
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

/** Cut to `max` characters, marking the cut with an ellipsis. */
export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}
