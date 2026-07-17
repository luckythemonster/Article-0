import { calculateBitmask, WorldMapContext } from './Autotiler';

describe('Autotiler', () => {
    // 3x3 grid centered on (1, 1)
    // 0,0  1,0  2,0
    // 0,1  1,1  2,1
    // 0,2  1,2  2,2

    const autotileGroups: Record<number, string> = {
        2: "walls", // Concrete wall
        6: "walls", // Glass wall
        5: "floors" // Metal floor
    };

    class MockWorldMap implements WorldMapContext {
        grid: Record<string, number> = {};

        setTile(x: number, y: number, z: number, type: number) {
            this.grid[`${x},${y},${z}`] = type;
        }

        getTile(x: number, y: number, z: number): number | null {
            const tile = this.grid[`${x},${y},${z}`];
            return tile !== undefined ? tile : null;
        }
    }

    let worldMap: MockWorldMap;

    beforeEach(() => {
        worldMap = new MockWorldMap();
    });

    test('returns 0 when tile is not in any connection group', () => {
        worldMap.setTile(1, 1, 0, 99); // Unknown tile type
        const mask = calculateBitmask(worldMap, 1, 1, 0, autotileGroups);
        expect(mask).toBe(0);
    });

    test('returns 0 when tile is null', () => {
        const mask = calculateBitmask(worldMap, 1, 1, 0, autotileGroups);
        expect(mask).toBe(0);
    });

    test('returns 0 when no neighbors connect', () => {
        worldMap.setTile(1, 1, 0, 2); // Center tile is a wall
        const mask = calculateBitmask(worldMap, 1, 1, 0, autotileGroups);
        expect(mask).toBe(0);
    });

    test('connects cardinal neighbors', () => {
        worldMap.setTile(1, 1, 0, 2); // Center
        worldMap.setTile(1, 0, 0, 2); // N (1)
        worldMap.setTile(2, 1, 0, 2); // E (2)
        worldMap.setTile(1, 2, 0, 2); // S (4)
        worldMap.setTile(0, 1, 0, 2); // W (8)

        const mask = calculateBitmask(worldMap, 1, 1, 0, autotileGroups);
        expect(mask).toBe(15); // 1 + 2 + 4 + 8
    });

    test('connects diagonal neighbors ONLY if cardinals are present', () => {
        worldMap.setTile(1, 1, 0, 2); // Center

        // Scenario: North and West are present, NW diagonal is present
        worldMap.setTile(1, 0, 0, 2); // N (1)
        worldMap.setTile(0, 1, 0, 2); // W (8)
        worldMap.setTile(0, 0, 0, 2); // NW (16)

        let mask = calculateBitmask(worldMap, 1, 1, 0, autotileGroups);
        expect(mask).toBe(25); // 1 + 8 + 16

        // Scenario: Only N is present, NW diagonal is present, W is MISSING
        worldMap = new MockWorldMap();
        worldMap.setTile(1, 1, 0, 2); // Center
        worldMap.setTile(1, 0, 0, 2); // N (1)
        worldMap.setTile(0, 0, 0, 2); // NW (16) - SHOULD BE IGNORED

        mask = calculateBitmask(worldMap, 1, 1, 0, autotileGroups);
        expect(mask).toBe(1); // Only N is counted
    });

    test('connects correctly across different tile types in the same group', () => {
        worldMap.setTile(1, 1, 0, 2); // Center is Concrete (group "walls")
        worldMap.setTile(1, 0, 0, 6); // N is Glass (group "walls")

        const mask = calculateBitmask(worldMap, 1, 1, 0, autotileGroups);
        expect(mask).toBe(1); // N connects!
    });

    test('does not connect to tile types in different groups', () => {
        worldMap.setTile(1, 1, 0, 2); // Center is Concrete (group "walls")
        worldMap.setTile(1, 0, 0, 5); // N is Metal Floor (group "floors")

        const mask = calculateBitmask(worldMap, 1, 1, 0, autotileGroups);
        expect(mask).toBe(0); // N does NOT connect
    });

    test('handles full 47-tile blob correctly (all neighbors)', () => {
        worldMap.setTile(1, 1, 0, 2); // Center
        worldMap.setTile(1, 0, 0, 2); // N (1)
        worldMap.setTile(2, 1, 0, 2); // E (2)
        worldMap.setTile(1, 2, 0, 2); // S (4)
        worldMap.setTile(0, 1, 0, 2); // W (8)
        worldMap.setTile(0, 0, 0, 2); // NW (16)
        worldMap.setTile(2, 0, 0, 2); // NE (32)
        worldMap.setTile(2, 2, 0, 2); // SE (64)
        worldMap.setTile(0, 2, 0, 2); // SW (128)

        const mask = calculateBitmask(worldMap, 1, 1, 0, autotileGroups);
        expect(mask).toBe(255);
    });

    test('ignores Z layers correctly', () => {
        worldMap.setTile(1, 1, 0, 2); // Center is on Z = 0
        worldMap.setTile(1, 0, 1, 2); // N is on Z = 1 (should be ignored for Z = 0)

        const mask = calculateBitmask(worldMap, 1, 1, 0, autotileGroups);
        expect(mask).toBe(0);
    });
});
