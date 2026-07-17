import { TileRegistry } from './TileRegistryParser';

/**
 * Renders a test grid on the canvas by reversing the flattened atlasIndex
 * back into 2D coordinates to verify the layout math is flawless.
 */
export function drawTilesetTestGrid(
    ctx: CanvasRenderingContext2D,
    registry: TileRegistry,
    colorConfig: Record<number, string>
): void {
    // Clear the canvas area before drawing the test grid
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const tileSize = 32; // Each sprite block is a uniform 32x32 pixels
    const atlasColumns = 16; // The source sheet layout consists of 16 columns

    // Loop through each distinct TileType in our registry
    for (const tileTypeStr in registry) {
        const tileType = parseInt(tileTypeStr, 10);
        const bitmaskGroup = registry[tileType];

        // Determine the rendering color from our configuration, fallback to hot pink if missing
        const fillStyle = colorConfig[tileType] || "#ff00ff";
        ctx.fillStyle = fillStyle;

        // Loop through every procedural BitMask variation registered under this type
        for (const bitmaskStr in bitmaskGroup) {
            const index = bitmaskGroup[bitmaskStr];

            // Reverse the 1D atlas index back into clean 2D grid canvas coordinates
            const gridX = index % atlasColumns;
            const gridY = Math.floor(index / atlasColumns);

            const drawX = gridX * tileSize;
            const drawY = gridY * tileSize;

            // Draw the solid bounding block representing the tile
            ctx.fillRect(drawX, drawY, tileSize, tileSize);

            // Optional: Draw a subtle border around each cell to visually confirm grid separation
            ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
            ctx.lineWidth = 1;
            ctx.strokeRect(drawX, drawY, tileSize, tileSize);
        }
    }
}
