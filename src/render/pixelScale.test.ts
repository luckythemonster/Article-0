import { describe, it, expect } from "vitest";
import { isPixelPerfect, screenPixelsPerSourcePixel, snapToPixel } from "./pixelScale";
import { PLAYER_DISPLAY_TILES, PLAYER_SOURCE_SIZE } from "../entities/PlayerAnimations";
import { DRONE_SKIN } from "../entities/DroneAnimations";
import { ENFORCER_SKIN } from "../entities/EnforcerAnimations";
import { ORDERLY_DISPLAY_TILES, ORDERLY_SOURCE_SIZE } from "../entities/OrderlyAnimations";
import { assertVfxScales, vfxScales } from "../entities/Vfx";
import {
  assertEntitySpriteScales,
  assertEntitySpriteSizes,
  entitySpriteScales,
} from "../entities/EntitySprites";

describe("screenPixelsPerSourcePixel", () => {
  it("is the sprite scale times the camera zoom", () => {
    // 32px tiles, shown 1.5 tiles tall from 96px art, doubled by the camera.
    expect(screenPixelsPerSourcePixel(1.5, 96)).toBe(1);
    expect(screenPixelsPerSourcePixel(1.5, 48)).toBe(2);
  });

  it("recognises a fraction as not pixel-perfect", () => {
    // The player's old pairing. Most source pixels get one screen pixel and
    // every eleventh gets two, which crawls as the camera pans.
    expect(screenPixelsPerSourcePixel(1.5, 88)).toBeCloseTo(1.0909, 4);
    expect(isPixelPerfect(1.5, 88)).toBe(false);
  });

  it("recognises a downscale as not pixel-perfect", () => {
    // The drone's old pairing — below 1, so pixels are discarded outright.
    expect(screenPixelsPerSourcePixel(0.75, 85)).toBeCloseTo(0.5647, 4);
    expect(isPixelPerfect(0.75, 85)).toBe(false);
  });
});

describe("the shipped character sprites", () => {
  it("renders the player two screen pixels to one source pixel", () => {
    // Deliberately chunkier than the others: the player's source art is
    // adopted at its own native 48px rather than redrawn to a finer canvas,
    // so its source pixels are visibly bigger on screen. Still a whole
    // number, so still crisp — see PLAYER_SOURCE_SIZE.
    expect(screenPixelsPerSourcePixel(PLAYER_DISPLAY_TILES, PLAYER_SOURCE_SIZE)).toBe(2);
  });

  it("renders the drone one source pixel to one screen pixel", () => {
    expect(screenPixelsPerSourcePixel(DRONE_SKIN.displayTiles, DRONE_SKIN.sourceSize)).toBe(1);
  });

  it("renders the enforcer one source pixel to one screen pixel", () => {
    expect(screenPixelsPerSourcePixel(ENFORCER_SKIN.displayTiles, ENFORCER_SKIN.sourceSize)).toBe(1);
  });

  it("renders the orderly one source pixel to one screen pixel", () => {
    expect(screenPixelsPerSourcePixel(ORDERLY_DISPLAY_TILES, ORDERLY_SOURCE_SIZE)).toBe(1);
  });

  /**
   * The point of the whole exercise, asserted in one place.
   *
   * All four started out failing this — the player at 1.0909, the drone at
   * 0.5647, the enforcer at 1.5333, the orderly at 1.1429 — and every one needed
   * its art redrawn at a size that pairs with its display height. None could be
   * corrected by changing the numbers alone.
   *
   * This iterates the cast rather than listing assertions, so a fifth character
   * is held to the same rule without anyone remembering to add a case, and the
   * failure names who broke it.
   */
  it("resamples nothing", () => {
    const cast: [string, number, number][] = [
      ["player", PLAYER_DISPLAY_TILES, PLAYER_SOURCE_SIZE],
      ["drone", DRONE_SKIN.displayTiles, DRONE_SKIN.sourceSize],
      ["enforcer", ENFORCER_SKIN.displayTiles, ENFORCER_SKIN.sourceSize],
      ["orderly", ORDERLY_DISPLAY_TILES, ORDERLY_SOURCE_SIZE],
    ];
    const resampling = cast.filter(([, tiles, size]) => !isPixelPerfect(tiles, size));
    expect(resampling.map(([name]) => name)).toEqual([]);
  });
});

