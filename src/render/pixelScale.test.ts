import { describe, it, expect } from "vitest";
import { isPixelPerfect, screenPixelsPerSourcePixel } from "./pixelScale";
import { PLAYER_DISPLAY_TILES, PLAYER_SOURCE_SIZE } from "../entities/PlayerAnimations";
import { DRONE_SKIN } from "../entities/DroneAnimations";
import { ENFORCER_SKIN } from "../entities/EnforcerAnimations";
import { ORDERLY_DISPLAY_TILES, ORDERLY_SOURCE_SIZE } from "../entities/OrderlyAnimations";

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
  it("renders the player one source pixel to one screen pixel", () => {
    expect(screenPixelsPerSourcePixel(PLAYER_DISPLAY_TILES, PLAYER_SOURCE_SIZE)).toBe(1);
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
