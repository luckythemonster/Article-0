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
  /** State label for multi-frame tiles, e.g. "closed" / "open" on doors. */
  Script?: string;
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
  /** Footprint height in tiles (e.g. 1.5 for a single door, 2.5 for a double). */
  RowSpan: number;
  /** Footprint width in tiles. */
  ColSpan: number;
  /** Pixel placement offset from the cell centre. */
  OffsetX?: number;
  OffsetY?: number;
  /** Sprite anchor (4 = centre in the editor's 0–8 grid). */
  Anchor?: number;
  CellAnchor?: number;
  TintColor?: number;
  BackgroundColor?: number;
  DataComponents: EdDataComponent[];
  Handle: number;
  Ref: string;
  Id: string;
}

export interface EdTile {
  /**
   * Tile coordinates — **absent when zero**. The exporter drops any field at its
   * default, so every board's west column has no `X` and its north row no `Y`.
   * Declaring them required is what hid that: `EdplayLoader` read them straight
   * through and produced `undefined` coordinates for 672 tiles of the shipped map.
   */
  X?: number;
  Y?: number;
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
  /** The default (first-keyframe) sprite frame. */
  frame?: SpriteFrame;
  /**
   * Frames keyed by their animation Script label ("closed"/"open" on doors).
   * When the source keyframes carry no label, falls back to index-based keys
   * "closed" (frame 0), "open" (frame 1). Absent for single-frame tiles.
   */
  stateFrames?: Record<string, SpriteFrame>;
  /** Footprint size in tiles (default 1×1). Doors are 1.5 / 2.5 in one axis. */
  colSpan: number;
  rowSpan: number;
  /** Pixel placement offset from the cell centre (default 0). */
  offsetX: number;
  offsetY: number;
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
  /**
   * Set by the generator that built this level. A map is free to author a level
   * called `vent_core` itself — NW-SMAC-01 does — and that one is authored
   * content like any other, so the name alone can't answer "did the engine make
   * this?". Only the level that was actually generated carries the flag.
   */
  generated?: boolean;
}

export interface GameMap {
  name: string;
  tileWidth: number;
  tileHeight: number;
  levels: GameLevel[];
  /** Texture keys registered for the three spritesheets, in file order. */
  sheetTextureKeys: string[];
}

// ---------------------------------------------------------------------------
// Level names
//
// Level names are plain strings everywhere in the engine — that is the whole
// point of `MapPlan`, which derives "where does a run start / end / host the
// arena" from the map's own shape so a new map isn't obliged to reuse the
// shipped one's names. What follows is the *shipped* map's vocabulary plus the
// levels the engine builds itself, recorded in one place because a handful of
// call sites legitimately need to know them: `journalIdForLevel` picks an
// arrival entry per deck, the debug warp keys order the level list, and
// `MapPlan` must never route a run into a level it generated.
// ---------------------------------------------------------------------------

/**
 * Levels the engine appends to the parsed map at boot rather than reading out of
 * `edplay.json`. Kept as one list so {@link isGeneratedLevel} — and therefore
 * `MapPlan` — can't fall behind when another one is added.
 *
 * The names are duplicated as exported constants next to each generator
 * (`VENT_CORE_LEVEL`, `ROOF_ARRAY_LEVEL`) so those modules stay self-describing;
 * a unit test asserts the two agree.
 */
export const GENERATED_LEVELS = ["vent_core", "roof_array"] as const;

/**
 * The level keys the shipped map and its generated additions use, in play order.
 * Documentation and a spell-check for the few switches that key off a deck — not
 * a constraint on what a map may name its levels.
 */
export type KnownLevel =
  | "main1"
  | "duct1"
  | "duct2"
  | "main2"
  | (typeof GENERATED_LEVELS)[number];

/**
 * True for a name the engine *would* generate a level under.
 *
 * Note what this is not: a test for whether a given level was generated. A map may
 * author its own `vent_core` — NW-SMAC-01 does — and that one is authored content
 * that should route like any other deck. Routing and warp order therefore key off
 * {@link GameLevel.generated}, the flag the generator actually sets. This stays as
 * the answer to "is this name spoken for?", which is a question about the name.
 */
export function isGeneratedLevel(name: string): boolean {
  return (GENERATED_LEVELS as readonly string[]).includes(name);
}

/**
 * Which board a transition tile lives on, which also decides how it triggers:
 * `stairs` are walked over, `maintenance_access` and `roof_access`
 * (hatches/ladders) are entered with the interact key.
 */
export type TransitionKind = "stairs" | "maintenance_access" | "roof_access";

/**
 * True for transitions entered with the interact key rather than walked over.
 * Hatches and ladders prompt; stairs trigger on contact.
 */
export function isInteractTransition(kind: TransitionKind): boolean {
  return kind !== "stairs";
}

/** Where a transition tile leads: the destination level and arrival tile. */
export interface Transition {
  toLevel: string;
  toX: number;
  toY: number;
  kind: TransitionKind;
}
