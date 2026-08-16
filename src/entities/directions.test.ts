import { describe, it, expect } from "vitest";
import {
  DIRS_8,
  angleOf,
  directionOf,
  nearestCardinal,
  nearestDirection,
  type Dir8,
} from "./directions";

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

/**
 * The four-way snap, for art drawn at four facings rather than eight.
 *
 * Only `security_camera.aseprite` needs it today, and its four cel labels are
 * these four words. A camera whose inferred facing snapped to the wrong side
 * would be drawn looking into the wall it is bolted to.
 */
describe("nearestCardinal", () => {
  it("returns each cardinal for its own heading", () => {
    expect(nearestCardinal(angleOf("east"))).toBe("east");
    expect(nearestCardinal(angleOf("south"))).toBe("south");
    expect(nearestCardinal(angleOf("west"))).toBe("west");
    expect(nearestCardinal(angleOf("north"))).toBe("north");
  });

  it("sends each diagonal to a cardinal rather than off the table", () => {
    // `Sensor.inferFacing` sums clear-neighbour vectors, so an open corner
    // genuinely produces these — they are the common case, not the edge.
    for (const dir of ["north-east", "south-east", "south-west", "north-west"] as Dir8[]) {
      expect(["east", "south", "west", "north"], dir).toContain(
        nearestCardinal(angleOf(dir)),
      );
    }
  });

  it("wraps at both ends of the circle", () => {
    // atan2 returns (-π, π], so west arrives as both +π and -π, and a heading
    // just under a full turn has to come back to east rather than overflowing.
    expect(nearestCardinal(Math.PI)).toBe("west");
    expect(nearestCardinal(-Math.PI)).toBe("west");
    expect(nearestCardinal(-Math.PI / 2)).toBe("north");
    expect(nearestCardinal(Math.PI * 2)).toBe("east");
    expect(nearestCardinal(-Math.PI * 2)).toBe("east");
    expect(nearestCardinal(Math.PI * 4 + Math.PI / 2)).toBe("south");
  });

  it("agrees with the eight-way snap wherever the two overlap", () => {
    // Half of DIRS_8 are cardinals, and the two tables must not drift apart —
    // which is the whole reason both live in one module.
    for (const dir of ["east", "south", "west", "north"] as Dir8[]) {
      const a = angleOf(dir);
      expect(nearestCardinal(a), dir).toBe(nearestDirection(a));
    }
  });
});
