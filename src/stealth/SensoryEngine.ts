import { TileType, WorldMap } from '../world/MapData';

export interface VisionEntity {
    x: number; // Continuous tile X (float)
    y: number; // Continuous tile Y (float)
    z: number; // Discrete Z-level index (integer, 0 to 11)
}

function isOpaque(tileId: number): boolean {
    return tileId === TileType.BOUNDARY || tileId === TileType.SOLID_WALL;
}

export class SensoryEngine {
    public hasLineOfSight(
        guard: VisionEntity,
        player: VisionEntity,
        worldMap: WorldMap,
        maxDistance: number = 20.0
    ): boolean {
        const x1 = guard.x;
        const y1 = guard.y;
        const z1 = guard.z + 0.5;

        const x2 = player.x;
        const y2 = player.y;
        const z2 = player.z + 0.5;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const dz = z2 - z1;

        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > maxDistance * maxDistance) {
            return false;
        }

        if (distSq === 0) {
            return !isOpaque(worldMap.getTile(Math.floor(x1), Math.floor(y1), Math.floor(z1)));
        }

        let voxelX = Math.floor(x1);
        let voxelY = Math.floor(y1);
        let voxelZ = Math.floor(z1);

        const targetX = Math.floor(x2);
        const targetY = Math.floor(y2);
        const targetZ = Math.floor(z2);

        const stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
        const stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
        const stepZ = dz > 0 ? 1 : (dz < 0 ? -1 : 0);

        const tDeltaX = stepX !== 0 ? Math.abs(1.0 / dx) : Infinity;
        const tDeltaY = stepY !== 0 ? Math.abs(1.0 / dy) : Infinity;
        const tDeltaZ = stepZ !== 0 ? Math.abs(1.0 / dz) : Infinity;

        let tMaxX = stepX !== 0 ? (stepX > 0 ? (voxelX + 1.0 - x1) : (x1 - voxelX)) * tDeltaX : Infinity;
        let tMaxY = stepY !== 0 ? (stepY > 0 ? (voxelY + 1.0 - y1) : (y1 - voxelY)) * tDeltaY : Infinity;
        let tMaxZ = stepZ !== 0 ? (stepZ > 0 ? (voxelZ + 1.0 - z1) : (z1 - voxelZ)) * tDeltaZ : Infinity;

        // Bounding the number of steps to prevent infinite loops in edge cases.
        // In the worst case, a voxel ray travels diagonally up to 3 units per 1 distance.
        const maxSteps = Math.ceil(maxDistance) * 3;
        let steps = 0;

        while (steps++ < maxSteps) {
            const tileId = worldMap.getTile(voxelX, voxelY, voxelZ);

            if (isOpaque(tileId)) {
                return false;
            }

            if (voxelX === targetX && voxelY === targetY && voxelZ === targetZ) {
                return true;
            }

            if (tMaxX < tMaxY) {
                if (tMaxX < tMaxZ) {
                    voxelX += stepX;
                    tMaxX += tDeltaX;
                } else {
                    voxelZ += stepZ;
                    tMaxZ += tDeltaZ;
                }
            } else {
                if (tMaxY < tMaxZ) {
                    voxelY += stepY;
                    tMaxY += tDeltaY;
                } else {
                    voxelZ += stepZ;
                    tMaxZ += tDeltaZ;
                }
            }
        }

        return false;
    }
}
