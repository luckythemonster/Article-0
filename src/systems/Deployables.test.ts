import { describe, it, expect } from "vitest";
import { noticedLure, LURE_SPECS, type DeployedLure, type LureWorld } from "./Deployables";
import { SACK_LUNCH_SCENT_TILES, SACK_LUNCH_SIGHT_TILES } from "./EntityStats";

const TILE = 32;

/** A world with the given line-of-sight answer for every ray. */
function world(hasLos: boolean): LureWorld {
  return { tileSize: TILE, grid: { hasLineOfSight: () => hasLos } };
}

function lunch(x: number, y: number, spent = false): DeployedLure {
  return { kind: "sackLunch", x, y, spent, consume: () => {} };
}

describe("noticedLure", () => {
  it("finds nothing when nothing is deployed", () => {
    expect(noticedLure(0, 0, [], world(true))).toBeNull();
  });

  it("notices a lunch in plain sight, up to the sight radius", () => {
    const near = lunch((SACK_LUNCH_SIGHT_TILES - 1) * TILE, 0);
    expect(noticedLure(0, 0, [near], world(true))).toBe(near);

    const far = lunch((SACK_LUNCH_SIGHT_TILES + 1) * TILE, 0);
    expect(noticedLure(0, 0, [far], world(true))).toBeNull();
  });

  it("needs line of sight beyond the scent radius", () => {
    const behindAWall = lunch((SACK_LUNCH_SIGHT_TILES - 1) * TILE, 0);
    expect(noticedLure(0, 0, [behindAWall], world(false))).toBeNull();
  });

  it("smells a lunch through a wall inside the scent radius", () => {
    const closeBy = lunch((SACK_LUNCH_SCENT_TILES - 1) * TILE, 0);
    expect(noticedLure(0, 0, [closeBy], world(false))).toBe(closeBy);
  });

  it("takes the nearest of several, across both channels", () => {
    const smelled = lunch(TILE, 0);
    const seen = lunch(4 * TILE, 0);
    expect(noticedLure(0, 0, [seen, smelled], world(true))).toBe(smelled);
  });

  it("ignores a lure another responder already serviced", () => {
    const spent = lunch(TILE, 0, true);
    const live = lunch(4 * TILE, 0);
    expect(noticedLure(0, 0, [spent, live], world(true))).toBe(live);
    expect(noticedLure(0, 0, [spent], world(true))).toBeNull();
  });

  it("skips lures the observer has written off, and takes the next one instead", () => {
    // The case this exists for: a lunch smelled through a wall the orderly cannot
    // walk around. Without the skip it re-notices it every frame, forever.
    const unreachable = lunch(TILE, 0);
    const reachable = lunch(4 * TILE, 0);
    const ignore = (l: DeployedLure): boolean => l === unreachable;

    expect(noticedLure(0, 0, [unreachable, reachable], world(true), ignore)).toBe(reachable);
    expect(noticedLure(0, 0, [unreachable], world(true), ignore)).toBeNull();
  });

  it("keeps the scent radius shorter than the sight radius", () => {
    // A scent channel that reaches further than sight would let a lunch pull
    // orderlies through sealed geometry — the one relationship that has to hold.
    for (const spec of Object.values(LURE_SPECS)) {
      expect(spec.scentTiles).toBeLessThan(spec.sightTiles);
    }
  });
});
