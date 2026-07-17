import { isTileSolid, isPositionClear, TileType, isTileOpaque } from './CollisionRegistry';
import { WorldMapContext } from './WorldMapContext';

describe('CollisionRegistry', () => {
    describe('isTileSolid', () => {
        it('should identify solid tiles correctly', () => {
            expect(isTileSolid(TileType.CONCRETE_WALL)).toBe(true);
            expect(isTileSolid(TileType.WINDOWS_TERRAIN48)).toBe(true);
            expect(isTileSolid(TileType.GLASS)).toBe(true);
            expect(isTileSolid(TileType.BOUNDARY)).toBe(true);
            expect(isTileSolid(TileType.DOOR_CLOSED_HORIZONTAL)).toBe(true);
            expect(isTileSolid(TileType.DOOR_CLOSED_VERTICAL)).toBe(true);
            expect(isTileSolid(TileType.DOOR_GLASS_CLOSED)).toBe(true);
            expect(isTileSolid(null)).toBe(true); // out of bounds
        });

        it('should identify non-solid tiles correctly', () => {
            expect(isTileSolid(TileType.AIR)).toBe(false);
            expect(isTileSolid(TileType.LADDER)).toBe(false);
            expect(isTileSolid(TileType.WHITE_TILE)).toBe(false);
            expect(isTileSolid(TileType.DOOR_OPEN_HORIZONTAL)).toBe(false);
            expect(isTileSolid(TileType.DOOR_OPEN_VERTICAL)).toBe(false);
            expect(isTileSolid(TileType.DOOR_GLASS_OPEN)).toBe(false);
        });
    });

    describe('isPositionClear', () => {
        let mockWorldMap: WorldMapContext;

        beforeEach(() => {
            mockWorldMap = {
                getTile: jest.fn((x: number, y: number, z: number) => {
                    // Make a small 3x3 open area, surrounded by walls
                    if (x >= 0 && x <= 2 && y >= 0 && y <= 2) {
                        return TileType.AIR;
                    }
                    return TileType.CONCRETE_WALL;
                }),
                setTile: jest.fn()
            };
        });

        it('should return true for a clear position', () => {
            // Center of the 3x3 open area (grid x=1, y=1)
            const result = isPositionClear(mockWorldMap, 1.5, 1.5, 0, 0.4, 0.4);
            expect(result).toBe(true);
        });

        it('should return false if bounding box touches a solid tile (left edge)', () => {
            // Move left so the left edge crosses into x < 0
            const result = isPositionClear(mockWorldMap, 0.3, 1.5, 0, 0.4, 0.4);
            expect(result).toBe(false);
        });

        it('should return false if bounding box touches a solid tile (right edge)', () => {
            // Move right so the right edge crosses into x > 2
            const result = isPositionClear(mockWorldMap, 2.7, 1.5, 0, 0.4, 0.4);
            expect(result).toBe(false);
        });
    });
});

describe('isTileOpaque', () => {


    it('should identify opaque tiles correctly', () => {
        expect(isTileOpaque(TileType.CONCRETE_WALL)).toBe(true);
        expect(isTileOpaque(TileType.BOUNDARY)).toBe(true);
        expect(isTileOpaque(TileType.DOOR_CLOSED_HORIZONTAL)).toBe(true);
        expect(isTileOpaque(TileType.DOOR_CLOSED_VERTICAL)).toBe(true);
        expect(isTileOpaque(null)).toBe(true);
    });

    it('should identify non-opaque tiles correctly', () => {
        expect(isTileOpaque(TileType.AIR)).toBe(false);
        expect(isTileOpaque(TileType.GLASS)).toBe(false);
        expect(isTileOpaque(TileType.WINDOWS_TERRAIN48)).toBe(false);
        expect(isTileOpaque(TileType.DOOR_GLASS_CLOSED)).toBe(false);
        expect(isTileOpaque(TileType.DOOR_OPEN_HORIZONTAL)).toBe(false);
        expect(isTileOpaque(TileType.DOOR_OPEN_VERTICAL)).toBe(false);
        expect(isTileOpaque(TileType.DOOR_GLASS_OPEN)).toBe(false);
        expect(isTileOpaque(TileType.WHITE_TILE)).toBe(false);
        expect(isTileOpaque(TileType.LADDER)).toBe(false);
    });
});
