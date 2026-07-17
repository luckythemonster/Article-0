import { WorldMapContext } from './WorldMapContext';
import { TileType } from './CollisionRegistry';

/**
 * Emits a noise event to alert nearby AI entities.
 * Currently a stub to maintain decoupling from the audio subsystem.
 *
 * @param x The X coordinate of the noise origin.
 * @param y The Y coordinate of the noise origin.
 * @param z The Z coordinate of the noise origin.
 * @param volume The intensity/radius of the noise.
 */
export function emitNoise(x: number, y: number, z: number, volume: number): void {
    // TODO: Broadcast spatial audio event to the AI State Machine's suspicious triggers
    console.log(`[Noise Event] Volume ${volume} emitted at (${x}, ${y}, ${z})`);
}

/**
 * Processes a player interaction on a specific map tile.
 * Used for toggling doors and other interactable elements.
 *
 * @param worldMap The world map to mutate.
 * @param x The X coordinate of the target tile.
 * @param y The Y coordinate of the target tile.
 * @param z The Z coordinate of the target tile.
 */
export function interactWithTile(worldMap: WorldMapContext, x: number, y: number, z: number): void {
    const currentTile = worldMap.getTile(x, y, z);

    if (currentTile === null) {
        return;
    }

    let newTile: number | null = null;
    let madeNoise = false;
    let noiseVolume = 0;

    switch (currentTile) {
        case TileType.DOOR_CLOSED_HORIZONTAL:
            newTile = TileType.DOOR_OPEN_HORIZONTAL;
            madeNoise = true;
            noiseVolume = 10;
            break;
        case TileType.DOOR_OPEN_HORIZONTAL:
            newTile = TileType.DOOR_CLOSED_HORIZONTAL;
            madeNoise = true;
            noiseVolume = 5; // Closing might be quieter
            break;
        case TileType.DOOR_CLOSED_VERTICAL:
            newTile = TileType.DOOR_OPEN_VERTICAL;
            madeNoise = true;
            noiseVolume = 10;
            break;
        case TileType.DOOR_OPEN_VERTICAL:
            newTile = TileType.DOOR_CLOSED_VERTICAL;
            madeNoise = true;
            noiseVolume = 5;
            break;
        case TileType.DOOR_GLASS_CLOSED:
            newTile = TileType.DOOR_GLASS_OPEN;
            madeNoise = true;
            noiseVolume = 10;
            break;
        case TileType.DOOR_GLASS_OPEN:
            newTile = TileType.DOOR_GLASS_CLOSED;
            madeNoise = true;
            noiseVolume = 5;
            break;
    }

    if (newTile !== null) {
        worldMap.setTile(x, y, z, newTile);

        if (madeNoise) {
            emitNoise(x, y, z, noiseVolume);
        }
    }
}
