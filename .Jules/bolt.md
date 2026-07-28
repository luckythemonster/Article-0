# Bolt's Journal

## 2025-02-23 - [Precomputing Raycasting Parameters in High-Frequency Loops]
**Learning:** In 2.5D/3D top-down game renderers utilizing visibility polygons and shadow fans, casting hundreds of rays per frame (e.g., SIGHT_RAYS = 720) represents a significant CPU bottleneck. The static angles of the rays allow precomputing almost all trigonometric and divisional raycasting helpers (including inverses, delta steps, directions, and boundary offsets). This avoids thousands of Math.floor, Math.abs, division, and branching operations per frame, providing massive performance gains while keeping the math identical and 100% correct.
**Action:** Always look for opportunities to extend cached mathematical structs (like unit ray lists) with precomputed properties (like step increments, inverses, and grid boundary offsets) when executing high-frequency algorithms across static grids or directions.
