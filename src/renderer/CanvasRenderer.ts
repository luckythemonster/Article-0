import { WorldMap, WIDTH, HEIGHT } from '../world/MapData';

export class CanvasRenderer {
    public render(
        ctx: CanvasRenderingContext2D,
        worldMap: WorldMap,
        playerX: number,
        playerY: number,
        zActive: number,
        atlasImage: HTMLImageElement
    ): void {
        const VIEWPORT_WIDTH = 1280;
        const VIEWPORT_HEIGHT = 720;
        const TILE_SIZE = 32;

        const camX = playerX - (VIEWPORT_WIDTH / 2);
        const camY = playerY - (VIEWPORT_HEIGHT / 2);

        const startZ = Math.max(0, zActive - 1);

        for (let z = startZ; z <= zActive; z++) {
            const isFloorBelow = (z < zActive);
            const offset = (z - zActive) * -12;

            ctx.globalAlpha = isFloorBelow ? 0.4 : 1.0;

            // Bounding box strictly bounds tiles within viewport view.
            // When offset applies, the tile world position changes on the screen.
            const adjustedCamX = camX - offset;
            const adjustedCamY = camY - offset;

            const startX = Math.max(0, Math.floor(adjustedCamX / TILE_SIZE));
            const startY = Math.max(0, Math.floor(adjustedCamY / TILE_SIZE));

            const endX = Math.min(WIDTH - 1, Math.ceil((adjustedCamX + VIEWPORT_WIDTH) / TILE_SIZE));
            const endY = Math.min(HEIGHT - 1, Math.ceil((adjustedCamY + VIEWPORT_HEIGHT) / TILE_SIZE));

            for (let y = startY; y <= endY; y++) {
                for (let x = startX; x <= endX; x++) {
                    const tileId = worldMap.getTile(x, y, z);

                    if (tileId === 0) continue; // AIR

                    // Draw the tile
                    // Pseudo-3D Oblique Projection offset computation:
                    //   x_draw = x_world + offset
                    //   y_draw = y_world + offset
                    const drawX = (x * TILE_SIZE) + offset - camX;
                    const drawY = (y * TILE_SIZE) + offset - camY;

                    // Source coordinate on Atlas (16 columns of 32x32 tiles)
                    const srcX = (tileId % 16) * TILE_SIZE;
                    const srcY = Math.floor(tileId / 16) * TILE_SIZE;

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
