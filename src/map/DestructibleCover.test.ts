import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { EdplayLoader, type ParsedMap } from "./EdplayLoader";
import { planFor } from "./MapPlan";
import type { EdPlayFile, GameMap } from "./types";
import { appendDestructibleCover, DESTRUCTIBLE_COVER } from "./DestructibleCover";

/** Integration test on the real shipped map, same convention as VentCoreLevel.test.ts. */
describe("DestructibleCover", () => {
  let parsed: ParsedMap;
  let startLevel: string;

  beforeAll(() => {
    const raw = JSON.parse(
      readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
    ) as EdPlayFile;
    parsed = EdplayLoader.parse(raw, raw.SpriteSheets.map((s) => s.RelativePath));
    startLevel = planFor(parsed.map).startLevel;
    appendDestructibleCover(parsed.map, startLevel);
  });

  it("marks every DESTRUCTIBLE_COVER coordinate destructible on the start level", () => {
    expect(startLevel).toBe("main1");
    const cover = parsed.map.levels.find((l) => l.name === startLevel)!.layers.find(
      (l) => l.name === "cover",
    )!;
    for (const p of DESTRUCTIBLE_COVER) {
      const t = cover.tiles.find(
        (t) =>
          t.x === p.x &&
          t.y === p.y &&
          t.components.some((c) => c.type === "cover" && c.values.Destructible === "true"),
      );
      expect(t).toBeDefined();
      expect(t!.frame).toBeDefined();
    }
  });

  it("leaves the original (non-destructible) tiles at those coordinates in place", () => {
    const cover = parsed.map.levels.find((l) => l.name === startLevel)!.layers.find(
      (l) => l.name === "cover",
    )!;
    for (const p of DESTRUCTIBLE_COVER) {
      const original = cover.tiles.find(
        (t) =>
          t.x === p.x &&
          t.y === p.y &&
          !t.components.some((c) => c.type === "cover" && c.values.Destructible === "true"),
      );
      expect(original).toBeDefined();
    }
  });

  it("reports true for the shipped map", () => {
    expect(appendDestructibleCover(parsed.map, startLevel)).toBe(true);
  });

  it("is idempotent — a second run doesn't duplicate the destructible clones", () => {
    const cover = parsed.map.levels.find((l) => l.name === startLevel)!.layers.find(
      (l) => l.name === "cover",
    )!;
    const before = cover.tiles.length;
    appendDestructibleCover(parsed.map, startLevel);
    expect(cover.tiles.length).toBe(before);
  });

  it("declines rather than throwing when the level or its cover board is missing", () => {
    const bareMap = (): GameMap =>
      ({
        name: "bare",
        tileWidth: 32,
        tileHeight: 32,
        sheetTextureKeys: [],
        levels: [
          {
            name: "only",
            width: 10,
            height: 10,
            layers: [{ name: "floor", tiles: [{ x: 1, y: 1, ref: "f", components: [] }] }],
          },
        ],
      }) as unknown as GameMap;

    const m = bareMap();
    expect(() => appendDestructibleCover(m, "only")).not.toThrow();
    expect(appendDestructibleCover(m, "only")).toBe(false);
    expect(appendDestructibleCover(m, "nonexistent")).toBe(false);
  });
});
