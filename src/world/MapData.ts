export const WIDTH = 96;
export const HEIGHT = 96;
export const DEPTH = 12;

export const enum TileType {
    AIR = 0,        // Walkable floor / open air space
    BOUNDARY = 1,   // Impenetrable map border wall
    SOLID_WALL = 2, // Standard sight/movement blocking wall
    LADDER = 5,     // Vertical floor transition tile
    GLASS = 6       // Clear wall (blocks movement, allows line-of-sight)
}

export class WorldMap {
    private data: Uint16Array;

    constructor() {
        this.data = new Uint16Array(WIDTH * HEIGHT * DEPTH);
    }

    public getTile(x: number, y: number, z: number): number {
        if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT || z < 0 || z >= DEPTH) {
            return TileType.BOUNDARY;
        }
        return this.data[x + (y * WIDTH) + (z * WIDTH * HEIGHT)];
    }

    public setTile(x: number, y: number, z: number, value: number): void {
        if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT || z < 0 || z >= DEPTH) {
            return;
        }
        this.data[x + (y * WIDTH) + (z * WIDTH * HEIGHT)] = value;
    }
}
