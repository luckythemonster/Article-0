export interface WorldMapContext {
    getTile(x: number, y: number, z: number): number | null;
}

/**
 * Calculates the autotiling bitmask for a given tile on a specific Z-layer.
 * Implements the standard 47-tile blob layout logic (8-way checking with corner isolation).
 *
 * @param worldMap The contextual world map to query tile data from.
 * @param x The X coordinate of the tile.
 * @param y The Y coordinate of the tile.
 * @param z The Z coordinate (layer) of the tile.
 * @param autotileGroups A dictionary grouping TileType integers to string connection flags.
 * @returns The resulting integer bitmask representing the tile's visual state.
 */
export function calculateBitmask(
    worldMap: WorldMapContext,
    x: number,
    y: number,
    z: number,
    autotileGroups: Record<number, string>
): number {
    const centerTile = worldMap.getTile(x, y, z);

    if (centerTile === null || centerTile === undefined) {
        return 0; // Empty or out-of-bounds tiles have no mask
    }

    const centerGroup = autotileGroups[centerTile];

    // If the tile isn't part of any connection group, it shouldn't connect to anything.
    if (!centerGroup) {
        return 0;
    }

    let mask = 0;

    // Helper to check if a neighbor connects
    const checkConnection = (nx: number, ny: number): boolean => {
        const neighborTile = worldMap.getTile(nx, ny, z);
        if (neighborTile === null || neighborTile === undefined) {
            return false;
        }
        return autotileGroups[neighborTile] === centerGroup;
    };

    // 1. Check Cardinal Directions
    const n = checkConnection(x, y - 1);
    const e = checkConnection(x + 1, y);
    const s = checkConnection(x, y + 1);
    const w = checkConnection(x - 1, y);

    if (n) mask += 1;
    if (e) mask += 2;
    if (s) mask += 4;
    if (w) mask += 8;

    // 2. Check Diagonal Directions (Conditional on Cardinals)
    // NW (16): Requires N and W
    if (n && w && checkConnection(x - 1, y - 1)) mask += 16;

    // NE (32): Requires N and E
    if (n && e && checkConnection(x + 1, y - 1)) mask += 32;

    // SE (64): Requires S and E
    if (s && e && checkConnection(x + 1, y + 1)) mask += 64;

    // SW (128): Requires S and W
    if (s && w && checkConnection(x - 1, y + 1)) mask += 128;

    return mask;
}
