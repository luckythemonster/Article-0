import { describe, it, expect } from "vitest";
import { rdp, type Point } from "./rdp";

describe("rdp", () => {
  it("returns a copy for fewer than 3 points", () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 4, y: 9 },
    ];
    const out = rdp(pts, 1);
    expect(out).toEqual(pts);
    expect(out).not.toBe(pts);
  });

  it("collapses collinear points to the endpoints", () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 7, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(rdp(pts, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("keeps a spike below epsilon but drops it above", () => {
    const spike: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 10 },
      { x: 10, y: 0 },
    ];
    expect(rdp(spike, 1)).toHaveLength(3); // 10px deviation survives eps=1
    expect(rdp(spike, 20)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("preserves the corners of a square outline", () => {
    // Dense points walking three sides of a 10×10 square.
    const pts: Point[] = [];
    for (let x = 0; x <= 10; x++) pts.push({ x, y: 0 });
    for (let y = 1; y <= 10; y++) pts.push({ x: 10, y });
    for (let x = 9; x >= 0; x--) pts.push({ x, y: 10 });
    const out = rdp(pts, 0.5);
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
  });

  it("never yields more vertices as epsilon grows", () => {
    const pts: Point[] = [];
    for (let i = 0; i <= 40; i++) {
      pts.push({ x: i, y: Math.round(Math.sin(i / 3) * 6) });
    }
    const coarse = rdp(pts, 5).length;
    const fine = rdp(pts, 1).length;
    expect(coarse).toBeLessThanOrEqual(fine);
    expect(coarse).toBeLessThan(pts.length);
  });
});
