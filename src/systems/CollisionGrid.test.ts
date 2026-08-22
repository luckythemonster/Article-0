import { describe, it, expect } from "vitest";
import { CollisionGrid, WallBuffer } from "./CollisionGrid";
import type { ComponentData, GameLevel, GameTile } from "../map/types";

/** A 5×5 level with a wall column at x=2 for y=0..2. */
function level(): GameLevel {
  return {
    name: "t",
    width: 5,
    height: 5,
    layers: [{ name: "walls", tiles: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }] }],
  } as unknown as GameLevel;
}

describe("CollisionGrid", () => {
  it("marks wall tiles blocked and treats out-of-bounds as blocked", () => {
    const g = new CollisionGrid(level());
    expect(g.isBlocked(2, 1)).toBe(true);
    expect(g.isBlocked(0, 0)).toBe(false);
    expect(g.isBlocked(-1, 0)).toBe(true);
    expect(g.isBlocked(99, 0)).toBe(true);
  });

  it("blocks line of sight through a wall but not across an open row", () => {
    const g = new CollisionGrid(level());
    expect(g.hasLineOfSight(0, 1, 4, 1)).toBe(false); // crosses the wall at x=2
    expect(g.hasLineOfSight(0, 4, 4, 4)).toBe(true); // open row
  });

  it("clears a tile at runtime with setBlocked", () => {
    const g = new CollisionGrid(level());
    g.setBlocked(2, 1, false);
    expect(g.isBlocked(2, 1)).toBe(false);
    expect(g.hasLineOfSight(0, 1, 4, 1)).toBe(true); // gap now open
  });

  describe("glazing — blocks movement but not sight", () => {
    it("lets sight through a see-through cell while movement stays blocked", () => {
      const g = new CollisionGrid(level());
      g.setBlocked(2, 1, true, true);
      expect(g.isBlocked(2, 1)).toBe(true); // still a physical obstacle
      expect(g.blocksSight(2, 1)).toBe(false);
      expect(g.hasLineOfSight(0, 1, 4, 1)).toBe(true); // you can see across it
      // The neighbouring plain wall is unaffected.
      expect(g.blocksSight(2, 2)).toBe(true);
      expect(g.hasLineOfSight(0, 2, 4, 2)).toBe(false);
    });

    it("blocks sight again when re-registered opaque", () => {
      const g = new CollisionGrid(level());
      g.setBlocked(2, 1, true, true);
      g.setBlocked(2, 1, true, false);
      expect(g.blocksSight(2, 1)).toBe(true);
      expect(g.hasLineOfSight(0, 1, 4, 1)).toBe(false);
    });

    it("drops see-through when the cell is cleared, so a reblock is opaque by default", () => {
      const g = new CollisionGrid(level());
      g.setBlocked(2, 1, true, true);
      g.setBlocked(2, 1, false);
      g.setBlocked(2, 1, true);
      expect(g.blocksSight(2, 1)).toBe(true);
    });

    it("bumps the revision when only the glazing changes", () => {
      const g = new CollisionGrid(level());
      const before = g.revision;
      g.setBlocked(2, 1, true, true); // already blocked, now transparent
      expect(g.revision).toBeGreaterThan(before);
    });

    it("still treats out of bounds as blocking sight", () => {
      const g = new CollisionGrid(level());
      expect(g.blocksSight(-1, 0)).toBe(true);
      expect(g.blocksSight(99, 0)).toBe(true);
    });
  });

  describe("authored footprints", () => {
    /** A 6×6 level whose `walls` board holds one tile, described by span/offset. */
    function paneLevel(t: Partial<GameTile> & { x: number; y: number }): GameLevel {
      return {
        name: "t",
        width: 6,
        height: 6,
        layers: [{ name: "walls", tiles: [{ colSpan: 1, rowSpan: 1, offsetX: 0, offsetY: 0, components: [], ...t }] }],
      } as unknown as GameLevel;
    }

    /** A `glass` component, optionally frosted. */
    function glass(visionBlock = false): ComponentData[] {
      return [{ type: "glass", values: { VisionBlock: visionBlock ? "1" : "0" } }];
    }

    it("blocks every cell a 1×2.5 pane covers, not just the one it is placed on", () => {
      const g = new CollisionGrid(paneLevel({ x: 2, y: 1, rowSpan: 2.5, offsetY: 16 }), ["walls"], 32);
      expect(g.isBlocked(2, 1)).toBe(true);
      expect(g.isBlocked(2, 2)).toBe(true);
      // and nothing beyond it
      expect(g.isBlocked(2, 0)).toBe(false);
      expect(g.isBlocked(2, 3)).toBe(false);
    });

    it("lets sight through every cell of a clear glass pane", () => {
      const level = paneLevel({ x: 2, y: 1, rowSpan: 2.5, offsetY: 16, components: glass() });
      const g = new CollisionGrid(level, ["walls"], 32);
      for (const y of [1, 2]) {
        expect(g.isBlocked(2, y)).toBe(true);
        expect(g.blocksSight(2, y)).toBe(false);
      }
      expect(g.hasLineOfSight(0, 1, 5, 1)).toBe(true);
      expect(g.hasLineOfSight(0, 2, 5, 2)).toBe(true);
    });

    it("treats frosted glazing as a wall — VisionBlock stops sight over the whole pane", () => {
      const level = paneLevel({ x: 2, y: 1, rowSpan: 2.5, offsetY: 16, components: glass(true) });
      const g = new CollisionGrid(level, ["walls"], 32);
      for (const y of [1, 2]) {
        expect(g.isBlocked(2, y)).toBe(true);
        expect(g.blocksSight(2, y)).toBe(true);
      }
      expect(g.hasLineOfSight(0, 1, 5, 1)).toBe(false);
    });

    it("lets an opaque tile win a cell it shares with a pane, whichever is placed first", () => {
      const pane = { x: 2, y: 1, colSpan: 1, rowSpan: 2.5, offsetX: 0, offsetY: 16, components: glass() };
      const wall = { x: 2, y: 2, colSpan: 1, rowSpan: 1, offsetX: 0, offsetY: 0, components: [] };
      for (const tiles of [[pane, wall], [wall, pane]]) {
        const g = new CollisionGrid(
          { name: "t", width: 6, height: 6, layers: [{ name: "walls", tiles }] } as unknown as GameLevel,
          ["walls"],
          32,
        );
        // The pane's own cell still sees through; the shared cell does not.
        expect(g.blocksSight(2, 1)).toBe(false);
        expect(g.blocksSight(2, 2)).toBe(true);
      }
    });

    it("ignores glass on a board that isn't blocking", () => {
      const g = new CollisionGrid(
        {
          name: "t",
          width: 6,
          height: 6,
          layers: [
            { name: "walls", tiles: [{ x: 2, y: 1, colSpan: 1, rowSpan: 1, offsetX: 0, offsetY: 0, components: [] }] },
            { name: "cover", tiles: [{ x: 2, y: 1, colSpan: 1, rowSpan: 1, offsetX: 0, offsetY: 0, components: glass() }] },
          ],
        } as unknown as GameLevel,
        ["walls"],
        32,
      );
      // A decorative pane on a non-blocking board must not punch a sight hole
      // through the wall underneath it.
      expect(g.blocksSight(2, 1)).toBe(true);
    });
  });

  describe("per-tile solid override", () => {
    it("blocks a tile on a non-blocking board when its collisionMode forces it", () => {
      const decorative: GameLevel = {
        name: "t",
        width: 5,
        height: 5,
        layers: [
          {
            name: "props",
            tiles: [
              { x: 3, y: 3, collisionMode: 1 } as unknown as GameTile,
              { x: 4, y: 4 } as unknown as GameTile,
            ],
          },
        ],
      } as unknown as GameLevel;
      // "props" is not in the blocking list — only the forced tile should collide.
      const g = new CollisionGrid(decorative, ["walls"], 32);
      expect(g.isBlocked(3, 3)).toBe(true);
      expect(g.isBlocked(4, 4)).toBe(false);
    });

    it("doesn't need the override on a board that's already blocking", () => {
      // Redundant on this map today (every CollisionMode:1 def sits on `walls`
      // already), and this is the case that proves it: no double-counting, no
      // change in behaviour just because both say solid.
      const g = new CollisionGrid({
        name: "t",
        width: 5,
        height: 5,
        layers: [{ name: "walls", tiles: [{ x: 2, y: 1, collisionMode: 1 } as unknown as GameTile] }],
      } as unknown as GameLevel);
      expect(g.isBlocked(2, 1)).toBe(true);
    });
  });

  describe("padded origin/endpoint cells — precise sight blocking", () => {
    // Mirrors the real turbine-hub support posts: a wall tile whose collider is
    // inset from the bottom, leaving a walkable strip in front of it that shares
    // the tile's own grid cell (2,1). Solid portion: x∈[2,3), y∈[1,1.7).
    function paddedWallLevel(): GameLevel {
      return {
        name: "t",
        width: 6,
        height: 6,
        layers: [
          {
            name: "walls",
            tiles: [
              {
                x: 2,
                y: 1,
                colSpan: 1,
                rowSpan: 1,
                offsetX: 0,
                offsetY: 0,
                components: [],
                collider: { Bottom: 0.3 },
              },
            ],
          },
        ],
      } as unknown as GameLevel;
    }

    /**
     * A wall row at y=1 inset from the bottom by 0.4, as half of `main1`'s
     * walls are: solid y∈[1,1.6), open floor y∈[1.6,2) sharing the same row.
     */
    function paddedWallRow(): GameLevel {
      const tiles: unknown[] = [];
      for (let x = 0; x < 10; x++) {
        tiles.push({
          x,
          y: 1,
          colSpan: 1,
          rowSpan: 1,
          offsetX: 0,
          offsetY: 0,
          components: [],
          collider: { Bottom: 0.4 },
        });
      }
      return {
        name: "t",
        width: 10,
        height: 6,
        layers: [{ name: "walls", tiles }],
      } as unknown as GameLevel;
    }

    it("exposes the tile's precise collider rect, in tile units, for its own cell", () => {
      const g = new CollisionGrid(paddedWallLevel());
      const r = g.paddedRectAt(2, 1);
      expect(r).toBeDefined();
      expect(r!.x).toBeCloseTo(2);
      expect(r!.y).toBeCloseTo(1);
      expect(r!.w).toBeCloseTo(1);
      expect(r!.h).toBeCloseTo(0.7);
    });

    it("returns undefined for a plain wall — the coarse grid is already exact there", () => {
      const g = new CollisionGrid(level()); // the 5x5 plain wall-column fixture
      expect(g.paddedRectAt(2, 1)).toBeUndefined();
    });

    it("blocks sight from a viewer standing in the tile's own walkable margin toward its solid portion", () => {
      const g = new CollisionGrid(paddedWallLevel());
      // Standing at (2.5, 1.9): inside cell (2,1), in the open bottom 30% of the
      // tile. Looking toward (2.5, 0.5) crosses straight through the solid 70%.
      expect(g.hasLineOfSight(2.5, 1.9, 2.5, 0.5)).toBe(false);
    });

    it("does not block sight along the tile's own open margin", () => {
      const g = new CollisionGrid(paddedWallLevel());
      expect(g.hasLineOfSight(2.5, 1.9, 2.5, 4)).toBe(true);
    });

    it("blocks sight when both endpoints share the padded cell and the segment crosses the solid portion", () => {
      const g = new CollisionGrid(paddedWallLevel());
      expect(g.hasLineOfSight(2.1, 1.75, 2.9, 1.05)).toBe(false);
    });

    it("keeps sight open when both endpoints share the padded cell but stay in the open margin", () => {
      const g = new CollisionGrid(paddedWallLevel());
      expect(g.hasLineOfSight(2.1, 1.9, 2.9, 1.75)).toBe(true);
    });

    it("leaves a plain wall's endpoint-skip behaviour untouched — the pre-existing regression case", () => {
      const g = new CollisionGrid(level());
      expect(g.hasLineOfSight(0, 1, 4, 1)).toBe(false); // crosses the plain wall at x=2
    });

    describe("cells the walk steps *through*, not just its endpoints", () => {
      it("sees along the strip of floor the wall leaves in front of its face", () => {
        // Both endpoints sit in the open bottom 40% of the wall's own row, and
        // every cell between them is a wall cell — but none of their solid
        // portions reach down to y=1.8. The walk used to stop at the first one.
        const g = new CollisionGrid(paddedWallRow());
        expect(g.hasLineOfSight(1.5, 1.8, 8.5, 1.8)).toBe(true);
      });

      it("still blocks a segment that crosses a mid-walk wall's solid portion", () => {
        const g = new CollisionGrid(paddedWallRow());
        // From below the row up to above it, well away from either endpoint cell.
        expect(g.hasLineOfSight(1.5, 2.5, 8.5, 0.5)).toBe(false);
      });
    });

    describe("a padded cell that caps a wall run", () => {
      /**
       * main1's east-west doorway, column 14: a north-south wall run whose
       * bottom cap carries `{Bottom: 0.4}`, with open floor either side of it.
       *
       * The padding was authored for a wall in a *horizontal* run, where the
       * bottom 40% really is standable floor in front of the face. Used as the
       * cap of a *vertical* run it points the wrong way: the strip stops being
       * floor-in-front-of-a-wall and becomes a 0.4-tile channel straight
       * through the run, which sight walked clean through.
       */
      function runCapLevel(): GameLevel {
        return {
          name: "t",
          width: 8,
          height: 8,
          layers: [
            {
              name: "walls",
              tiles: [
                { x: 4, y: 1, colSpan: 1, rowSpan: 1, components: [] },
                { x: 4, y: 2, colSpan: 1, rowSpan: 1, components: [] },
                {
                  x: 4,
                  y: 3,
                  colSpan: 1,
                  rowSpan: 1,
                  components: [],
                  collider: { Bottom: 0.4 },
                },
              ],
            },
          ],
        } as unknown as GameLevel;
      }

      it("drops the precise rect, so sight cannot cross the run through the strip", () => {
        const g = new CollisionGrid(runCapLevel());
        // y=3.8 sits in the cap's open bottom 40%. Left and right of column 4
        // are open floor, so before this the ray entered the cell, missed the
        // solid top 60%, and carried straight on into the next room.
        expect(g.hasLineOfSight(2.5, 3.8, 6.5, 3.8)).toBe(false);
        expect(g.paddedRectAt(4, 3)).toBeUndefined();
      });

      it("still blocks the coarse way round — the run itself is unchanged", () => {
        const g = new CollisionGrid(runCapLevel());
        expect(g.hasLineOfSight(2.5, 1.5, 6.5, 1.5)).toBe(false);
        expect(g.blocksSight(4, 3)).toBe(true);
      });

      it("leaves a freestanding padded post precise — it caps no run", () => {
        // The `paddedWallLevel` fixture above: one padded tile, no neighbours.
        // Its open margin is genuinely open on every side, so the rect stays.
        const g = new CollisionGrid(paddedWallLevel());
        expect(g.paddedRectAt(2, 1)).toBeDefined();
        expect(g.hasLineOfSight(1, 1.9, 4, 1.9)).toBe(true);
      });

      it("leaves a padded horizontal run precise — its strip runs along the wall", () => {
        // The case PADDED_WALK_NOTE exists for. The strip is parallel to the
        // run, not across it, so seeing along it must keep working.
        const g = new CollisionGrid(paddedWallRow());
        expect(g.paddedRectAt(4, 1)).toBeDefined();
        expect(g.hasLineOfSight(1.5, 1.8, 8.5, 1.8)).toBe(true);
      });

      it("leaves a wall on the level border precise", () => {
        // Out of bounds reads as blocking, so a border wall looks like it
        // continues a run in every direction. That must not by itself retract
        // the rect, or every edge tile on the map loses its open margin.
        const g = new CollisionGrid(paddedWallRow());
        expect(g.paddedRectAt(0, 1)).toBeDefined();
        expect(g.paddedRectAt(9, 1)).toBeDefined();
      });
    });
  });

  describe("wallsNear", () => {
    /** Every blocked cell in a radius, brute-forced, as sorted "dx,dy" strings. */
    function brute(g: CollisionGrid, cx: number, cy: number, r: number): string[] {
      const out: string[] = [];
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy > r * r) continue;
          if (g.isBlocked(x, y)) out.push(`${dx},${dy}`);
        }
      }
      return out.sort();
    }

    function collect(buf: WallBuffer): string[] {
      const out: string[] = [];
      for (let i = 0; i < buf.count; i++) out.push(`${buf.dx(i)},${buf.dy(i)}`);
      return out.sort();
    }

    it("reports exactly the blocked cells inside the radius", () => {
      const g = new CollisionGrid(level());
      const buf = new WallBuffer();
      g.wallsNear(2.5, 1.5, 3, buf);
      expect(collect(buf)).toEqual(brute(g, 2.5, 1.5, 3));
      expect(buf.count).toBe(3);
    });

    it("excludes walls outside the radius", () => {
      const g = new CollisionGrid(level());
      const buf = new WallBuffer();
      // Far corner: the wall column at x=2 is more than one tile away.
      g.wallsNear(0.5, 4.5, 1, buf);
      expect(buf.count).toBe(0);
    });

    it("picks up a door that closed since the last sweep", () => {
      const g = new CollisionGrid(level());
      const buf = new WallBuffer();
      g.wallsNear(0.5, 0.5, 2, buf);
      const before = buf.count;
      g.setBlocked(1, 1, true);
      buf.clear();
      g.wallsNear(0.5, 0.5, 2, buf);
      expect(buf.count).toBe(before + 1);
    });

    it("appends across calls until cleared, so the caller owns the reset", () => {
      const g = new CollisionGrid(level());
      const buf = new WallBuffer();
      g.wallsNear(2.5, 1.5, 3, buf);
      g.wallsNear(2.5, 1.5, 3, buf);
      expect(buf.count).toBe(6);
      buf.clear();
      expect(buf.count).toBe(0);
    });

    it("grows past its initial capacity without losing points", () => {
      const g = new CollisionGrid(level());
      const buf = new WallBuffer(1); // room for a single point
      g.wallsNear(2.5, 1.5, 3, buf);
      expect(collect(buf)).toEqual(brute(g, 2.5, 1.5, 3));
    });
  });
});
