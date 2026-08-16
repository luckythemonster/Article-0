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
 * Component names the editor emits, mapped to the ones the engine reads.
 *
 * The tile editor doesn't guarantee a stable spelling for these across exports:
 * NW-SMAC-01 ships `Terminal` / `Container` / `LightSource` where the engine has
 * always looked for `terminal` / `chest` / `light_source`. Nothing warned about
 * it, because an unrecognised component simply reads as absent — so every door,
 * chest, light, cover pad and terminal in the map quietly stopped being one, and
 * with no terminals there were no log caches and no way to win the run.
 *
 * Case is handled by lowercasing; this table is only for the names that genuinely
 * differ. Unknown components pass through lowercased, which is the right default:
 * a component the engine doesn't read costs nothing by keeping its own name.
 */
const COMPONENT_ALIASES: Record<string, string> = {
  container: "chest",
  lightsource: "light_source",
  sensors: "sensor",
  audiohazard: "audio_hazard",
  powergrid: "power_grid",
};

/**
 * Field names per component, likewise. The engine's own convention is lowercase
 * for the handful of identity fields (`type`, `state`, `key`) and the editor's
 * PascalCase for tuning values, so lowercasing everything would break
 * `SightRange` and friends — only the identity fields are rewritten.
 *
 * `Cover.Height` is the one true rename: it carries `low` / `high`, which is
 * exactly what the engine calls a cover tile's `type`.
 */
const FIELD_ALIASES: Record<string, string> = {
  type: "type",
  state: "state",
  key: "key",
  height: "type",
};

/**
 * A tint that changes nothing: opaque white, which is what all but a handful of
 * boards and defs carry.
 *
 * Exported because it is the value everything downstream compares against — a
 * draw path asking "is this tile tinted?" is asking "is it not this?".
 */
export const NO_TINT = 0xffffff;

/**
 * The RGB half of an editor `0xAARRGGBB` colour.
 *
 * The alpha byte is dropped rather than honoured: `Board.Opacity` is `1` on all
 * 98 boards of the shipped map, so nothing authors transparency this way, and the
 * one alpha-0 value belongs to a marker def that draws nothing regardless.
 */
export function tintRgb(argb: number | undefined): number {
  return argb === undefined ? NO_TINT : (argb >>> 0) & 0xffffff;
}

/**
 * Two tints stacked, multiplied per channel.
 *
 * A def's tint composes with its board's rather than replacing it, which is the
 * only reading that makes `secret2` work: its `doors` board is tinted `c3e8ff`
 * and `secret_door_cement_wall1` is separately darkened to `cccccc`, and the
 * door is meant to be both — a dimmed door in a blue-lit room.
 */
export function multiplyTint(a: number, b: number): number {
  if (a === NO_TINT) return b;
  if (b === NO_TINT) return a;
  const channel = (shift: number): number =>
    Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 0xff);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

const canonicalComponent = (name: string): string => {
  const lower = name.toLowerCase();
  return COMPONENT_ALIASES[lower] ?? lower;
};

