import { WorldMap } from './WorldMap';
import { parseEdMapJson } from './MapParser';

describe('MapParser', () => {
    it('should parse map JSON and mount tiles into WorldMap', () => {
        const json = {
            RuleBrushes: [
                { Id: "brush1", Ref: "concrete_wall" },
                { Id: "brush2", Ref: "floor_metal" }
            ],
            Levels: [
                {
                    Name: "Level1",
                    Boards: [
                        {
                            Width: 10,
                            Height: 10,
                            Tiles: [
                                { X: 1, Y: 2, BrushId: "brush1" },
                                { X: 3, Y: 4, BrushId: "brush2" }
                            ]
                        }
                    ]
                }
            ]
        };

        const config = {
            "concrete_wall": 2,
            "floor_metal": 5
        };

        const worldMap = parseEdMapJson(JSON.stringify(json), config);

        expect(worldMap.width).toBe(10);
        expect(worldMap.height).toBe(10);
        expect(worldMap.depth).toBe(1);

        expect(worldMap.getTile(1, 2, 0)).toBe(2);
        expect(worldMap.getTile(3, 4, 0)).toBe(5);
        expect(worldMap.getTile(0, 0, 0)).toBe(0);
    });

    it('should handle layers with the same tile position (overwriting)', () => {
        const json = {
            RuleBrushes: [
                { Id: "brush1", Ref: "concrete_wall" },
                { Id: "brush2", Ref: "glass1" }
            ],
            Levels: [
                {
                    Name: "Level1",
                    Boards: [
                        {
                            Width: 10,
                            Height: 10,
                            Tiles: [
                                { X: 5, Y: 5, BrushId: "brush1" }
                            ]
                        },
                        {
                            Width: 10,
                            Height: 10,
                            Tiles: [
                                { X: 5, Y: 5, BrushId: "brush2" }
                            ]
                        }
                    ]
                }
            ]
        };

        const config = {
            "concrete_wall": 2,
            "glass1": 6
        };

        const worldMap = parseEdMapJson(JSON.stringify(json), config);

        expect(worldMap.getTile(5, 5, 0)).toBe(6); // The second board overwrites the first
    });
});
