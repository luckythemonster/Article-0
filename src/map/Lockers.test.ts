import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { EdplayLoader, type ParsedMap } from "./EdplayLoader";
import { planFor } from "./MapPlan";
import { indexEntities, indexFixtures } from "./EntityIndex";
import { appendLockers, LOCKER_BOARD, MAIN1_LOCKERS } from "./Lockers";
import { blockedTiles } from "./generate";
import type { EdPlayFile, GameLevel, GameMap } from "./types";

/** What the engine's own generators file by name — mirrors `LevelBuilder`. */
const LEGACY = new Set(["spawn", "enforcers", "drones", "orderlies", "security", "items", "doors"]);

describe("appendLockers — somewhere to put a body", () => {
  let parsed: ParsedMap;
  let start: string;

  const fresh = (): GameMap => {
    const raw = JSON.parse(
      readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
    ) as EdPlayFile;
    return EdplayLoader.parse(raw, raw.SpriteSheets.map((s) => s.RelativePath)).map;
  };

  beforeAll(() => {
    const raw = JSON.parse(
      readFileSync(new URL("../../public/assets/edplay.json", import.meta.url), "utf8"),
    ) as EdPlayFile;
    parsed = EdplayLoader.parse(raw, raw.SpriteSheets.map((s) => s.RelativePath));
    start = planFor(parsed.map).startLevel;
  });

  const levelOf = (map: GameMap): GameLevel => map.levels.find((l) => l.name === start)!;

  it("places every locker on the shipped map", () => {
    const map = fresh();
    expect(appendLockers(map, start)).toBe(true);
    const board = levelOf(map).layers.find((l) => l.name === LOCKER_BOARD);
    expect(board?.tiles.map((t) => ({ x: t.x, y: t.y }))).toEqual([...MAIN1_LOCKERS]);
  });

  it("keeps every one of them off a wall", () => {
    // The failure `DestructibleCover` documents: its constants were tuned for a
    // 40x45 map, this one is 36x18, and every coordinate now lands off the level.
    // These were measured against the map as shipped, and this is what says so.
    const level = levelOf(parsed.map);
    const blocked = blockedTiles(level);
    for (const p of MAIN1_LOCKERS) {
      expect(p.x).toBeLessThan(level.width);
      expect(p.y).toBeLessThan(level.height);
      expect(blocked.has(`${p.x},${p.y}`)).toBe(false);
    }
  });

  it("is idempotent — a second run adds nothing", () => {
    const map = fresh();
    appendLockers(map, start);
    appendLockers(map, start);
    const board = levelOf(map).layers.find((l) => l.name === LOCKER_BOARD);
    expect(board?.tiles).toHaveLength(MAIN1_LOCKERS.length);
  });

  it("hands them to the index, claimed so the bake skips them", () => {
    const map = fresh();
    appendLockers(map, start);
    const level = levelOf(map);
    const index = indexEntities(level, LEGACY);
    indexFixtures(level, index);
    expect(index.lockers).toHaveLength(MAIN1_LOCKERS.length);
    // Claimed or the tile is drawn twice — once into the level texture and once
    // as the locker's own sprite.
    expect(index.lockers.every((t) => index.claimed.has(t))).toBe(true);
  });

  it("does nothing at all on a level that isn't there", () => {
    expect(appendLockers(fresh(), "no_such_level")).toBe(false);
  });
});
