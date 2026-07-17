import { WorldMapContext } from './WorldMapContext';

export class WorldMap implements WorldMapContext {
    private readonly data: Uint16Array;
    public readonly width: number;
    public readonly height: number;
    public readonly depth: number;

    constructor(width: number, height: number, depth: number) {
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.data = new Uint16Array(width * height * depth);
    }

    public getTile(x: number, y: number, z: number): number | null {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.depth) {
            return null;
        }
        return this.data[x + (y * this.width) + (z * this.width * this.height)];
    }

    public setTile(x: number, y: number, z: number, tileType: number): void {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height && z >= 0 && z < this.depth) {
            this.data[x + (y * this.width) + (z * this.width * this.height)] = tileType;
        }
    }
}
