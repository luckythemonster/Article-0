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
  /**
   * Per-side inset of the collision box from the footprint rectangle, in
   * **fractions of a cell**. Absent sides are zero, and the whole field is
   * dropped by the exporter when nothing is set.
   *
   * A property of the *art*, not the placement: `tdCement_4X5_10` carries
   * `Bottom: 0.4` and is used on `walls`, `building` and `roof` alike. So this
   * says what shape the tile is when it collides, never whether it collides —
   * that is {@link EdBoard.Collision}'s job.
   */
  ColliderPadding?: EdColliderPadding;
  /**
   * Authored, parsed, and deliberately not acted on.
   *
   * Only ever `1`, on 15 `walls` defs. The editor doesn't export an enum for it
   * (`DataTypes.EnumDefs` carries the gameplay enums only), so its meaning isn't
   * recoverable from the file, and guessing would change collision on a lot of
   * wall. Declared so it's visibly known-about rather than merely unnoticed.
   */
  CollisionMode?: number;
  DataComponents: EdDataComponent[];
  Handle: number;
  Ref: string;
  Id: string;
}

/** Collider inset per side, in fractions of a cell. Absent side = no inset. */
export interface EdColliderPadding {
  Left?: number;
  Top?: number;
  Right?: number;
  Bottom?: number;
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
  /**
   * What this board's tiles do physically: `1` solid, `2` marker/trigger, absent
   * for boards the author never classified. This is the authored answer to "which
   * boards block", replacing a hardcoded `["walls"]` — see {@link SOLID_COLLISION}.
   */
  Collision?: number;
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
  /**
   * Per-side collider inset in fractions of a cell, when the art declares one.
   * Resolved by {@link colliderRect}; absent means the collider is the whole
   * footprint, which is what every generated tile and every un-padded def wants.
   */
  collider?: EdColliderPadding;
}

export interface GameLayer {
  name: string;
  tiles: GameTile[];
  /** The board's authored {@link EdBoard.Collision}, when it declared one. */
  collision?: number;
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

// ---------------------------------------------------------------------------
// What blocks
// ---------------------------------------------------------------------------

/** The {@link EdBoard.Collision} value that means "these tiles are solid". */
export const SOLID_COLLISION = 1;

/**
 * Solid boards the map didn't classify, by name.
 *
 * `fence` is the rooftop perimeter — 145 tiles, 141 of them carrying authored
 * collider bounds — and it carries no `Collision` value, so nothing else would
 * make it stop anybody. Delete this the day the board is marked `Collision: 1` in
 * the editor; it exists to spare the author a re-export, not to override them.
 */
export const EXTRA_SOLID_BOARDS: readonly string[] = ["fence"];

/**
 * Solid boards whose tiles stop movement but not sight.
 *
 * Chain-link is the obvious case. `cover` is the load-bearing one: it became
 * solid when the engine started reading `Collision`, and making it *opaque* as
 * well would silently rewrite guard vision across the whole map — cover's job is
 * to dampen detection and conceal a crouching player, which is a different
 * mechanic from occlusion and stays that way.
 */
export const SEE_THROUGH_BOARDS: readonly string[] = ["cover", "fence"];

/**
 * The boards that block movement on a level, from the map's own metadata.
 *
 * Falls back to `["walls"]` when no board on the level declares `Collision` at
 * all — an older export, a generated level, or a test fixture — so the engine
 * behaves exactly as it did before any of this was read.
 */
export function blockingLayerNames(level: GameLevel): string[] {
  const declared = level.layers.filter((l) => l.collision !== undefined);
  if (declared.length === 0) {
    return level.layers.filter((l) => l.name === "walls" || isExtraSolid(l.name)).map((l) => l.name);
  }
  return level.layers
    .filter((l) => l.collision === SOLID_COLLISION || isExtraSolid(l.name))
    .map((l) => l.name);
}

const isExtraSolid = (name: string): boolean => EXTRA_SOLID_BOARDS.includes(name);

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
