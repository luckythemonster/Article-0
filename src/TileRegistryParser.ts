/**
 * Interface representing the structure of a single Sprite in the Ed by Chilling Moose JSON export.
 */
interface EdSprite {
    X: number;
    Y: number;
    Width: number;
    Height: number;
    SpriteBrushId?: string;
    BitMasks?: number[];
    [key: string]: any; // Catch-all for other unused properties
}

/**
 * Interface representing a SpriteSheet in the Ed JSON export.
 */
interface EdSpriteSheet {
    Sprites: EdSprite[];
    [key: string]: any; // Catch-all for other unused properties
}

/**
 * Interface representing the root of the Ed JSON export.
 */
interface EdPlayJson {
    SpriteSheets: EdSpriteSheet[];
    [key: string]: any; // Catch-all for other unused properties
}

/**
 * The output TileRegistry format.
 * Maps TileType (number) to another Record mapping BitMask (number) to AtlasIndex (number).
 * Example: Registry[2][3844] = 15
 */
export type TileRegistry = Record<number, Record<number, { atlasIndex: number, sheetIndex: number }>>;

/**
 * Parses an 'Ed by Chilling Moose' JSON map export to extract a TileRegistry.
 *
 * @param jsonString The raw JSON string exported from Ed.
 * @param mappingConfig A dictionary mapping string SpriteBrushIds (e.g., "concrete_wall") to integer TileTypes (e.g., 2).
 * @returns A lightweight 2D lookup table: Registry[TileType][BitMask] = atlasIndex.
 */
export function parseEdPlayJson(jsonString: string, mappingConfig: Record<string, number>): TileRegistry {
    const registry: TileRegistry = {};

    // Parse the JSON string safely
    let data: EdPlayJson;
    try {
        data = JSON.parse(jsonString);
    } catch (e) {
        throw new Error("Failed to parse edplay.json. Invalid JSON format.");
    }

    if (!data.SpriteSheets || !Array.isArray(data.SpriteSheets)) {
        return registry; // Return empty registry if no SpriteSheets are found
    }

    for (let sheetIndex = 0; sheetIndex < data.SpriteSheets.length; sheetIndex++) {
        const sheet = data.SpriteSheets[sheetIndex];
        if (!sheet.Sprites || !Array.isArray(sheet.Sprites)) {
            continue;
        }

        for (const sprite of sheet.Sprites) {
            // 1. Skip sprites without a SpriteBrushId (decorations or statics)
            if (!sprite.SpriteBrushId) {
                continue;
            }

            // 2. Translate string SpriteBrushId to integer TileType using mapping config
            const tileType = mappingConfig[sprite.SpriteBrushId];

            // Skip if the SpriteBrushId is not defined in our config mapping
            if (tileType === undefined) {
                continue;
            }

            // Ensure the tileType exists in our registry
            if (!registry[tileType]) {
                registry[tileType] = {};
            }

            // 3. Convert pixel coordinates to flattened 1D atlas integer index
            // Formula accounts for 32x32 tiles with a 1-pixel gap (33 pixel stride) and a 16-column atlas layout.
            const atlasIndex = Math.floor(sprite.Y / 33) * 16 + Math.floor(sprite.X / 33);

            // 4. Handle BitMasks
            const bitMasks = sprite.BitMasks || [];

            if (bitMasks.length === 0) {
                // Empty array -> fallback to default mask 0
                registry[tileType][0] = { atlasIndex, sheetIndex };
            } else {
                // Multiple masks -> explode entries so all point to the same atlas slice
                for (const mask of bitMasks) {
                    registry[tileType][mask] = { atlasIndex, sheetIndex };
                }
            }
        }
    }

    return registry;
}
