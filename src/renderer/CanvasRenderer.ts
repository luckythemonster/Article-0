import { WorldMap, TileType, WIDTH, HEIGHT } from '../world/MapData';

export class CanvasRenderer {
    public render(
        ctx: CanvasRenderingContext2D,
        worldMap: WorldMap,
        playerX: number,     // Continuous pixel position (float)
        playerY: number,     // Continuous pixel position (float)
        zActive: number,     // Active Z floor level (integer, 0-11)
        atlasImage: HTMLImageElement
    ): void {
        const VIEWPORT_WIDTH = 1280;
        const VIEWPORT_HEIGHT = 720;
        const TILE_SIZE = 32;

        // Calculate top-left coordinate of the screen in world pixel space
        const cameraX = (playerX * TILE_SIZE) - (VIEWPORT_WIDTH / 2);
        const cameraY = (playerY * TILE_SIZE) - (VIEWPORT_HEIGHT / 2);

        // Frustum culling box calculations in grid coordinates
        let startX = Math.floor(cameraX / TILE_SIZE);
        let startY = Math.floor(cameraY / TILE_SIZE);
        let endX = Math.floor((cameraX + VIEWPORT_WIDTH) / TILE_SIZE);
        let endY = Math.floor((cameraY + VIEWPORT_HEIGHT) / TILE_SIZE);

        // Pad the bounding box for oblique offset shifting
        startX = Math.max(0, startX - 2);
        startY = Math.max(0, startY - 2);
        endX = Math.min(WIDTH - 1, endX + 2);
        endY = Math.min(HEIGHT - 1, endY + 2);

        // Clamp the starting floor to 0
        const startZ = Math.max(0, zActive - 1);

        for (let z = startZ; z <= zActive; z++) {
            const isFloorBelow = (z < zActive);

            // Apply dimming for the floor below
            if (isFloorBelow) {
                ctx.globalAlpha = 0.4;
            } else {
                ctx.globalAlpha = 1.0;
            }

            // Pseudo-3D oblique offset calculation
            const zOffset = (z - zActive) * -12;

            for (let y = startY; y <= endY; y++) {
                for (let x = startX; x <= endX; x++) {
                    const tileId = worldMap.getTile(x, y, z);

                    if (tileId === TileType.AIR) {
                        continue;
                    }

                    // Atlas coordinates based on 16 columns of 32x32 sprites
                    const srcX = (tileId % 16) * TILE_SIZE;
                    const srcY = Math.floor(tileId / 16) * TILE_SIZE;

                    // Screen coordinate calculation
                    const drawX = (x * TILE_SIZE) - cameraX + zOffset;
                    const drawY = (y * TILE_SIZE) - cameraY + zOffset;

                    // Direct drawing with zero allocation
                    ctx.drawImage(
                        atlasImage,
                        srcX, srcY, TILE_SIZE, TILE_SIZE,
                        drawX, drawY, TILE_SIZE, TILE_SIZE
                    );
                }
            }
        }
    }
}
