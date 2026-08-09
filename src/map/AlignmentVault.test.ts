import { describe, it, expect } from "vitest";
import { appendAlignmentVault, VAULT_CORE, VAULT_NODES, VAULT_RACKS } from "./AlignmentVault";
import type { GameLevel, GameMap, GameTile } from "./types";

const tile = (x: number, y: number, ref = "", components: unknown[] = []): GameTile =>
  ({ x, y, ref, handle: 1, colSpan: 1, rowSpan: 1, offsetX: 0, offsetY: 0, components }) as GameTile;

/** A full-floor, walls-ringed level with the prototypes `appendAlignmentVault` needs. */
function hostOf(w: number, h: number): GameLevel {
  const floor: GameTile[] = [];
  const walls: GameTile[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      floor.push(tile(x, y, "floor0"));
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) walls.push(tile(x, y, "wall0"));
    }
  }
  return {
    name: "host",
    width: w,
    height: h,
    layers: [
      { name: "floor", tiles: floor },
      { name: "walls", tiles: walls },
      { name: "terminals", tiles: [tile(1, 1, "terminal0")] },
      { name: "cover", tiles: [tile(1, 1, "cover0")] },
      { name: "light_sources", tiles: [tile(1, 1, "light_source1")] },
    ],
  } as unknown as GameLevel;
}

const mapOf = (level: GameLevel): GameMap =>
  ({ name: "t", tileWidth: 32, tileHeight: 32, sheetTextureKeys: [], levels: [level] }) as unknown as GameMap;

const board = (l: GameLevel, name: string): GameTile[] => l.layers.find((b) => b.name === name)?.tiles ?? [];

describe("appendAlignmentVault — authored layout fits", () => {
  it("uses the fixed coordinates when the host is big enough to hold them", () => {
    // Old shipped-map dimensions, where VAULT_CORE/NODES/RACKS/COVER were hand-picked.
    const host = hostOf(40, 45);
    const map = mapOf(host);
    expect(appendAlignmentVault(map, "host")).toBe(true);
    expect(board(host, "vault_core").map((t) => ({ x: t.x, y: t.y }))).toEqual([VAULT_CORE]);
    expect(board(host, "vault_nodes").map((t) => ({ x: t.x, y: t.y }))).toEqual(VAULT_NODES);
    expect(board(host, "vault_racks").map((t) => ({ x: t.x, y: t.y }))).toEqual(VAULT_RACKS);
  });
});

describe("appendAlignmentVault — derived fallback", () => {
  it("rebuilds the layout around the host's own open floor when the fixed coordinates don't fit", () => {
    // NW-SMAC-01's real main2 shape: 48x36 — VAULT_RACKS/NODES reach y=42/37, off the edge.
    const host = hostOf(48, 36);
    const map = mapOf(host);
    expect(appendAlignmentVault(map, "host")).toBe(true);
    expect(board(host, "vault_core")).toHaveLength(1);
    expect(board(host, "vault_nodes")).toHaveLength(4);
    expect(board(host, "vault_racks")).toHaveLength(4);

    // Every fixture landed inside the level, not on the border wall.
    for (const b of ["vault_core", "vault_nodes", "vault_racks"]) {
      for (const t of board(host, b)) {
        expect(t.x, `${b} x`).toBeGreaterThan(0);
        expect(t.x, `${b} x`).toBeLessThan(host.width - 1);
        expect(t.y, `${b} y`).toBeGreaterThan(0);
        expect(t.y, `${b} y`).toBeLessThan(host.height - 1);
      }
    }
  });

  it("keeps every rack farther from the core than the nearest node", () => {
    // The invariant the whole layout exists for: charging the Shared Field has to cost
    // a walk across the auditing beams, not a step sideways from the core.
    const host = hostOf(48, 36);
    appendAlignmentVault(mapOf(host), "host");
    const core = board(host, "vault_core")[0];
    const dist = (t: GameTile): number => Math.hypot(t.x - core.x, t.y - core.y);
    const nearestNode = Math.min(...board(host, "vault_nodes").map(dist));
    const nearestRack = Math.min(...board(host, "vault_racks").map(dist));
    expect(nearestRack).toBeGreaterThan(nearestNode);
  });

  it("declines rather than throwing when the host has nowhere open at all", () => {
    // Every cell walled — `openCentre` has nothing to average over and returns
    // undefined, the same decline path a level with no floor at all would hit.
    const walls: GameTile[] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) walls.push(tile(x, y));
    const host: GameLevel = {
      name: "sealed",
      width: 3,
      height: 3,
      layers: [
        { name: "walls", tiles: walls },
        { name: "terminals", tiles: [tile(1, 1, "terminal0")] },
        { name: "cover", tiles: [tile(1, 1, "cover0")] },
        { name: "light_sources", tiles: [tile(1, 1, "light_source1")] },
      ],
    } as unknown as GameLevel;
    expect(() => appendAlignmentVault(mapOf(host), "sealed")).not.toThrow();
    expect(appendAlignmentVault(mapOf(host), "sealed")).toBe(false);
  });

  it("finds a degenerate single-point ring when only one cell is open, rather than failing", () => {
    // Real behaviour, not a bug: the outward spiral search can walk back to the one
    // open cell from any ring's ideal point, so a level this cramped gets a
    // one-tile vault instead of none. Documented here so a future tightening of
    // the search radius doesn't silently change this without a test noticing.
    const host: GameLevel = {
      name: "tiny",
      width: 3,
      height: 3,
      layers: [
        {
          name: "walls",
          tiles: [tile(0, 0), tile(1, 0), tile(2, 0), tile(0, 1), tile(2, 1), tile(0, 2), tile(1, 2), tile(2, 2)],
        },
        { name: "terminals", tiles: [tile(1, 1, "terminal0")] },
        { name: "cover", tiles: [tile(1, 1, "cover0")] },
        { name: "light_sources", tiles: [tile(1, 1, "light_source1")] },
      ],
    } as unknown as GameLevel;
    expect(appendAlignmentVault(mapOf(host), "tiny")).toBe(true);
    expect(board(host, "vault_nodes").length).toBeGreaterThan(0);
    expect(board(host, "vault_racks").length).toBeGreaterThan(0);
  });
});

describe("appendAlignmentVault — declines gracefully", () => {
  it("skips a null or missing host without throwing", () => {
    const host = hostOf(40, 45);
    expect(appendAlignmentVault(mapOf(host), null)).toBe(false);
    expect(appendAlignmentVault(mapOf(host), "nonexistent")).toBe(false);
  });

  it("is idempotent, keyed on the vault_core board already having content", () => {
    const host = hostOf(48, 36);
    const map = mapOf(host);
    appendAlignmentVault(map, "host");
    const before = board(host, "vault_core").length;
    expect(appendAlignmentVault(map, "host")).toBe(true);
    expect(board(host, "vault_core")).toHaveLength(before);
  });
});
