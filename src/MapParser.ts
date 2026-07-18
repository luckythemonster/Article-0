import { WorldMap } from './WorldMap';

interface EdMapJson {
    RuleBrushes?: { Id: string, Ref: string }[];
    SpriteBrushes?: { Id: string, Ref: string }[];
    Levels?: {
        Name: string;
        Boards?: {
            Width: number;
            Height: number;
            Tiles?: {
                X: number;
                Y: number;
                BrushId?: string;
            }[];
        }[];
    }[];
}

export function parseEdMapJson(jsonString: string, mappingConfig: Record<string, number>): WorldMap {
    let data: EdMapJson;
    try {
        data = JSON.parse(jsonString);
    } catch (e) {
        throw new Error("Failed to parse edplay.json. Invalid JSON format.");
    }

    let maxWidth = 0;
    let maxHeight = 0;
    const depth = data.Levels ? data.Levels.length : 0;

    if (data.Levels) {
        for (const level of data.Levels) {
            if (level.Boards) {
                for (const board of level.Boards) {
                    if (board.Width > maxWidth) maxWidth = board.Width;
                    if (board.Height > maxHeight) maxHeight = board.Height;
                }
            }
        }
    }

    const worldMap = new WorldMap(maxWidth, maxHeight, depth);

    const brushIdToRef: Record<string, string> = {};
    if (data.RuleBrushes) {
        for (const brush of data.RuleBrushes) {
            brushIdToRef[brush.Id] = brush.Ref;
        }
    }
    if (data.SpriteBrushes) {
        for (const brush of data.SpriteBrushes) {
            brushIdToRef[brush.Id] = brush.Ref;
        }
    }

    if (data.Levels) {
        for (let z = 0; z < data.Levels.length; z++) {
            const level = data.Levels[z];
            if (level.Boards) {
                for (const board of level.Boards) {
                    if (board.Tiles) {
                        for (const tile of board.Tiles) {
                            const brushId = tile.BrushId;
                            if (brushId) {
                                const ref = brushIdToRef[brushId];
                                if (ref) {
                                    const tileType = mappingConfig[ref];
                                    if (tileType !== undefined) {
                                        worldMap.setTile(tile.X, tile.Y, z, tileType);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    return worldMap;
}
