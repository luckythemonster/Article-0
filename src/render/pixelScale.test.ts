import { describe, it, expect } from "vitest";
import { isPixelPerfect, screenPixelsPerSourcePixel } from "./pixelScale";
import { PLAYER_DISPLAY_TILES, PLAYER_SOURCE_SIZE } from "../entities/PlayerAnimations";
import { DRONE_SKIN } from "../entities/DroneAnimations";
import { ENFORCER_SKIN } from "../entities/EnforcerAnimations";

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

  /**
   * The orderly is the last one left, and this says so rather than covering
   * only what passes. It scales inline in `Orderly.ts` rather than through a
   * skin, at 1.5 tiles from 84px art — 1.1429, a fraction. Its frames are being
   * redrawn at 96; when they land, fold it in above and delete this.
   */
  it("has not fixed the orderly yet", () => {
    expect(isPixelPerfect(1.5, 84)).toBe(false);
  });
});
