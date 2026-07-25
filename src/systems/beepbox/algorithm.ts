/**
 * Parses BeepBox FM algorithm/feedback/ratio strings. An algorithm groups
 * operators into chains of the form `group←group←group`, chains separated by
 * whitespace, a group being either a bare operator number or a
 * parenthesized, space-separated list of them — e.g. `"(1 2)←(3 4)"` (3 and 4
 * both modulate 1 and 2, which are the audible carriers) or `"1←3 2←4"` (two
 * independent 2-operator chains).
 */

export interface AlgorithmGraph {
  /** Operator indices (1-based, matching operators[] position) summed to produce audible output. */
  carriers: number[];
  /** Operator index -> the operator indices whose frequency it modulates. */
  modulates: Map<number, number[]>;
}

function splitTopLevel(s: string, isSeparator: (ch: string) => boolean): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth === 0 && isSeparator(ch)) {
      if (current.length > 0) parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

function parseGroup(group: string): number[] {
  const trimmed = group.trim();
  const inner = trimmed.startsWith("(") && trimmed.endsWith(")") ? trimmed.slice(1, -1) : trimmed;
  return inner
    .trim()
    .split(/\s+/)
    .filter((s) => s.length > 0)
    .map(Number);
}

export function parseAlgorithm(algorithm: string): AlgorithmGraph {
  const carriers = new Set<number>();
  const modulates = new Map<number, number[]>();
  const chains = splitTopLevel(algorithm.trim(), (ch) => /\s/.test(ch));
  for (const chain of chains) {
    const groups = splitTopLevel(chain, (ch) => ch === "←").map(parseGroup);
    if (groups.length === 0) continue;
    for (const op of groups[0]) carriers.add(op);
    for (let i = 1; i < groups.length; i++) {
      const targets = groups[i - 1];
      for (const modOp of groups[i]) {
        const existing = modulates.get(modOp) ?? [];
        existing.push(...targets);
        modulates.set(modOp, existing);
      }
    }
  }
  return { carriers: [...carriers].sort((a, b) => a - b), modulates };
}

/** `"4⟲"` -> [4]; `"1⟲ 2⟲"` -> [1, 2]; `""`/`"none"` -> []. */
export function parseFeedback(feedbackType: string): number[] {
  const matches = feedbackType.match(/\d+(?=⟲)/g);
  return matches ? matches.map(Number) : [];
}

export interface OperatorRatio {
  ratio: number;
  /** Marked with a leading `~` — a slightly detuned/fixed variant of the same ratio. */
  detuned: boolean;
}

/** `"4×"` -> {ratio: 4}; `"~1×"` -> {ratio: 1, detuned: true}. */
export function parseOperatorRatio(frequency: string): OperatorRatio {
  const detuned = frequency.trim().startsWith("~");
  const cleaned = frequency.replace("~", "").replace("×", "").trim();
  const ratio = Number(cleaned);
  return { ratio, detuned };
}
