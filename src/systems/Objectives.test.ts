import { describe, it, expect } from "vitest";
import {
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
