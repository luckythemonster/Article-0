import { describe, it, expect } from "vitest";
import {
  initialObjectives,
  isRunWon,
  noteTerminalHacked,
  noteVent4Defeated,
  objectiveLines,
} from "./Objectives";

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
    expect(isRunWon(s, "main2")).toBe(false);
    noteTerminalHacked(s, "log_cache");
    expect(isRunWon(s, "main1")).toBe(false);
    expect(isRunWon(s, "main2")).toBe(true);
  });

  it("marks the mandatory directive lines done once the run is won", () => {
    const s = initialObjectives();
    noteTerminalHacked(s, "log_cache");
    const mandatory = objectiveLines(s, "main2").filter((l) => !l.label.startsWith("(Optional)"));
    expect(mandatory.every((l) => l.done)).toBe(true);
  });

  it("tracks VENT-4 as an optional line that never gates the win", () => {
    const s = initialObjectives();
    const optional = () => objectiveLines(s, "main2").find((l) => l.label.startsWith("(Optional)"))!;
    expect(optional().done).toBe(false);
    noteVent4Defeated(s);
    expect(optional().done).toBe(true);
    // Still not won without the logs; won with them regardless of the boss.
    expect(isRunWon(s, "main2")).toBe(false);
    noteTerminalHacked(s, "log_cache");
    expect(isRunWon(s, "main2")).toBe(true);
  });

  it("treats a pre-boss save (no vent4 flag) as not silenced", () => {
    const legacy = { logsRecovered: true };
    expect(objectiveLines(legacy, "main1").find((l) => l.label.startsWith("(Optional)"))!.done).toBe(false);
  });
});
