// ---------------------------------------------------------------------------
// edplay.json schema
//
// These interfaces describe the subset of the tile-editor export format that
// the engine consumes. The file is produced by an external level editor; only
// the fields we actually read are typed here (the format has many more).
// ---------------------------------------------------------------------------

export interface EdSpriteRect {
  X?: number; // omitted means 0
  Y?: number; // omitted means 0
  Width: number;
  Height: number;
  Ref?: string;
  Handle?: number;
}

export interface EdSpriteSheet {
  RelativePath: string;
  RenderedPath: string;
  Sprites: EdSpriteRect[];
  Width: number;
  Height: number;
  Id: string;
}

export interface EdKeyFrame {
  SpriteId: string;
  Duration: number;
  DurationMax: number;
}

export interface EdAnimation {
  KeyFrames: EdKeyFrame[];
  Rate: number;
}

export interface EdVariable {
  Name: string;
  Values: (string | number | null)[];
}

export interface EdDataComponent {
  DataType: string;
  Variables: EdVariable[];
}

export interface EdTileDef {
  Char: string;
  Animation: EdAnimation;
  RowSpan: number;
  ColSpan: number;
  TintColor?: number;
  BackgroundColor?: number;
  DataComponents: EdDataComponent[];
  Handle: number;
  Ref: string;
  Id: string;
}

export interface EdTile {
  X: number;
  Y: number;
  Handle: number;
  BrushId?: string;
}

export interface EdBoard {
  Name: string;
  Width: number;
  Height: number;
  Tiles: EdTile[];
  IsVisible: boolean;
  Id: string;
}

export interface EdLevel {
  Name: string;
  Boards: EdBoard[];
  Id: string;
}

export interface EdField {
  Name: string;
  Type: string;
  DefaultValues: string[];
  IsPublic: boolean;
}

export interface EdDataStructure {
  Name: string;
  Fields: EdField[];
  Id: string;
}

export interface EdEnumDef {
  Name: string;
  Values: { Name: string; Value: string }[];
  Id: string;
}

export interface EdDataTypes {
  EnumDefs: EdEnumDef[];
  DataStructures: EdDataStructure[];
}

export interface EdPlayFile {
  SpriteSheets: EdSpriteSheet[];
  Levels: EdLevel[];
  TileDefs: EdTileDef[];
  DataTypes: EdDataTypes;
  Width: number;
  Height: number;
  TileWidth: number;
  TileHeight: number;
  Name: string;
}

// ---------------------------------------------------------------------------
// Normalized game model
//
// What the rest of the engine works against after loading. Everything here is
// resolved: tiles already know their sprite frame and (for entities) their
// typed component data.
// ---------------------------------------------------------------------------

/** A resolved rectangle inside one of the spritesheet PNGs. */
export interface SpriteFrame {
  /** Phaser texture key for the owning spritesheet (e.g. "sheet1"). */
  textureKey: string;
  /** Unique frame key registered on that texture. */
  frameKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A component instance placed on an entity, with values resolved to defaults. */
export interface ComponentData {
  type: string;
  values: Record<string, string>;
}

/** A single placed tile in the normalized model. */
export interface GameTile {
  x: number;
  y: number;
  handle: number;
  ref: string;
  frame?: SpriteFrame;
  /** Present only for tiles whose TileDef carries a DataComponent. */
  entityType?: string;
  components: ComponentData[];
}

export interface GameLayer {
  name: string;
  tiles: GameTile[];
}

export interface GameLevel {
  name: string;
  width: number;
  height: number;
  /** Layers in board (z) order: index 0 draws first / lowest. */
  layers: GameLayer[];
}

export interface GameMap {
  name: string;
  tileWidth: number;
  tileHeight: number;
  levels: GameLevel[];
  /** Texture keys registered for the three spritesheets, in file order. */
  sheetTextureKeys: string[];
}

/**
 * Which board a transition tile lives on, which also decides how it triggers:
 * `stairs` are walked over, `maintenance_access` (hatches/ladders) is entered
 * with the interact key.
 */
export type TransitionKind = "stairs" | "maintenance_access";

/** Where a transition tile leads: the destination level and arrival tile. */
export interface Transition {
  toLevel: string;
  toX: number;
  toY: number;
  kind: TransitionKind;
}
