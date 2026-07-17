import { parseEdPlayJson } from './TileRegistryParser';

describe('parseEdPlayJson', () => {
    const mockMappingConfig = {
        'concrete_wall': 2,
        'glass': 6,
        'b_metal_floor_spritesheet1': 5
    };

    it('should parse valid JSON and construct registry correctly', () => {
        const mockJson = JSON.stringify({
            SpriteSheets: [
                {
                    Sprites: [
                        {
                            // Math.floor(1353/33) * 16 + Math.floor(495/33)
                            // = 41 * 16 + 15 = 656 + 15 = 671
                            X: 495,
                            Y: 1353,
                            Width: 32,
                            Height: 32,
                            SpriteBrushId: 'concrete_wall',
                            BitMasks: [3844]
                        },
                        {
                            // Math.floor(1320/33) * 16 + Math.floor(1716/33)
                            // = 40 * 16 + 52 = 640 + 52 = 692
                            X: 1716,
                            Y: 1320,
                            Width: 32,
                            Height: 32,
                            SpriteBrushId: 'glass',
                            BitMasks: [24397, 1234] // multiple bitmasks
                        },
                        {
                            // Math.floor(1287/33) * 16 + Math.floor(1419/33)
                            // = 39 * 16 + 43 = 624 + 43 = 667
                            X: 1419,
                            Y: 1287,
                            Width: 32,
                            Height: 32,
                            SpriteBrushId: 'b_metal_floor_spritesheet1',
                            BitMasks: [] // empty bitmasks
                        },
                        {
                            // Should be ignored (no SpriteBrushId)
                            X: 0,
                            Y: 0,
                            Width: 32,
                            Height: 32,
                            BitMasks: [1]
                        },
                        {
                            // Should be ignored (not in mapping config)
                            X: 33,
                            Y: 33,
                            Width: 32,
                            Height: 32,
                            SpriteBrushId: 'unknown_tile',
                            BitMasks: [1]
                        }
                    ]
                }
            ]
        });

        const registry = parseEdPlayJson(mockJson, mockMappingConfig);

        // concrete_wall (2)
        expect(registry[2]).toBeDefined();
        expect(registry[2][3844]).toBe(671);

        // glass (6) with multiple bitmasks
        expect(registry[6]).toBeDefined();
        expect(registry[6][24397]).toBe(692);
        expect(registry[6][1234]).toBe(692);

        // b_metal_floor_spritesheet1 (5) with empty bitmasks (fallback to 0)
        expect(registry[5]).toBeDefined();
        expect(registry[5][0]).toBe(667);

        // Ensure ignored ones are not in registry
        // (If there are no other entries mapped to unknown tile types)
        expect(Object.keys(registry).length).toBe(3); // 2, 5, 6
    });

    it('should handle invalid JSON gracefully', () => {
        expect(() => parseEdPlayJson('invalid json', mockMappingConfig)).toThrow('Failed to parse edplay.json. Invalid JSON format.');
    });

    it('should handle empty JSON structures gracefully', () => {
        const emptyData1 = JSON.stringify({});
        expect(parseEdPlayJson(emptyData1, mockMappingConfig)).toEqual({});

        const emptyData2 = JSON.stringify({ SpriteSheets: [] });
        expect(parseEdPlayJson(emptyData2, mockMappingConfig)).toEqual({});

        const emptyData3 = JSON.stringify({ SpriteSheets: [{}] });
        expect(parseEdPlayJson(emptyData3, mockMappingConfig)).toEqual({});
    });
});
