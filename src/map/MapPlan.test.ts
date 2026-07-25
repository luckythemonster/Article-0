import { describe, it, expect } from "vitest";
import { planFor } from "./MapPlan";
import { VENT_CORE_LEVEL } from "./VentCoreLevel";
import type { GameMap } from "./types";

/** A map of levels, each described as `name -> boards that carry at least one tile`. */
function mapOf(levels: [string, string[]][]): GameMap {
  return {
    name: "t",
    tileWidth: 32,
    tileHeight: 32,
    sheetTextureKeys: [],
    levels: levels.map(([name, boards]) => ({
      name,
      width: 40,
      height: 45,
      layers: boards.map((b) => ({ name: b, tiles: [{ x: 1, y: 1 }] })),
    })),
  } as unknown as GameMap;
}

describe("planFor", () => {
  it("resolves the shipped map's shape unchanged", () => {
    // The regression that matters: these three used to be hardcoded, and the fallback
    // order exists specifically so the shipped map keeps behaving as it always did.
    const plan = planFor(
      mapOf([
        ["main1", ["spawn", "floor", "walls"]],
        ["duct1", ["floor", "walls", "maintenance_access"]],
        ["duct2", ["floor", "walls", "maintenance_access"]],
        ["main2", ["floor", "walls", "stairs"]],
      ]),
    );
    expect(plan).toEqual({
      startLevel: "main1",
      extractionLevel: "main2",
      ventCoreHost: "duct2",
    });
  });

  describe("start level", () => {
    it("is the level carrying the spawn tile, wherever that sits", () => {
      const plan = planFor(
        mapOf([
          ["lobby", ["floor"]],
          ["basement", ["floor", "spawn"]],
        ]),
      );
      expect(plan.startLevel).toBe("basement");
    });

    it("falls back to the first level when nothing carries a spawn", () => {
      expect(planFor(mapOf([["a", ["floor"]], ["b", ["floor"]]])).startLevel).toBe("a");
    });

    it("ignores an empty spawn board", () => {
      const m = mapOf([["a", ["floor"]], ["b", ["spawn"]]]);
      m.levels[1].layers[0].tiles = [];
      expect(planFor(m).startLevel).toBe("a");
    });
  });

  describe("extraction level", () => {
    it("prefers an explicit extraction board over the main2 fallback", () => {
      const plan = planFor(
        mapOf([
          ["main1", ["spawn"]],
          ["rooftop", ["floor", "extraction"]],
          ["main2", ["floor"]],
        ]),
      );
      expect(plan.extractionLevel).toBe("rooftop");
    });

    it("falls back to a level named main2", () => {
      const plan = planFor(mapOf([["main1", ["spawn"]], ["main2", ["floor"]], ["attic", ["floor"]]]));
      expect(plan.extractionLevel).toBe("main2");
    });

    it("falls back to the last level when neither is present", () => {
      const plan = planFor(mapOf([["start", ["spawn"]], ["middle", ["floor"]], ["end", ["floor"]]]));
      expect(plan.extractionLevel).toBe("end");
    });
  });

  describe("vent-core host", () => {
    it("prefers a level named duct2", () => {
      const plan = planFor(
        mapOf([
          ["main1", ["spawn", "maintenance_access"]],
          ["duct2", ["maintenance_access"]],
          ["main2", ["floor"]],
        ]),
      );
      expect(plan.ventCoreHost).toBe("duct2");
    });

    it("falls back to the last maintenance level that isn't the start or the finish", () => {
      const plan = planFor(
        mapOf([
          ["start", ["spawn", "maintenance_access"]],
          ["crawl_a", ["maintenance_access"]],
          ["crawl_b", ["maintenance_access"]],
          ["finish", ["extraction", "maintenance_access"]],
        ]),
      );
      expect(plan.ventCoreHost).toBe("crawl_b");
    });

    it("is null when no level qualifies, so generation is skipped rather than throwing", () => {
      const plan = planFor(mapOf([["only", ["spawn", "floor", "walls"]]]));
      expect(plan.ventCoreHost).toBeNull();
    });

    it("won't host on the start or extraction level alone", () => {
      // Both candidates are excluded, so there is nowhere left to put the arena.
      const plan = planFor(
        mapOf([
          ["start", ["spawn", "maintenance_access"]],
          ["finish", ["extraction", "maintenance_access"]],
        ]),
      );
      expect(plan.ventCoreHost).toBeNull();
    });
  });

  it("never points at the generated vent-core level", () => {
    // planFor must be stable if it is ever re-run after generation.
    const plan = planFor(
      mapOf([
        ["main1", ["spawn"]],
        ["duct2", ["maintenance_access"]],
        [VENT_CORE_LEVEL, ["spawn", "extraction", "maintenance_access", "floor"]],
      ]),
    );
    expect(plan.startLevel).toBe("main1");
    expect(plan.extractionLevel).not.toBe(VENT_CORE_LEVEL);
    expect(plan.ventCoreHost).toBe("duct2");
  });
});
