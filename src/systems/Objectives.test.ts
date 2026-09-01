import { describe, it, expect } from "vitest";
import {
  ACTS,
  actForLevel,
  allFeatures,
  canReachRoof,
  initialObjectives,
  isRunWon,
  logsComplete,
  noteCoreSilenced,
  noteTerminalHacked,
  noteUplinkComplete,
  noteVent4Defeated,
  objectiveLines,
  objectiveSummary,
  objectiveSummaryText,
  type MissionFeatures,
} from "./Objectives";
import { OBJECTIVE_MAX_LINES } from "../ui/hudLayout";

/** The extraction level is a parameter, not a constant — any name works. */
const EXTRACTION = "main2";

/** The shipped map's shape: every act present. */
const FULL = allFeatures(EXTRACTION);

/**
 * A map that could furnish nothing past Act I — no crawlspace node, no vault, no roof.
 * The pre-Act-II game, and the fallback every rule here has to keep working for.
 */
const MINIMAL: MissionFeatures = {
  hasVentCore: false,
  hasLogBeta: false,
  hasVault: false,
  hasRoof: false,
  extractionLevel: EXTRACTION,
};

/** Both cache halves aboard, on the full map. */
function bothCaches() {
  const s = initialObjectives();
  noteTerminalHacked(s, "log_cache_alpha");
  noteTerminalHacked(s, "log_cache_beta");
  return s;
}

describe("Objectives", () => {
  it("recovers logs only from a log-cache terminal", () => {
    const s = initialObjectives();
    noteTerminalHacked(s, "door_control");
    expect(s.logsRecovered).toBe(false);
    noteTerminalHacked(s, "log_cache");
    expect(s.logsRecovered).toBe(true);
  });

  it("records which node was breached, and a plain cache as neither", () => {
    const s = initialObjectives();
    noteTerminalHacked(s, "log_cache_alpha");
    expect(s.alphaRecovered).toBe(true);
    expect(s.betaRecovered).toBe(false);
    noteTerminalHacked(s, "log_cache_beta");
    expect(s.betaRecovered).toBe(true);

    const plain = initialObjectives();
    noteTerminalHacked(plain, "log_cache");
    expect(plain.logsRecovered).toBe(true);
    expect(plain.alphaRecovered).toBe(false);
  });

  it("needs both halves where the map has both, and only one where it doesn't", () => {
    const s = initialObjectives();
    noteTerminalHacked(s, "log_cache_alpha");
    expect(logsComplete(s, FULL)).toBe(false);
    expect(logsComplete(s, MINIMAL)).toBe(true);
    noteTerminalHacked(s, "log_cache_beta");
    expect(logsComplete(s, FULL)).toBe(true);
  });

  it("seals the roof until the logs are complete and the Core is down", () => {
    const s = bothCaches();
    expect(canReachRoof(s, FULL)).toBe(false);
    noteCoreSilenced(s);
    expect(canReachRoof(s, FULL)).toBe(true);
  });

  it("lets a map with no vault straight up, rather than sealing the roof forever", () => {
    const noVault: MissionFeatures = { ...FULL, hasVault: false };
    const s = initialObjectives();
    noteTerminalHacked(s, "log_cache_alpha");
    noteTerminalHacked(s, "log_cache_beta");
    expect(canReachRoof(s, noVault)).toBe(true);
  });

  it("is won by the uplink completing, not by standing anywhere", () => {
    const s = bothCaches();
    noteCoreSilenced(s);
    expect(isRunWon(s, "roof_array", FULL)).toBe(false);
    noteUplinkComplete(s);
    expect(isRunWon(s, "roof_array", FULL)).toBe(true);
    // The level no longer enters into it — the run ends where the uplink does.
    expect(isRunWon(s, "main1", FULL)).toBe(true);
  });

  it("falls back to reaching the extraction level when the map has no roof", () => {
    const s = initialObjectives();
    noteTerminalHacked(s, "log_cache");
    expect(isRunWon(s, "main1", MINIMAL)).toBe(false);
    expect(isRunWon(s, EXTRACTION, MINIMAL)).toBe(true);
  });

  it("honours any extraction level, not just the shipped map's", () => {
    const s = initialObjectives();
    noteTerminalHacked(s, "log_cache");
    const elsewhere: MissionFeatures = { ...MINIMAL, extractionLevel: "rooftop" };
    expect(isRunWon(s, "rooftop", elsewhere)).toBe(true);
    expect(isRunWon(s, "main2", elsewhere)).toBe(false);
  });

  it("marks every mandatory directive line done once the run is over", () => {
    const s = bothCaches();
    noteCoreSilenced(s);
    noteUplinkComplete(s);
    const mandatory = objectiveLines(s, "roof_array", FULL).filter(
      (l) => !l.label.startsWith("(Optional)"),
    );
    expect(mandatory.every((l) => l.done)).toBe(true);
  });

  it("tracks VENT-4 as an optional line that never gates the win", () => {
    const s = bothCaches();
    noteCoreSilenced(s);
    const optional = () =>
      objectiveLines(s, "roof_array", FULL).find((l) => l.label.startsWith("(Optional)"))!;
    expect(optional().done).toBe(false);
    noteVent4Defeated(s);
    expect(optional().done).toBe(true);
    expect(isRunWon(s, "roof_array", FULL)).toBe(false);
    noteUplinkComplete(s);
    expect(isRunWon(s, "roof_array", FULL)).toBe(true);
  });

  it("omits lines for acts the map couldn't furnish", () => {
    const lines = objectiveLines(initialObjectives(), "main2", MINIMAL);
    expect(lines.some((l) => l.label.startsWith("(Optional)"))).toBe(false);
    expect(lines.some((l) => l.label.includes("BETA"))).toBe(false);
    expect(lines.some((l) => l.label.includes("NW-SMAC-01"))).toBe(false);
    // Left with the original pair: recover the logs, reach the uplink.
    expect(lines).toHaveLength(2);
  });

  it("never emits more lines than the HUD's vertical budget reserves", () => {
    // `ui/hudLayout.ts` sizes the gap between the directive and the encounter HUDs from
    // this number. They collided once already, when the directive grew from three lines
    // to five; this is what stops a sixth act doing it again silently.
    expect(objectiveLines(initialObjectives(), "main1", FULL).length).toBeLessThanOrEqual(
      OBJECTIVE_MAX_LINES,
    );
  });

  it("lists a line per act on the full map", () => {
    const labels = objectiveLines(initialObjectives(), "main1", FULL).map((l) => l.label);
    expect(labels.some((l) => l.includes("ALPHA"))).toBe(true);
    expect(labels.some((l) => l.includes("BETA"))).toBe(true);
    expect(labels.some((l) => l.includes("NW-SMAC-01"))).toBe(true);
    expect(labels.some((l) => l.includes("rooftop relay"))).toBe(true);
  });

  it("treats a pre-split save (no new flags) as nothing done yet", () => {
    // A v2 save written before any of this existed: only `logsRecovered`.
    const legacy = { logsRecovered: true };
    const lines = objectiveLines(legacy, "main1", FULL);
    expect(lines.find((l) => l.label.startsWith("(Optional)"))!.done).toBe(false);
    expect(lines.find((l) => l.label.includes("ALPHA"))!.done).toBe(false);
    expect(canReachRoof(legacy, FULL)).toBe(false);
    // …and it still completes on a map that never had the extra acts.
    expect(isRunWon(legacy, EXTRACTION, MINIMAL)).toBe(true);
  });
});

