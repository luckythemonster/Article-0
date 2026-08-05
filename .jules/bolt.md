## 2025-05-18 - [Voxel Raycasting Optimization]
**Learning:** In 2.5D rendering pipelines, raycasting is the primary CPU bottleneck, particularly when casting hundreds of rays per frame (e.g., 720 rays at 60fps). Redundant divisions, sign checks, and absolute value calculations within the raycast walk can be completely eliminated by precomputing the unit ray directions and DDA factors (deltaX, deltaY, stepX, stepY) at initialization.
**Action:** Precalculate `deltaX`, `deltaY`, `stepX`, and `stepY` in `RayDirections` and use them in a specialized fast-path during `sightDistances` rendering walks.

## 2025-05-20 - [Pathfinding Memory and Garbage Collection Optimization]
**Learning:** A* pathfinding in grid-based environments is a hot execution path that is heavily penalized by heap allocations (Maps, Sets, Array destructuring, and object instantiation) inside Javascript engines. Reusing pre-allocated flat TypedArrays (Float64Array, Int32Array, Uint8Array) indexed by flat 1D coordinates eliminates the garbage collection spikes and overhead of standard Map/Set lookups entirely.
**Action:** Avoid using standard Map and Set classes inside high-frequency, synchronous graph search loops; instead, prefer pre-allocated flat typed arrays indexed by 1D coordinates, and use simple temp variables instead of array destructuring during array item swaps to avoid garbage creation.
