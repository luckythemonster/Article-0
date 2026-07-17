export interface WorldMapContext {
    getTile(x: number, y: number, z: number): number | null;
}
