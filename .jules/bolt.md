## 2025-05-18 - [Voxel Raycasting Optimization]
**Learning:** In 2.5D rendering pipelines, raycasting is the primary CPU bottleneck, particularly when casting hundreds of rays per frame (e.g., 720 rays at 60fps). Redundant divisions, sign checks, and absolute value calculations within the raycast walk can be completely eliminated by precomputing the unit ray directions and DDA factors (deltaX, deltaY, stepX, stepY) at initialization.
**Action:** Precalculate `deltaX`, `deltaY`, `stepX`, and `stepY` in `RayDirections` and use them in a specialized fast-path during `sightDistances` rendering walks.

## 2025-05-20 - [Pathfinding Memory and Garbage Collection Optimization]
**Learning:** A* pathfinding in grid-based environments is a hot execution path that is heavily penalized by heap allocations (Maps, Sets, Array destructuring, and object instantiation) inside Javascript engines. Reusing pre-allocated flat TypedArrays (Float64Array, Int32Array, Uint8Array) indexed by flat 1D coordinates eliminates the garbage collection spikes and overhead of standard Map/Set lookups entirely.
**Action:** Avoid using standard Map and Set classes inside high-frequency, synchronous graph search loops; instead, prefer pre-allocated flat typed arrays indexed by 1D coordinates, and use simple temp variables instead of array destructuring during array item swaps to avoid garbage creation.

## 2025-05-22 - [A* Neighbor Traversal and DDA Walk Optimization]
**Learning:** Caching static structures like 8-connected neighbor offsets as flat `Int8Array` and iterating over them with simple index lookups avoids the array destructuring (`[dx, dy]`) and iterator allocation overhead of JS arrays inside hot execution loops. Similarly, caching loop-invariant coordinate properties (such as `Math.floor(x0)`/`Math.floor(y0)`) as local variables in Bresenham's/DDA walks prevents redundant function call invocation overhead inside the hot loop.
**Action:** Cache static 8-connected offsets as separate flat `Int8Array` buffers and replace standard `for..of` array destructuring with indexed loops. Cache parameter floors outside loops to optimize core graph walks and raycast/line-of-sight algorithms.

## 2025-05-24 - [Vision Cone Vector Dot-Product Optimization]
**Learning:** Vision cone checks in high-frequency per-frame sensing loops can avoid expensive `Math.atan2` calls and angle wrapping calculations (`angleDiff`) by using 2D vector dot products and comparing squared dot products against precomputed squared cosine thresholds multiplied by the precalculated squared distance (`dist2`).
**Action:** Use vector dot products (`isWithinCone`) for vision cone containment checks in hot sensing loops instead of `Math.atan2` and `angleDiff`.

## 2025-05-26 - [Light Sampling Line-of-Sight & Distance Pre-Calculation Optimization]
**Learning:** In per-caster per-frame light sampling loops (`sampleLightAt`), full directional raycasts (`rayDistance`) with wall reveal offsets can be replaced by fast integer DDA line-of-sight checks (`grid.hasLineOfSight`). Additionally, precomputing reciprocal tile scales (`1 / tileSize`), early-exiting zero-intensity lights, and short-circuiting falloff evaluation within the light core radius (`d2 <= coreR2`) defers or avoids expensive `Math.sqrt` and division operations.
**Action:** Use fast DDA line-of-sight checks instead of full raycasts when sampling point-to-point light visibility, precompute reciprocal scale factors outside iteration loops, and delay `Math.sqrt` until after distance/visibility checks.
