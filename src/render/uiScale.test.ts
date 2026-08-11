import { describe, it, expect } from "vitest";
import { UI_ICON_SIZE, UI_ZOOM, isUiPixelPerfect, uiSpriteScale } from "./uiScale";
import { UI_TEXTURES } from "../ui/UiTextures";

/**
 * The UI art's scale guard, the HUD's counterpart to `pixelScale.test.ts`.
 *
 * Two of the four character sprites satisfied the world's rule by accident and two
 * did not, which is why that rule became a function with a test. The UI never had
 * either, and it shows: nine of the ten item icons are 256x256 shown at 32px, a
 * ratio of 0.125 that discards seven of every eight source pixels and picks *which*
 * seven based on where the box lands.
 *
 * So every entry in the manifest is checked here. Adding a panel at 50px to be
 * drawn at 48 fails the build rather than shipping a resampled border.
 */

describe("uiScale", () => {
  it("keeps the HUD unzoomed", () => {
    // `UIScene` exists to be unzoomed; if this ever changes, every ratio below moves.
    expect(UI_ZOOM).toBe(1);
  });

  it("accepts art authored at the size it is displayed", () => {
    expect(uiSpriteScale(32, 32)).toBe(1);
    expect(isUiPixelPerfect(32, 32)).toBe(true);
    // Whole multiples are fine too: a 16px icon shown at 32 is a clean doubling.
    expect(uiSpriteScale(16, 32)).toBe(2);
    expect(isUiPixelPerfect(16, 32)).toBe(true);
  });

  it("rejects the downscale the current item icons use", () => {
    // 256x256 art in a 32px box — the case this guard exists to name.
    expect(uiSpriteScale(256, 32)).toBeCloseTo(0.125);
    expect(isUiPixelPerfect(256, 32)).toBe(false);
  });

  it("rejects a fractional ratio", () => {
    // 1.5x re-snaps which pixels double as the element moves.
    expect(isUiPixelPerfect(32, 48)).toBe(false);
  });

  it("declares every manifest texture at a pixel-perfect size", () => {
    for (const spec of UI_TEXTURES) {
      const display = spec.display ?? spec.size;
      expect(
        isUiPixelPerfect(spec.size, display),
        `${spec.key}: ${spec.size}px art shown at ${display}px is ${uiSpriteScale(
          spec.size,
          display,
        )}x`,
      ).toBe(true);
    }
  });

  it("gives every manifest texture a distinct key and a slice that fits", () => {
    const keys = UI_TEXTURES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const spec of UI_TEXTURES) {
      if (spec.slice === undefined) continue;
      // Two corners plus at least one stretchable pixel between them.
      expect(spec.slice * 2, `${spec.key}`).toBeLessThan(spec.size);
    }
  });

  it("sizes icons at the one size the HUD draws them", () => {
    expect(UI_ICON_SIZE).toBe(32);
  });
});
