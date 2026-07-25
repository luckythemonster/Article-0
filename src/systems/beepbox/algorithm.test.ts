import { describe, it, expect } from "vitest";
import { parseAlgorithm, parseFeedback, parseOperatorRatio } from "./algorithm";

describe("parseAlgorithm", () => {
  it("parses a single chain with a multi-operator carrier and modulator group", () => {
    const graph = parseAlgorithm("(1 2)←(3 4)");
    expect(graph.carriers).toEqual([1, 2]);
    expect(graph.modulates.get(3)).toEqual([1, 2]);
    expect(graph.modulates.get(4)).toEqual([1, 2]);
  });

  it("parses independent single-operator chains separated by whitespace", () => {
    const graph = parseAlgorithm("1←3 2←4");
    expect(graph.carriers.sort()).toEqual([1, 2]);
    expect(graph.modulates.get(3)).toEqual([1]);
    expect(graph.modulates.get(4)).toEqual([2]);
  });

  it("treats a bare operator with no arrow as a carrier with no modulators", () => {
    const graph = parseAlgorithm("1");
    expect(graph.carriers).toEqual([1]);
    expect(graph.modulates.size).toBe(0);
  });

  it("chains modulators across more than two groups", () => {
    const graph = parseAlgorithm("1←2←3");
    expect(graph.carriers).toEqual([1]);
    expect(graph.modulates.get(2)).toEqual([1]);
    expect(graph.modulates.get(3)).toEqual([2]);
  });
});

describe("parseFeedback", () => {
  it("parses a single self-feedback operator", () => {
    expect(parseFeedback("4⟲")).toEqual([4]);
  });

  it("parses multiple self-feedback operators", () => {
    expect(parseFeedback("1⟲ 2⟲")).toEqual([1, 2]);
  });

  it("returns an empty array when there is no feedback", () => {
    expect(parseFeedback("none")).toEqual([]);
    expect(parseFeedback("")).toEqual([]);
  });
});

describe("parseOperatorRatio", () => {
  it("parses a plain integer ratio", () => {
    expect(parseOperatorRatio("4×")).toEqual({ ratio: 4, detuned: false });
  });

  it("parses a detuned ratio", () => {
    expect(parseOperatorRatio("~1×")).toEqual({ ratio: 1, detuned: true });
    expect(parseOperatorRatio("~2×")).toEqual({ ratio: 2, detuned: true });
  });
});
