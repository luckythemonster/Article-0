import { describe, it, expect } from "vitest";
import { toAABB, toPointObjects, toFlatArray, toMatterVertices } from "./format";
import type { Point } from "./rdp";

const box: Point[] = [
  { x: 4, y: 6 },
  { x: 14, y: 6 },
  { x: 14, y: 26 },
  { x: 4, y: 26 },
];

describe("toAABB", () => {
  it("computes the tight bounding box", () => {
    expect(toAABB(box)).toEqual({ width: 10, height: 20, offsetX: 4, offsetY: 6 });
  });

  it("shrinks the box symmetrically by the inset", () => {
    expect(toAABB(box, 2)).toEqual({ width: 6, height: 16, offsetX: 6, offsetY: 8 });
  });

  it("clamps the inset so the box never collapses", () => {
    const tiny: Point[] = [
      { x: 0, y: 0 },
      { x: 3, y: 3 },
    ];
    const aabb = toAABB(tiny, 100);
    expect(aabb.width).toBeGreaterThanOrEqual(1);
    expect(aabb.height).toBeGreaterThanOrEqual(1);
  });

  it("throws on an empty point set", () => {
    expect(() => toAABB([])).toThrow();
  });
});

describe("polygon formatters", () => {
  it("re-origins points to the frame center", () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 88, y: 88 },
    ];
    expect(toPointObjects(pts, "center", { width: 88, height: 88 })).toEqual([
      { x: -44, y: -44 },
      { x: 44, y: 44 },
    ]);
  });

  it("keeps top-left points and rounds them", () => {
    const pts: Point[] = [{ x: 1.4, y: 2.6 }];
    expect(toPointObjects(pts, "top-left", { width: 10, height: 10 })).toEqual([{ x: 1, y: 3 }]);
  });

  it("flattens to a coordinate array", () => {
    expect(
      toFlatArray([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ]),
    ).toEqual([1, 2, 3, 4]);
  });

  it("emits a Matter path string", () => {
    expect(
      toMatterVertices([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ]),
    ).toBe("1 2 3 4");
  });
});
