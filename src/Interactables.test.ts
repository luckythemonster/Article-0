import { interactWithTile, emitNoise } from './Interactables';
import { WorldMapContext } from './WorldMapContext';
import { TileType } from './CollisionRegistry';

// Mock emitNoise via module replacement if we needed to,
// but since it's just console.log, we can spy on console.log
describe('Interactables', () => {
    let mockWorldMap: WorldMapContext;
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
        let tiles: Record<string, number> = {};
        mockWorldMap = {
            getTile: jest.fn((x, y, z) => {
                const key = `${x},${y},${z}`;
                return tiles[key] !== undefined ? tiles[key] : null;
            }),
            setTile: jest.fn((x, y, z, tileType) => {
                const key = `${x},${y},${z}`;
                tiles[key] = tileType;
            })
        };
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    it('should swap a closed horizontal door to open and emit noise', () => {
        mockWorldMap.setTile(1, 2, 3, TileType.DOOR_CLOSED_HORIZONTAL);

        interactWithTile(mockWorldMap, 1, 2, 3);

        expect(mockWorldMap.getTile(1, 2, 3)).toBe(TileType.DOOR_OPEN_HORIZONTAL);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[Noise Event] Volume 10'));
    });

    it('should swap an open horizontal door to closed', () => {
        mockWorldMap.setTile(1, 2, 3, TileType.DOOR_OPEN_HORIZONTAL);

        interactWithTile(mockWorldMap, 1, 2, 3);

        expect(mockWorldMap.getTile(1, 2, 3)).toBe(TileType.DOOR_CLOSED_HORIZONTAL);
    });

    it('should not do anything for non-interactable tiles', () => {
        mockWorldMap.setTile(1, 2, 3, TileType.CONCRETE_WALL);

        interactWithTile(mockWorldMap, 1, 2, 3);

        expect(mockWorldMap.getTile(1, 2, 3)).toBe(TileType.CONCRETE_WALL);
        expect(consoleSpy).not.toHaveBeenCalled();
    });
});
