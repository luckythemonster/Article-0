import { describe, it, expect } from "vitest";
import { angleDiff, isWithinCone } from "./angles";

describe("angleDiff", () => {
  it("calculates shortest arc across the seam", () => {
    expect(angleDiff(Math.PI * 0.99, -Math.PI * 0.99)).toBeCloseTo(0.02 * Math.PI);
    expect(angleDiff(-Math.PI * 0.99, Math.PI * 0.99)).toBeCloseTo(-0.02 * Math.PI);
  });
});

describe("isWithinCone", () => {
  function oldAngleCheck(facing: number, coneDegrees: number, dx: number, dy: number): boolean {
    const half = (coneDegrees * Math.PI) / 360;
    return Math.abs(angleDiff(facing, Math.atan2(dy, dx))) <= half;
  }

  it("handles point-blank origin (dist2 === 0)", () => {
    expect(isWithinCone(0, 0, 0, 0, Math.PI / 4)).toBe(true);
  });

  it("matches traditional angle check across diverse facings and cone angles", () => {
    for (let facing = -Math.PI; facing <= Math.PI; facing += 0.5) {
      for (let coneDegrees = 10; coneDegrees <= 350; coneDegrees += 30) {
        const half = (coneDegrees * Math.PI) / 360;
        for (let dx = -10; dx <= 10; dx += 2.5) {
          for (let dy = -10; dy <= 10; dy += 2.5) {
            if (dx === 0 && dy === 0) continue;
            const dist2 = dx * dx + dy * dy;
            const expected = oldAngleCheck(facing, coneDegrees, dx, dy);
            const actual = isWithinCone(dx, dy, dist2, facing, half);
            expect(actual).toBe(expected);
          }
        }
      }
    }
  });

  it("benchmarks execution time of isWithinCone vs Math.atan2", () => {
    const N = 1_000_000;
    const dxArr = new Float64Array(N);
    const dyArr = new Float64Array(N);
    const dist2Arr = new Float64Array(N);

    for (let i = 0; i < N; i++) {
      dxArr[i] = (Math.random() - 0.5) * 20;
      dyArr[i] = (Math.random() - 0.5) * 20;
      dist2Arr[i] = dxArr[i] * dxArr[i] + dyArr[i] * dyArr[i];
    }

    const facing = 0.5;
    const coneDegrees = 90;
    const half = (coneDegrees * Math.PI) / 360;

    let countOld = 0;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      if (oldAngleCheck(facing, coneDegrees, dxArr[i], dyArr[i])) countOld++;
    }
    const t1 = performance.now();

    let countNew = 0;
    const t2 = performance.now();
    for (let i = 0; i < N; i++) {
      if (isWithinCone(dxArr[i], dyArr[i], dist2Arr[i], facing, half)) countNew++;
    }
    const t3 = performance.now();

    const oldTime = t1 - t0;
    const newTime = t3 - t2;

    expect(countNew).toBe(countOld);
    console.log(`[BENCHMARK] isWithinCone - Old: ${oldTime.toFixed(2)}ms, New: ${newTime.toFixed(2)}ms (Speedup: ${(oldTime / newTime).toFixed(2)}x)`);
  });
});
