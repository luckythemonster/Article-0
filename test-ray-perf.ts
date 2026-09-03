import { performance } from "perf_hooks";

const ts = 32;
const ox = 100, oy = 100;
const cx = 0.5, cy = 0.5;
const step = ts * 0.25;
const maxDist = 300;
const hubClear = 50;
const hubClearSq = hubClear * hubClear;
const hub = { x: 50, y: 50 };

function withinOrEqual(dx: number, dy: number, r: number) {
  return dx * dx + dy * dy <= r * r;
}

const grid = {
  blocksSight: (x: number, y: number) => false
};

function runBaseline() {
  let res = 0;
  for (let i = 0; i < 100000; i++) {
    for (let d = step; d <= maxDist; d += step) {
      const x = ox + cx * d;
      const y = oy + cy * d;
      if (withinOrEqual(x - hub.x, y - hub.y, hubClear)) continue;
      if (grid.blocksSight(Math.floor(x / ts), Math.floor(y / ts))) { res = d; break; }
    }
  }
  return res;
}

function runOptimized() {
  let res = 0;
  for (let i = 0; i < 100000; i++) {
    const invTs = 1 / ts;
    for (let d = step; d <= maxDist; d += step) {
      const x = ox + cx * d;
      const y = oy + cy * d;
      const dx = x - hub.x;
      const dy = y - hub.y;
      if (dx * dx + dy * dy <= hubClearSq) continue;
      if (grid.blocksSight(Math.floor(x * invTs), Math.floor(y * invTs))) { res = d; break; }
    }
  }
  return res;
}

const start = performance.now();
runBaseline();
const baseTime = performance.now() - start;

const startOpt = performance.now();
runOptimized();
const optTime = performance.now() - startOpt;

console.log(`Baseline: ${baseTime.toFixed(2)}ms`);
console.log(`Optimized: ${optTime.toFixed(2)}ms`);
console.log(`Speedup: ${(baseTime / optTime).toFixed(2)}x`);
