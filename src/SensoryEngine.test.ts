import { hasLineOfSight } from './SensoryEngine';
import { WorldMapContext } from './WorldMapContext';
import { TileType } from './CollisionRegistry';

describe('SensoryEngine - 3D DDA Line of Sight', () => {
    let mockWorldMap: WorldMapContext;
    let tiles: Record<string, number>;

    beforeEach(() => {
        tiles = {};
        mockWorldMap = {
            getTile: jest.fn((x, y, z) => {
                const key = `${x},${y},${z}`;
                return tiles[key] !== undefined ? tiles[key] : TileType.AIR;
            }),
            setTile: jest.fn((x, y, z, tileType) => {
                const key = `${x},${y},${z}`;
                tiles[key] = tileType;
            })
        };
    });

    it('should have clear line of sight through empty air', () => {
        const result = hasLineOfSight(mockWorldMap, 0.5, 0.5, 0.5, 5.5, 0.5, 0.5);
        expect(result).toBe(true);
    });

    it('should be blocked by a solid wall on the same Z layer', () => {
        mockWorldMap.setTile(3, 0, 0, TileType.CONCRETE_WALL); // Opaque wall

        const result = hasLineOfSight(mockWorldMap, 0.5, 0.5, 0.5, 5.5, 0.5, 0.5);
        expect(result).toBe(false);
    });

    it('should not be blocked by a glass wall', () => {
        mockWorldMap.setTile(3, 0, 0, TileType.GLASS); // Transparent wall

        const result = hasLineOfSight(mockWorldMap, 0.5, 0.5, 0.5, 5.5, 0.5, 0.5);
        expect(result).toBe(true);
    });

    it('should be blocked by a closed door', () => {
        mockWorldMap.setTile(3, 0, 0, TileType.DOOR_CLOSED_HORIZONTAL);

        const result = hasLineOfSight(mockWorldMap, 0.5, 0.5, 0.5, 5.5, 0.5, 0.5);
        expect(result).toBe(false);
    });

    it('should not be blocked by an open door', () => {
        mockWorldMap.setTile(3, 0, 0, TileType.DOOR_OPEN_HORIZONTAL);

        const result = hasLineOfSight(mockWorldMap, 0.5, 0.5, 0.5, 5.5, 0.5, 0.5);
        expect(result).toBe(true);
    });

    it('should correctly calculate cross-level line of sight (guard on catwalk looking down)', () => {
        // Guard at z=1.5 (eye level on upper floor), player at z=0.5 (eye level on lower floor)
        // Solid floor at (2,0,1) blocking the view
        mockWorldMap.setTile(2, 0, 1, TileType.CONCRETE_WALL);

        const blockedView = hasLineOfSight(mockWorldMap, 0.5, 0.5, 1.5, 4.5, 0.5, 0.5);
        expect(blockedView).toBe(false);

        // Replace solid floor with an open hatch (Air) or glass
        mockWorldMap.setTile(2, 0, 1, TileType.GLASS);
        const clearView = hasLineOfSight(mockWorldMap, 0.5, 0.5, 1.5, 4.5, 0.5, 0.5);
        expect(clearView).toBe(true);
    });

    it('should accurately handle ray starting inside opaque object', () => {
        mockWorldMap.setTile(0, 0, 0, TileType.CONCRETE_WALL);
        const result = hasLineOfSight(mockWorldMap, 0.5, 0.5, 0.5, 5.5, 0.5, 0.5);
        expect(result).toBe(false);
    });
});
