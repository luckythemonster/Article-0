import { describe, it, expect } from "vitest";
import { initialObjectives, isRunWon, noteTerminalHacked, objectiveLines } from "./Objectives";

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

  it("marks every directive line done once the run is won", () => {
    const s = initialObjectives();
    noteTerminalHacked(s, "log_cache");
    expect(objectiveLines(s, "main2").every((l) => l.done)).toBe(true);
  });
});
