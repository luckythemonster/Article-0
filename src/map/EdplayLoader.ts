import type {
  ComponentData,
  EdPlayFile,
  EdSpriteRect,
  EdTileDef,
  GameLayer,
  GameLevel,
  GameMap,
  GameTile,
  SpriteFrame,
} from "./types";

/**
 * Parses the raw edplay.json export into the engine's normalized {@link GameMap}.
 *
 * The heavy lifting is index-building + resolution:
 *   tile.Handle -> TileDef -> Animation.KeyFrames[0].SpriteId -> sprite rect
 * and, for entities, TileDef.DataComponents -> typed component values (falling
 * back to the DataStructure field defaults, since the map leaves them null).
 *
 * This module is pure: it never touches Phaser. Frame *registration* against
 * loaded textures happens in SpriteAtlas, using {@link GameMap.uniqueFrames}.
 */
export class EdplayLoader {
  /** @param sheetTextureKeys Phaser texture keys per spritesheet, in file order. */
  static parse(raw: EdPlayFile, sheetTextureKeys: string[]): ParsedMap {
    const tileDefByHandle = new Map<number, EdTileDef>();
    for (const td of raw.TileDefs) tileDefByHandle.set(td.Handle, td);

    // spriteId -> { sheetIndex, rect }. A TileDef's KeyFrame SpriteId is usually
    // a sprite Ref string, but some tiles (e.g. doors) reference the sprite by
    // its numeric Handle instead — so index by both, keyed as strings.
    const spriteInfoById = new Map<
      string,
      { sheetIndex: number; rect: EdSpriteRect }
    >();
    raw.SpriteSheets.forEach((sheet, sheetIndex) => {
      for (const sprite of sheet.Sprites) {
        if (sprite.Ref) spriteInfoById.set(sprite.Ref, { sheetIndex, rect: sprite });
        if (sprite.Handle !== undefined) {
          spriteInfoById.set(String(sprite.Handle), { sheetIndex, rect: sprite });
        }
      }
    });

    // Field defaults per DataStructure, so entities have complete values.
    const defaultsByType = new Map<string, Record<string, string>>();
    for (const ds of raw.DataTypes.DataStructures) {
      const defaults: Record<string, string> = {};
      for (const f of ds.Fields) defaults[f.Name] = f.DefaultValues[0] ?? "";
      defaultsByType.set(ds.Name, defaults);
    }

    const uniqueFrames = new Map<string, SpriteFrame>();

    const resolveFrame = (td: EdTileDef): SpriteFrame | undefined => {
      const kf = td.Animation?.KeyFrames?.[0];
      if (!kf) return undefined;
      const info = spriteInfoById.get(kf.SpriteId);
      if (!info) return undefined;
      const cached = uniqueFrames.get(kf.SpriteId);
      if (cached) return cached;
      const frame: SpriteFrame = {
        textureKey: sheetTextureKeys[info.sheetIndex],
        frameKey: kf.SpriteId,
        x: info.rect.X ?? 0,
        y: info.rect.Y ?? 0,
        width: info.rect.Width,
        height: info.rect.Height,
      };
      uniqueFrames.set(kf.SpriteId, frame);
      return frame;
    };

    const resolveComponents = (td: EdTileDef): ComponentData[] => {
      return td.DataComponents.map((dc) => {
        const defaults = defaultsByType.get(dc.DataType) ?? {};
        const values: Record<string, string> = { ...defaults };
        for (const v of dc.Variables) {
          const val = v.Values[0];
          // The map author left most values null -> keep the schema default.
          if (val !== null && val !== undefined && val !== "") {
            values[v.Name] = String(val);
          }
        }
        return { type: dc.DataType, values };
      });
    };

    const levels: GameLevel[] = raw.Levels.map((lvl) => {
      const layers: GameLayer[] = lvl.Boards.map((board) => {
        const tiles: GameTile[] = board.Tiles.map((t) => {
          const td = tileDefByHandle.get(t.Handle);
          const components = td ? resolveComponents(td) : [];
          const tile: GameTile = {
            x: t.X,
            y: t.Y,
            handle: t.Handle,
            ref: td?.Ref ?? String(t.Handle),
            frame: td ? resolveFrame(td) : undefined,
            entityType: components.length > 0 ? components[0].type : undefined,
            components,
          };
          return tile;
        });
        return { name: board.Name, tiles };
      });

      return {
        name: lvl.Name,
        width: lvl.Boards[0]?.Width ?? raw.Width,
        height: lvl.Boards[0]?.Height ?? raw.Height,
        layers,
      };
    });

    const map: GameMap = {
      name: raw.Name,
      tileWidth: raw.TileWidth,
      tileHeight: raw.TileHeight,
      levels,
      sheetTextureKeys,
    };

    return { map, uniqueFrames: [...uniqueFrames.values()] };
  }
}

export interface ParsedMap {
  map: GameMap;
  /** Every distinct sprite rect used by the map, ready for atlas registration. */
  uniqueFrames: SpriteFrame[];
}
