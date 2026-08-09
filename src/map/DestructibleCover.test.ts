import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { EdplayLoader, type ParsedMap } from "./EdplayLoader";
import { planFor } from "./MapPlan";
import type { EdPlayFile, GameMap, GameTile } from "./types";
import { appendDestructibleCover, DESTRUCTIBLE_COVER } from "./DestructibleCover";

/** A cover tile carrying a real `cover` component, at one of `DESTRUCTIBLE_COVER`'s coordinates. */
function coverTileAt(x: number, y: number): GameTile {
  return {
    x,
    y,
    handle: 1,
    ref: "crate0",
    colSpan: 1,
    rowSpan: 1,
    offsetX: 0,
    offsetY: 0,
    components: [{ type: "cover", values: { type: "LOW", ThermalBleed: "false" } }],
  } as unknown as GameTile;
}

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

  /**
   * NW-SMAC-01's `main1` places its cover as plain art (cardboard boxes, a desk)
   * with no `cover` DataComponent at all — nothing for the `Destructible`
   * override to attach to, and `DESTRUCTIBLE_COVER`'s coordinates are tuned for
   * the old 40×45 map's layout besides. Declining is the correct outcome here,
   * not a workaround: every sibling generator in this codebase declines rather
   * than fabricates when a map can't furnish what it needs.
   */
  it("declines on this map — main1 has no cover tile with a real cover component", () => {
    expect(startLevel).toBe("main1");
    expect(appendDestructibleCover(parsed.map, startLevel)).toBe(false);
  });

  it("leaves main1's cover board untouched", () => {
    const cover = parsed.map.levels.find((l) => l.name === startLevel)!.layers.find(
      (l) => l.name === "cover",
    )!;
    const before = cover.tiles.length;
    appendDestructibleCover(parsed.map, startLevel);
    expect(cover.tiles.length).toBe(before);
    for (const t of cover.tiles) {
      expect(t.components.some((c) => c.type === "cover" && c.values.Destructible === "true")).toBe(
        false,
      );
    }
  });

  /**
   * The real map only exercises the decline path (main1's cover carries no
   * component to clone from), which would let the success path silently rot
   * unnoticed. A small fixture proves the mechanism itself — as opposed to this
   * particular map's ability to furnish it — still works.
   */
  describe("on a level that can furnish real cover", () => {
    function fixtureMap(): GameMap {
      return {
        name: "t",
        tileWidth: 32,
        tileHeight: 32,
        sheetTextureKeys: [],
        levels: [
          {
            name: "start",
            width: 50,
            height: 50,
            layers: [{ name: "cover", tiles: [coverTileAt(1, 1)] }],
          },
        ],
      } as unknown as GameMap;
    }

    it("marks every DESTRUCTIBLE_COVER coordinate destructible, leaving the original in place", () => {
      const map = fixtureMap();
      expect(appendDestructibleCover(map, "start")).toBe(true);
      const cover = map.levels[0].layers.find((l) => l.name === "cover")!;
      for (const p of DESTRUCTIBLE_COVER) {
        const clone = cover.tiles.find(
          (t) =>
            t.x === p.x &&
            t.y === p.y &&
            t.components.some((c) => c.type === "cover" && c.values.Destructible === "true"),
        );
        expect(clone, `(${p.x},${p.y}) destructible clone`).toBeDefined();
        expect(clone!.frame).toBeUndefined(); // the fixture proto carries none — cloned faithfully either way
      }
      // The seed tile at (1,1) is untouched by the clones at DESTRUCTIBLE_COVER's coordinates.
      const seed = cover.tiles.find((t) => t.x === 1 && t.y === 1);
      expect(seed!.components.some((c) => c.values.Destructible === "true")).toBe(false);
    });

    it("is idempotent — a second run doesn't duplicate the clones", () => {
      const map = fixtureMap();
      appendDestructibleCover(map, "start");
      const cover = map.levels[0].layers.find((l) => l.name === "cover")!;
      const before = cover.tiles.length;
      appendDestructibleCover(map, "start");
      expect(cover.tiles.length).toBe(before);
    });

    it("declines when a destructible coordinate is blocked", () => {
      const map = fixtureMap();
      map.levels[0].layers.push({
        name: "walls",
        tiles: DESTRUCTIBLE_COVER.map((p) => coverTileAt(p.x, p.y)),
      });
      expect(appendDestructibleCover(map, "start")).toBe(false);
    });
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
