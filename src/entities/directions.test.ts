import { describe, it, expect } from "vitest";
import { DIRS_8, angleOf, directionOf, nearestDirection, type Dir8 } from "./directions";

/**
 * The two halves of the direction table have to agree.
 *
 * `CastArt` draws each character once per direction, at `angleOf(dir)`; every
 * entity snaps its live heading back with `nearestDirection`. If those two ever
 * disagreed, a character would be drawn facing one way and play the clip for
 * another — quietly, and only at some angles.
 */
describe("angleOf", () => {
  it("round-trips through nearestDirection for all eight", () => {
    for (const dir of DIRS_8) {
      expect(nearestDirection(angleOf(dir)), dir).toBe(dir);
    }
  });

  it("puts east at 0 and runs clockwise in screen space (+y is south)", () => {
    expect(angleOf("east")).toBe(0);
    expect(angleOf("south")).toBeCloseTo(Math.PI / 2);
    expect(angleOf("west")).toBeCloseTo(Math.PI);
    // A unit vector built from the angle points the way the name says.
    for (const [dir, dx, dy] of [
      ["east", 1, 0],
      ["south", 0, 1],
      ["west", -1, 0],
      ["north", 0, -1],
    ] as [Dir8, number, number][]) {
      expect(Math.cos(angleOf(dir)), `${dir} x`).toBeCloseTo(dx);
      expect(Math.sin(angleOf(dir)), `${dir} y`).toBeCloseTo(dy);
    }
  });

  it("agrees with directionOf on the vector it describes", () => {
    for (const dir of DIRS_8) {
      const a = angleOf(dir);
      expect(directionOf(Math.cos(a), Math.sin(a)), dir).toBe(dir);
    }
  });
});
