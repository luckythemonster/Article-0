export interface WorldMapContext {
    getTile(x: number, y: number, z: number): number | null;
    setTile(x: number, y: number, z: number, tileType: number): void;
}