describe("the one-shot effects", () => {
  /**
   * Effects are held to the same rule as the characters.
   *
   * They are easier to get wrong: the frames come from third-party packs (or,
   * for `electricity`, a hand-drawn `.aseprite` source — see
   * `tools/vfx/build_vfx.py`) at whatever size the artist drew them, so the
   * display height has to be picked to suit each one rather than a house
   * standard. One more pack sits unused in `public/assets/vfx/` at 512px —
   * sixteen tiles across — precisely because no sane display height rescues
   * it without a redraw.
   */
  it("resamples nothing", () => {
    expect(assertVfxScales()).toEqual([]);
  });

  it("covers every effect that ships", () => {
    // Guards against the check above passing because the list is empty.
    expect(vfxScales().map((v) => v.id).sort()).toEqual([
      "electricity",
      "electronics-spark",
      "emp-blast",
      "impact",
      "smoke-plume",
    ]);
  });
});

describe("the hand-drawn entity sprites", () => {
  /**
   * The terminal, substation, camera and breaker are held to the cast's rule.
   *
   * These are the easiest of the three groups to get wrong, because their
   * display size is not a free choice: it is the footprint the map already
   * gives the object, so the *art* has to be drawn to divide into it. The
   * substation is the one that shows why 16px isn't a house standard — its
   * map tile is the same whole-tile/half-tile pair as the terminal's, but it
   * is still 32px art, so a redraw of one doesn't force a redraw of the other.
   */
  it("resamples nothing", () => {
    expect(assertEntitySpriteScales()).toEqual([]);
  });

  it("covers every sprite that ships", () => {
    // Guards against the check above passing because the list is empty.
    expect(entitySpriteScales().map((s) => s.id).sort()).toEqual([
      "breaker",
      "security-camera",
      "terminal",
      "terminal-substation",
    ]);
  });

  it("agrees with the build tool about every frame size", () => {
    // `sourceSize` here and `Spec.size` in tools/sprites/build_sprites.py are
    // two hand-written copies of one number, in two languages. A redraw at a
    // new canvas moves one and not the other, and everything downstream — the
    // loader's frameWidth, the strip's geometry, the rule above — assumes they
    // match.
    expect(assertEntitySpriteSizes()).toEqual([]);
  });

  it("pairs each sprite to a whole number of screen pixels at every footprint", () => {
    const byId = new Map(entitySpriteScales().map((s) => [s.id, s]));
    const ratios = (id: string): number[] => {
      const s = byId.get(id);
      if (!s) throw new Error(`no entity sprite ${id}`);
      return s.displayTiles.map((t) => screenPixelsPerSourcePixel(t, s.sourceSize));
    };
    // The map gives terminals both a whole tile and a half one. The substation
    // is still 32px art and survives both at 2 screen pixels per source pixel,
    // and 1; the terminal was redrawn at 16px and survives both at 4, and 2.
    expect(ratios("terminal")).toEqual([4, 2]);
    expect(ratios("terminal-substation")).toEqual([2, 1]);
    // 16px art across a whole tile — the chunkiest thing in the world, but a
    // whole number, so still reproduced rather than resampled.
    expect(ratios("security-camera")).toEqual([4]);
    // 16px art at the half tile `breaker_main1` is authored at.
    expect(ratios("breaker")).toEqual([2]);
  });
});

describe("snapToPixel", () => {
  it("floors to whole world pixels, matching how Phaser places sprites", () => {
    expect(snapToPixel(100, 200)).toEqual({ x: 100, y: 200 });
    expect(snapToPixel(100.4, 200.6)).toEqual({ x: 100, y: 200 });
    expect(snapToPixel(100.999, 200.999)).toEqual({ x: 100, y: 200 });
  });

  it("floors rather than rounds, so it agrees with Camera.preRender", () => {
    // Rounding would send .5 up and .6 to the next pixel, putting the darkness back
    // on a different lattice from the camera — which is the whole bug.
    expect(snapToPixel(10.5, 10.5)).toEqual({ x: 10, y: 10 });
    expect(snapToPixel(10.6, 10.6)).toEqual({ x: 10, y: 10 });
  });

  it("floors toward negative infinity past the west and north edges", () => {
    expect(snapToPixel(-0.2, -0.2)).toEqual({ x: -1, y: -1 });
    expect(snapToPixel(-1, -1)).toEqual({ x: -1, y: -1 });
  });

  it("is stable — snapping an already-snapped point changes nothing", () => {
    const once = snapToPixel(412.37, 88.91);
    expect(snapToPixel(once.x, once.y)).toEqual(once);
  });

  it("advances by whole pixels across a smooth sweep, never fractionally", () => {
    // What the recast key relies on: the snapped origin only ever changes in whole
    // steps, so an exact comparison is a complete test for "the fan would differ".
    let prev = snapToPixel(0, 0);
    for (let i = 1; i <= 400; i++) {
      const next = snapToPixel(i * 0.37, 0);
      expect(Number.isInteger(next.x)).toBe(true);
      expect(next.x - prev.x).toBeLessThanOrEqual(1);
      expect(next.x).toBeGreaterThanOrEqual(prev.x);
      prev = next;
    }
  });
});
