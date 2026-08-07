import { describe, it, expect } from "vitest";
import { FOOT_WIDEN, shadowShapeFor } from "./shadowShape";
import type { SpriteCollider } from "../entities/generated/playerCollider";
import { PLAYER_IDLE_SOUTH_COLLIDER } from "../entities/generated/playerCollider";
import { ORDERLY_IDLE_SOUTH_COLLIDER } from "../entities/generated/orderlyCollider";
import { PLAYER_DISPLAY_TILES } from "../entities/PlayerAnimations";
import { ORDERLY_DISPLAY_TILES } from "../entities/OrderlyAnimations";
import { ENFORCER_SKIN } from "../entities/EnforcerAnimations";
import { DRONE_SKIN } from "../entities/DroneAnimations";
import { DEFAULT_TILE_SIZE } from "./pixelScale";

const TILE = DEFAULT_TILE_SIZE;

/** A synthetic collider, so the arithmetic can be checked against known numbers. */
function collider(aabb: SpriteCollider["aabb"], frameSize: number): SpriteCollider {
  return {
    source: "test",
    frameWidth: frameSize,
    frameHeight: frameSize,
    epsilon: 2,
    inset: 0,
    aabb,
    polygon: [],
    polygonFlat: [],
    matterPath: "",
  };
}

describe("shadowShapeFor", () => {
  it("recovers the sprite's own scale from the frame size", () => {
    // A silhouette filling the whole frame, drawn at 1 tile: scale is 32/64 = 0.5,
    // so the half-width is 32 * 0.5 before the widen, and the feet are 32 * 0.5 down.
    const c = collider({ width: 64, height: 64, offsetX: 0, offsetY: 0 }, 64);
    const s = shadowShapeFor(c, 1, TILE);
    expect(s.radiusPx / FOOT_WIDEN).toBeCloseTo(16, 6);
    expect(s.footOffsetPx).toBeCloseTo(16, 6);
  });

  it("scales linearly with tile size", () => {
    const c = collider({ width: 40, height: 40, offsetX: 4, offsetY: 4 }, 64);
    const small = shadowShapeFor(c, 1.5, 16);
    const large = shadowShapeFor(c, 1.5, 32);
    expect(large.radiusPx).toBeCloseTo(small.radiusPx * 2, 6);
    expect(large.footOffsetPx).toBeCloseTo(small.footOffsetPx * 2, 6);
  });

  it("puts the shadow above centre for art whose silhouette sits high in the frame", () => {
    // Bottom of the box at y=24 in a 64px frame — well above the centre line at 32.
    const c = collider({ width: 20, height: 10, offsetX: 22, offsetY: 14 }, 64);
    expect(shadowShapeFor(c, 1, TILE).footOffsetPx).toBeLessThan(0);
  });

  it("ignores horizontal padding entirely", () => {
    // Same silhouette, shifted left and right in the frame: only offsetX differs.
    const left = shadowShapeFor(collider({ width: 20, height: 40, offsetX: 2, offsetY: 12 }, 64), 1, TILE);
    const right = shadowShapeFor(collider({ width: 20, height: 40, offsetX: 42, offsetY: 12 }, 64), 1, TILE);
    expect(right).toEqual(left);
  });

  describe("the shipped cast", () => {
    // Every one of these is a real traced silhouette, so these numbers move if the art
    // does. That is the point — they are here to catch a regeneration quietly resizing
    // somebody's shadow, not to freeze a design decision.
    const cast = [
      { who: "player", shape: shadowShapeFor(PLAYER_IDLE_SOUTH_COLLIDER, PLAYER_DISPLAY_TILES, TILE) },
      { who: "enforcer", shape: shadowShapeFor(ENFORCER_SKIN.collider, ENFORCER_SKIN.displayTiles, TILE) },
      { who: "drone", shape: shadowShapeFor(DRONE_SKIN.collider, DRONE_SKIN.displayTiles, TILE) },
      { who: "orderly", shape: shadowShapeFor(ORDERLY_IDLE_SOUTH_COLLIDER, ORDERLY_DISPLAY_TILES, TILE) },
    ];

    it.each(cast)("sizes $who to something that fits a tile", ({ shape }) => {
      // A shadow wider than the tile the character stands on would overhang into the
      // walls of the one-tile crawlways `duct1` is built from.
      expect(shape.radiusPx).toBeGreaterThan(0);
      expect(shape.radiusPx * 2).toBeLessThanOrEqual(TILE);
    });

    it.each(cast)("puts $who's shadow below the sprite centre, within the sprite", ({ shape }) => {
      // Feet are below the middle of the art for all four, and never further down than
      // a tile — anything more means the offset is being read off the wrong axis.
      expect(shape.footOffsetPx).toBeGreaterThan(0);
      expect(shape.footOffsetPx).toBeLessThan(TILE);
    });

    it("gives the bulkiest guard the widest shadow", () => {
      const byName = Object.fromEntries(cast.map((c) => [c.who, c.shape]));
      expect(byName.enforcer.radiusPx).toBeGreaterThan(byName.player.radiusPx);
      expect(byName.player.radiusPx).toBeGreaterThan(byName.orderly.radiusPx);
    });

    it("sits the drone's shadow highest, since it is drawn low in its frame", () => {
      const byName = Object.fromEntries(cast.map((c) => [c.who, c.shape]));
      expect(byName.drone.footOffsetPx).toBeLessThan(byName.enforcer.footOffsetPx);
    });
  });
});
