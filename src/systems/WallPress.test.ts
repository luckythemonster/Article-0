import { describe, it, expect } from "vitest";
import { CollisionGrid } from "./CollisionGrid";
import {
  backedAhead,
  cornerLean,
  findSurface,
  resolvePress,
  slideAlong,
  tangentOf,
  type BodyExtent,
} from "./WallPress";
import type { GameLevel } from "../map/types";

/** Builds a level of `size`×`size` with the given wall tiles. */
function level(size: number, walls: { x: number; y: number }[]): GameLevel {
  return {
    name: "t",
    width: size,
    height: size,
    layers: [{ name: "walls", tiles: walls }],
  } as unknown as GameLevel;
}

/** A 7×7 room walled all the way round, open inside. */
function room(): CollisionGrid {
  const walls: { x: number; y: number }[] = [];
  for (let i = 0; i < 7; i++) {
    walls.push({ x: i, y: 0 }, { x: i, y: 6 }, { x: 0, y: i }, { x: 6, y: i });
  }
  return new CollisionGrid(level(7, walls));
}

/**
 * A free-standing wall stub: cells (1,2), (2,2), (3,2) in an otherwise open 8×8.
 * The run ends at x=3, so its east end is a corner to peek round.
 */
function stub(): CollisionGrid {
  return new CollisionGrid(
    level(8, [
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ]),
  );
}

/** Roughly the player's 13×25px body at a 32px tile. */
const BODY: BodyExtent = { halfW: 0.2, halfH: 0.4 };

const NORTH = -Math.PI / 2;
const SOUTH = Math.PI / 2;
const EAST = 0;
const WEST = Math.PI;

describe("findSurface", () => {
  it("finds nothing in open floor", () => {
    expect(findSurface(room(), 3.5, 3.5, BODY, 0.75, NORTH)).toBeNull();
  });

  it("picks the north wall and puts flush one half-height clear of its face", () => {
    const s = findSurface(room(), 3.5, 1.4, BODY, 0.75, NORTH);
    expect(s).not.toBeNull();
    expect([s!.wallX, s!.wallY]).toEqual([3, 0]);
    // Normal points out of the wall, back at the body.
    expect([s!.nx, s!.ny]).toEqual([0, 1]);
    // Face is at y=1 (the wall cell's south edge); flush clears it by halfH.
    expect(s!.flush).toBeCloseTo(1.4);
  });

  it("puts flush on the near side for each of the four faces", () => {
    const g = room();
    expect(findSurface(g, 3.5, 5.6, BODY, 0.75, SOUTH)!.flush).toBeCloseTo(5.6); // wall at y=6
    expect(findSurface(g, 1.2, 3.5, BODY, 0.75, WEST)!.flush).toBeCloseTo(1.2); // wall at x=0
    expect(findSurface(g, 5.8, 3.5, BODY, 0.75, EAST)!.flush).toBeCloseTo(5.8); // wall at x=6
  });

  it("prefers the wall being faced when an inside corner offers two", () => {
    const g = room();
    // Tucked into the north-west corner, within reach of both faces.
    const facingWest = findSurface(g, 1.2, 1.4, BODY, 0.75, WEST);
    expect([facingWest!.wallX, facingWest!.wallY]).toEqual([0, 1]);
    const facingNorth = findSurface(g, 1.2, 1.4, BODY, 0.75, NORTH);
    expect([facingNorth!.wallX, facingNorth!.wallY]).toEqual([1, 0]);
  });

  it("ignores a face further away than the reach", () => {
    // Flush against the north wall is y=1.4, so 1.9 is half a tile short of it
    // while still standing in the cell that neighbours the wall.
    expect(findSurface(room(), 3.5, 1.9, BODY, 0.4, NORTH)).toBeNull();
    expect(findSurface(room(), 3.5, 1.9, BODY, 0.75, NORTH)).not.toBeNull();
  });

  it("only ever considers the four cells touching the body's own", () => {
    // Two rows clear of the north wall: out of range by the grid, not the reach.
    expect(findSurface(room(), 3.5, 2.5, BODY, 5, NORTH)).toBeNull();
  });
});

describe("slideAlong", () => {
  it("keeps the component running along the face and drops the one into it", () => {
    const s = findSurface(room(), 3.5, 1.4, BODY, 0.75, NORTH)!;
    // Pushing north-east against a north wall: the northward half is discarded.
    const moved = slideAlong(s, 1, -1);
    expect(moved.dx).toBeCloseTo(1);
    expect(moved.dy).toBeCloseTo(0);
  });

  it("is signed, so both ways along the face survive", () => {
    const s = findSurface(room(), 3.5, 1.4, BODY, 0.75, NORTH)!;
    expect(slideAlong(s, -1, 0).dx).toBeCloseTo(-1);
  });

  it("returns a tangent perpendicular to the normal", () => {
    const s = findSurface(room(), 3.5, 1.4, BODY, 0.75, NORTH)!;
    const t = tangentOf(s);
    expect(t.x * s.nx + t.y * s.ny).toBeCloseTo(0);
  });
});

