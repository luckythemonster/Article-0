import { WorldMapContext } from './WorldMapContext';
import { isTileOpaque } from './CollisionRegistry';

/**
 * Checks if there is a clear line of sight between two 3D points.
 * Uses a 3D Digital Differential Analyzer (DDA) voxel traversal algorithm.
 *
 * @param worldMap The world map to query.
 * @param startX Starting X coordinate (floating point).
 * @param startY Starting Y coordinate (floating point).
 * @param startZ Starting Z coordinate (floating point).
 * @param endX Ending X coordinate (floating point).
 * @param endY Ending Y coordinate (floating point).
 * @param endZ Ending Z coordinate (floating point).
 * @returns True if the line of sight is clear (no opaque tiles block it), false otherwise.
 */
export function hasLineOfSight(
    worldMap: WorldMapContext,
    startX: number,
    startY: number,
    startZ: number,
    endX: number,
    endY: number,
    endZ: number
): boolean {
    // Current voxel integer coordinates
    let currentX = Math.floor(startX);
    let currentY = Math.floor(startY);
    let currentZ = Math.floor(startZ);

    const targetX = Math.floor(endX);
    const targetY = Math.floor(endY);
    const targetZ = Math.floor(endZ);

    // Ray direction vector
    const dx = endX - startX;
    const dy = endY - startY;
    const dz = endZ - startZ;

    // Step direction (-1, 0, or 1)
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const stepZ = Math.sign(dz);

    // Distance to next voxel boundary along each axis
    // If direction is 0, we set to infinity to never step in that direction
    let tMaxX = stepX !== 0
        ? ((currentX + (stepX > 0 ? 1 : 0)) - startX) / dx
        : Infinity;
    let tMaxY = stepY !== 0
        ? ((currentY + (stepY > 0 ? 1 : 0)) - startY) / dy
        : Infinity;
    let tMaxZ = stepZ !== 0
        ? ((currentZ + (stepZ > 0 ? 1 : 0)) - startZ) / dz
        : Infinity;

    // Distance needed to travel one full voxel along each axis
    const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dz) : Infinity;

    // We step until we hit the target voxel or go out of bounds
    // A maximum limit prevents infinite loops in case of floating point precision issues
    const maxSteps = Math.abs(targetX - currentX) + Math.abs(targetY - currentY) + Math.abs(targetZ - currentZ) + 1;
    let steps = 0;

    while (steps < maxSteps) {
        // Evaluate current voxel
        const tile = worldMap.getTile(currentX, currentY, currentZ);
        if (isTileOpaque(tile)) {
            return false; // Ray blocked!
        }

        // If we reached the target voxel, line of sight is clear
        if (currentX === targetX && currentY === targetY && currentZ === targetZ) {
            return true;
        }

        // Step to the next voxel
        if (tMaxX < tMaxY) {
            if (tMaxX < tMaxZ) {
                currentX += stepX;
                tMaxX += tDeltaX;
            } else {
                currentZ += stepZ;
                tMaxZ += tDeltaZ;
            }
        } else {
            if (tMaxY < tMaxZ) {
                currentY += stepY;
                tMaxY += tDeltaY;
            } else {
                currentZ += stepZ;
                tMaxZ += tDeltaZ;
            }
        }
        steps++;
    }

    return true;
}
