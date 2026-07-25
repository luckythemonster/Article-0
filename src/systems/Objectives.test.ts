import { describe, it, expect } from "vitest";
import {
  initialObjectives,
  isRunWon,
  noteTerminalHacked,
  noteVent4Defeated,
  objectiveLines,
} from "./Objectives";

/** The extraction level is a parameter now, not a constant — any name works. */
const EXTRACTION = "main2";

describe("Objectives", () => {
  it("recovers logs only from a log-cache terminal", () => {
    const s = initialObjectives();
    noteTerminalHacked(s, "door_control");
    expect(s.logsRecovered).toBe(false);
    noteTerminalHacked(s, "log_cache");
    expect(s.logsRecovered).toBe(true);
  });

  it("is won only with logs recovered and at the extraction level", () => {
    const s = initialObjectives();
    expect(isRunWon(s, "main2", EXTRACTION)).toBe(false);
    noteTerminalHacked(s, "log_cache");
    expect(isRunWon(s, "main1", EXTRACTION)).toBe(false);
    expect(isRunWon(s, "main2", EXTRACTION)).toBe(true);
  });

  it("marks the mandatory directive lines done once the run is won", () => {
    const s = initialObjectives();
    noteTerminalHacked(s, "log_cache");
    const mandatory = objectiveLines(s, "main2", EXTRACTION).filter((l) => !l.label.startsWith("(Optional)"));
    expect(mandatory.every((l) => l.done)).toBe(true);
  });

  it("tracks VENT-4 as an optional line that never gates the win", () => {
    const s = initialObjectives();
    const optional = () => objectiveLines(s, "main2", EXTRACTION).find((l) => l.label.startsWith("(Optional)"))!;
    expect(optional().done).toBe(false);
    noteVent4Defeated(s);
    expect(optional().done).toBe(true);
    // Still not won without the logs; won with them regardless of the boss.
    expect(isRunWon(s, "main2", EXTRACTION)).toBe(false);
    noteTerminalHacked(s, "log_cache");
    expect(isRunWon(s, "main2", EXTRACTION)).toBe(true);
  });

  it("treats a pre-boss save (no vent4 flag) as not silenced", () => {
    const legacy = { logsRecovered: true };
    expect(objectiveLines(legacy, "main1", EXTRACTION).find((l) => l.label.startsWith("(Optional)"))!.done).toBe(false);
  });

  it("honours any extraction level, not just the shipped map's", () => {
    const s = initialObjectives();
    noteTerminalHacked(s, "log_cache");
    expect(isRunWon(s, "rooftop", "rooftop")).toBe(true);
    expect(isRunWon(s, "main2", "rooftop")).toBe(false);
  });

  it("omits the VENT-4 line on a map with no vent core", () => {
    const s = initialObjectives();
    const lines = objectiveLines(s, "main2", EXTRACTION, false);
    expect(lines.some((l) => l.label.startsWith("(Optional)"))).toBe(false);
    // The mandatory pair is untouched, and the win still works without the boss.
    expect(lines).toHaveLength(2);
    noteTerminalHacked(s, "log_cache");
    expect(isRunWon(s, "main2", EXTRACTION)).toBe(true);
  });
});