/**
 * The HUD's collapsed row.
 *
 * `objectiveSummary` is what let the tracker stop printing the whole directive over
 * the play field, so what it counts is load-bearing: the row is the only objective
 * text on screen most of the time, and a count that disagreed with the list — or a
 * finished run reading `4/5` because the optional act was counted — would be worse
 * than the block it replaced.
 */
describe("objectiveSummary", () => {
  it("counts the mandatory acts only, and never offers the optional one as next", () => {
    const s = bothCaches();
    noteCoreSilenced(s);
    const before = objectiveSummary(s, "roof_array", FULL);
    // ALPHA, BETA, the core, the uplink. VENT-4 is an errand, not an act.
    expect(before.total).toBe(4);
    expect(before.done).toBe(3);
    expect(before.current?.label).toContain("rooftop relay");

    noteVent4Defeated(s);
    const after = objectiveSummary(s, "roof_array", FULL);
    expect(after).toEqual(before);
  });

  it("names the first outstanding act, in order", () => {
    const s = initialObjectives();
    expect(objectiveSummary(s, "main1", FULL).current?.label).toContain("ALPHA");
    noteTerminalHacked(s, "log_cache_alpha");
    expect(objectiveSummary(s, "main1", FULL).current?.label).toContain("BETA");
    noteTerminalHacked(s, "log_cache_beta");
    expect(objectiveSummary(s, "main1", FULL).current?.label).toContain("NW-SMAC-01");
  });

  it("reads n/n with nothing outstanding once the run is won", () => {
    const s = bothCaches();
    noteCoreSilenced(s);
    noteUplinkComplete(s);
    const summary = objectiveSummary(s, "roof_array", FULL);
    expect(summary).toMatchObject({ done: 4, total: 4, complete: true, current: undefined });
    expect(objectiveSummaryText(summary)).toBe("▸ DIRECTIVE 4/4 · COMPLETE");
    // The two agree by construction, and this is the pair that would drift.
    expect(summary.complete).toBe(isRunWon(s, "roof_array", FULL));
  });

  it("counts only what a bare map furnished", () => {
    const summary = objectiveSummary(initialObjectives(), "main1", MINIMAL);
    expect(summary.total).toBe(2);
    expect(objectiveSummaryText(summary)).toBe(
      "▸ DIRECTIVE 0/2 · Recover EIRA-7's logs (breach a log-cache)",
    );
  });
});

describe("actForLevel", () => {
  it("puts every level of the shipped map in an act", () => {
    expect(actForLevel("main1")).toBe(1);
    expect(actForLevel("duct1")).toBe(1);
    expect(actForLevel("duct2")).toBe(1);
    expect(actForLevel("secret1")).toBe(1);
    expect(actForLevel("vent_core")).toBe(2);
    expect(actForLevel("main2")).toBe(3);
    expect(actForLevel("main2vault")).toBe(3);
    expect(actForLevel("secret2")).toBe(3);
    expect(actForLevel("roof_array")).toBe(4);
  });

  it("says nothing about a level it does not recognise", () => {
    // The same courtesy journalIdForLevel extends: a map that does not use our
    // names gets no act cards rather than wrong ones.
    expect(actForLevel("basement")).toBeUndefined();
    expect(actForLevel("")).toBeUndefined();
  });

  it("names every act it can return", () => {
    const levels = ["main1", "vent_core", "main2vault", "roof_array"];
    for (const level of levels) {
      const id = actForLevel(level)!;
      expect(ACTS[id], level).toBeDefined();
      expect(ACTS[id].id).toBe(id);
      expect(ACTS[id].title).toContain("ACT");
    }
  });
});