describe("backedAhead", () => {
  it("is true while the wall run continues and false once it stops", () => {
    const g = stub();
    // Pressed against the stub's south face, under its east end.
    const s = findSurface(g, 3.5, 3.4, BODY, 0.75, NORTH)!;
    expect([s.wallX, s.wallY]).toEqual([3, 2]);
    const t = tangentOf(s);
    // The tangent runs west, so sign +1 heads back along the wall and −1 heads
    // for its open east end.
    expect(t.x).toBeCloseTo(-1);
    expect(backedAhead(g, s, 3.5, 3.4, BODY, 1)).toBe(true);
    // Still backed just short of the corner, and no longer backed past it.
    expect(backedAhead(g, s, 3.5, 3.4, BODY, -1)).toBe(true);
    expect(backedAhead(g, s, 3.9, 3.4, BODY, -1)).toBe(false);
  });
});

describe("cornerLean", () => {
  it("gives nothing where the wall continues", () => {
    const g = stub();
    const s = findSurface(g, 3.5, 3.4, BODY, 0.75, NORTH)!;
    // +1 runs west, deeper into the stub.
    expect(cornerLean(g, s, 3.5, 3.4, 1, 0.9)).toBeNull();
  });

  it("reaches along the face and round onto the wall's own centre line", () => {
    const g = stub();
    const s = findSurface(g, 3.5, 3.4, BODY, 0.75, NORTH)!;
    const lean = cornerLean(g, s, 3.5, 3.4, -1, 0.9);
    expect(lean).not.toBeNull();
    // East past the end of the wall, and north from y=3.4 onto the wall row's
    // centre line at y=2.5 — that side component is what opens the sightline
    // down the far face.
    expect(lean!.x).toBeCloseTo(0.9);
    expect(lean!.y).toBeCloseTo(-0.9);
  });

  it("lands the eye in open floor past the corner, not inside geometry", () => {
    const g = stub();
    const s = findSurface(g, 3.5, 3.4, BODY, 0.75, NORTH)!;
    const lean = cornerLean(g, s, 3.5, 3.4, -1, 0.9)!;
    expect(g.isBlocked(Math.floor(3.5 + lean.x), Math.floor(3.4 + lean.y))).toBe(false);
  });

  it("leans the same way off a vertical face", () => {
    // A wall column at x=4 spanning rows 2..4. The corner test looks one cell
    // past the wall cell beside the *body*, so standing beside the topmost cell
    // is what makes the north end a corner and the south end not.
    const g = new CollisionGrid(
      level(8, [
        { x: 4, y: 2 },
        { x: 4, y: 3 },
        { x: 4, y: 4 },
      ]),
    );
    // Flush against its west face: x = 4 − halfW.
    const s = findSurface(g, 3.8, 2.5, BODY, 0.75, EAST)!;
    expect([s.wallX, s.wallY]).toEqual([4, 2]);
    const t = tangentOf(s);
    // Tangent runs north, so sign −1 heads south (on down the column) and +1
    // heads for the open end at y=1.
    expect(t.y).toBeCloseTo(-1);
    expect(cornerLean(g, s, 3.8, 2.5, -1, 0.9)).toBeNull();
    const lean = cornerLean(g, s, 3.8, 2.5, 1, 0.9)!;
    expect(lean.y).toBeCloseTo(-0.9);
    // East from x=3.8 onto the column's centre line at x=4.5.
    expect(lean.x).toBeCloseTo(0.7);
  });
});

describe("resolvePress", () => {
  it("composes the face, its tangent and both directions along it", () => {
    const g = stub();
    const p = resolvePress(g, 3.5, 3.4, BODY, 0.75, NORTH, 0.9);
    expect(p).not.toBeNull();
    expect([p!.surface.wallX, p!.surface.wallY]).toEqual([3, 2]);
    expect(p!.tx).toBeCloseTo(-1);
    // West runs on into the stub: travel open, nothing to peek round.
    expect(p!.pos.open).toBe(true);
    expect(p!.pos.lean).toBeNull();
    // East ends at the corner: still room to travel, and a lean waiting there.
    expect(p!.neg.lean).not.toBeNull();
  });

  it("is null with nothing in reach", () => {
    expect(resolvePress(room(), 3.5, 3.5, BODY, 0.75, NORTH, 0.9)).toBeNull();
  });
});