const canonicalField = (component: string, field: string): string => {
  const lower = field.toLowerCase();
  // `Height` only means `type` on cover; leave any other component's alone.
  if (lower === "height" && canonicalComponent(component) !== "cover") return field;
  return FIELD_ALIASES[lower] ?? field;
};

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

    // Resolves (and caches) one sprite by its SpriteId (Ref or numeric Handle).
    const frameForSpriteId = (spriteId: string): SpriteFrame | undefined => {
      const cached = uniqueFrames.get(spriteId);
      if (cached) return cached;
      const info = spriteInfoById.get(spriteId);
      if (!info) return undefined;
      const frame: SpriteFrame = {
        textureKey: sheetTextureKeys[info.sheetIndex],
        frameKey: spriteId,
        x: info.rect.X ?? 0,
        y: info.rect.Y ?? 0,
        width: info.rect.Width,
        height: info.rect.Height,
      };
      uniqueFrames.set(spriteId, frame);
      return frame;
    };

    const resolveFrame = (td: EdTileDef): SpriteFrame | undefined => {
      const kf = td.Animation?.KeyFrames?.[0];
      return kf ? frameForSpriteId(kf.SpriteId) : undefined;
    };

    // Frames keyed by keyframe Script ("closed"/"open"), falling back to
    // index-based labels when the source has none. Only built for multi-frame
    // tiles (doors), where the state maps to a distinct sprite.
    const resolveStateFrames = (td: EdTileDef): Record<string, SpriteFrame> | undefined => {
      const kfs = td.Animation?.KeyFrames ?? [];
      if (kfs.length < 2) return undefined;
      const out: Record<string, SpriteFrame> = {};
      kfs.forEach((kf, i) => {
        const frame = frameForSpriteId(kf.SpriteId);
        if (!frame) return;
        const label = kf.Script?.toLowerCase() ?? (i === 0 ? "closed" : i === 1 ? "open" : String(i));
        out[label] = frame;
      });
      return Object.keys(out).length > 0 ? out : undefined;
    };

    const resolveComponents = (td: EdTileDef): ComponentData[] => {
      return td.DataComponents.map((dc) => {
        const defaults = defaultsByType.get(dc.DataType) ?? {};
        const values: Record<string, string> = {};
        for (const [k, v] of Object.entries(defaults)) values[canonicalField(dc.DataType, k)] = v;
        for (const v of dc.Variables) {
          const val = v.Values[0];
          // The map author left most values null -> keep the schema default.
          if (val !== null && val !== undefined && val !== "") {
            values[canonicalField(dc.DataType, v.Name)] = String(val);
          }
        }
        return { type: canonicalComponent(dc.DataType), values };
      });
    };

    const levels: GameLevel[] = raw.Levels.map((lvl) => {
      const layers: GameLayer[] = lvl.Boards.map((board) => {
        const boardTint = tintRgb(board.TintColor);
        const tiles: GameTile[] = board.Tiles.map((t) => {
          const td = tileDefByHandle.get(t.Handle);
          const components = td ? resolveComponents(td) : [];
          const tile: GameTile = {
            // The exporter omits a coordinate that is zero, so `X`/`Y` are absent on
            // every board's west column and north row — 672 tiles across the shipped
            // map. Without the fallback those parse as `undefined` and then fail
            // silently and differently in each consumer: the collision grid's bounds
            // check rejects them, the wall-body mask writes to index `NaN`, and the
            // tile bake draws at `NaN` pixels. The result is a level border that is
            // invisible and that nothing collides with.
            x: t.X ?? 0,
            y: t.Y ?? 0,
            handle: t.Handle,
            ref: td?.Ref ?? String(t.Handle),
            frame: td ? resolveFrame(td) : undefined,
            stateFrames: td ? resolveStateFrames(td) : undefined,
            colSpan: td?.ColSpan ?? 1,
            rowSpan: td?.RowSpan ?? 1,
            offsetX: td?.OffsetX ?? 0,
            offsetY: td?.OffsetY ?? 0,
            // Read off the first keyframe, like the frame itself: a multi-frame
            // tile that flipped only some of its states would need this per state,
            // and no export has done that.
            flipY: td?.Animation?.KeyFrames?.[0]?.FlipY === true,
            // Board grade × the def's own, resolved here so the four code paths
            // that draw a tile don't each have to go looking for its board.
            tint: multiplyTint(boardTint, tintRgb(td?.TintColor)),
            entityType: components.length > 0 ? components[0].type : undefined,
            components,
            // Sits on the TileDef beside ColSpan, so it resolves through `Handle`
            // and every placement of a def shares one collider — which is exactly
            // what "this piece of art is solid *here*" means.
            collider: td?.ColliderPadding,
            collisionMode: td?.CollisionMode,
          };
          return tile;
        });
        return { name: board.Name, tiles, collision: board.Collision };
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
