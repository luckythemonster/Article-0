import { WorldMapContext } from './WorldMapContext';

export const enum TileType {
    AIR = 0,
    BOUNDARY = 1,
    CONCRETE_WALL = 2,
    LADDER = 5,
    GLASS = 6,
    WHITE_TILE = 7,
    WINDOWS_TERRAIN48 = 8
}

/**
 * Checks if a given tile type is considered a solid, blocking object.
 */
export function isTileSolid(tileType: number | null): boolean {
    // Null indicates out-of-bounds, which we treat as solid to block movement
    if (tileType === null) return true;

    switch (tileType) {
        case TileType.BOUNDARY:
        case TileType.CONCRETE_WALL:
        case TileType.GLASS:
        case TileType.WINDOWS_TERRAIN48:
            return true;
        default:
            return false;
    }
}

/**
 * Checks if a specific position is clear of solid tiles by evaluating
 * the four corners of a bounding box.
 *
 * @param worldMap The world map to query.
 * @param nextX The intended X coordinate (continuous grid units).
 * @param nextY The intended Y coordinate (continuous grid units).
 * @param z The current Z layer.
 * @param halfWidth Half the width of the bounding box.
 * @param halfHeight Half the height of the bounding box.
 */
export function isPositionClear(
    worldMap: WorldMapContext,
    nextX: number,
    nextY: number,
    z: number,
    halfWidth: number,
    halfHeight: number
): boolean {
    const left = Math.floor(nextX - halfWidth);
    const right = Math.floor(nextX + halfWidth);
    const top = Math.floor(nextY - halfHeight);
    const bottom = Math.floor(nextY + halfHeight);

    // If any of the 4 corners land in a solid tile, the position is blocked.
    if (isTileSolid(worldMap.getTile(left, top, z))) return false;
    if (isTileSolid(worldMap.getTile(right, top, z))) return false;
    if (isTileSolid(worldMap.getTile(left, bottom, z))) return false;
    if (isTileSolid(worldMap.getTile(right, bottom, z))) return false;

    return true;
}
