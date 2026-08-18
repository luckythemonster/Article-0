import Phaser from "phaser";
import { footprintCells } from "../map/footprint";
import type { GameTile, SpriteFrame } from "../map/types";
import type { CollisionGrid } from "../systems/CollisionGrid";
import { doorStatsFor, glassStatsFor, isGlass, type DoorStats } from "../systems/EntityStats";
import {
  clipFrames,
  ensureEntityAnim,
  ensureEntityClip,
  entityAnimKey,
  hasEntitySprite,
  type EntitySpriteId,
} from "./EntitySprites";

/**
 * How close the player gets before a door notices, in tiles.
 *
 * Wider than `GameScene`'s `INTERACT_RANGE` of 1.4 on purpose: the indicator is
 * a sensor reacting to someone walking up, so it should light before you are
 * close enough to touch the door, not at the same instant the prompt appears.
 */
const DOOR_SENSE_TILES = 2.5;

/**
 * An interactive door, sized and placed from the map's authoring data.
 *
 * The map-tile art is drawn pre-squished into a 32px cell but describes a
 * larger footprint via the tile's `colSpan`/`rowSpan` (single doors 1.5 tiles,
 * double doors 2.5) and is nudged into place with `offsetX`/`offsetY` — so it
 * is scaled to that footprint and centred (the editor anchors doors at
 * centre), and the two keyframes give distinct **closed** and **open**
 * sprites, swapped on state change rather than faded. That's the fallback for
 * when hand-drawn art is absent; see below for where the seating differs when
 * it's there.
 *
 * Closed, it blocks the player (an Arcade static body covering the footprint)
 * and every grid cell the footprint spans (so it also blocks radar and enforcer
 * pathing). Opening clears both. A door with a non-zero `key` is *locked* — only a
 * terminal hack (or, later, a keycard) opens it.
 *
 * **Glazed** doors are the exception to blocking sight: the map's glass doors carry a
 * `glass` component alongside their `door` one, and clear glazing stops you walking
 * through without stopping you (or a guard) looking through. So a closed glass door is a
 * window — you can be spotted across it, and you can scout the room beyond before
 * committing to opening it.
 *
 * **Hand-drawn art, when it's on disk.** `public/assets/sprites/door_*.aseprite`
 * carries one continuous 19-frame sequence, and the tags name its beats in the
 * order they happen:
 *
 * | tag | frames | door | reads as |
 * |---|---|---|---|
 * | `IDLE` | 0-1 | closed | at rest, nobody about |
 * | `SCAN` | 2-4 | closed | reading whoever just walked up |
 * | `LOCKED` | 5-6 | closed | denied |
 * | `UNLOCKED` | 7-9 | closed | granted — the lead-in to the slide |
 * | `OPENING`/`CLOSING` | 10-15 | sliding | the travel itself |
 * | `MOTION_DETECTION` | 16-18 | **open** | held open, counting what goes through |
 *
 * Two of those are easy to misread from the tag name alone, so both were read
 * off the `door` layer's own cel labels rather than guessed. `MOTION_DETECTION`
 * is the **resting-open** loop — its three frames are the only ones the door
 * layer labels `OPEN` — not a proximity cue. And `UNLOCKED` is the granted beat
 * the indicator holds unbroken through `OPENING`, so opening plays
 * `UNLOCKED`+`OPENING` as one run rather than starting cold at the slide.
 *
 * That is also what makes `UNLOCKED` reachable at last. It sat unplayable while
 * the only thing that could have selected it was a lock state no code ever
 * clears; as the opening lead-in it belongs to an event that happens constantly.
 *
 * Picking `EntitySpriteId` is two independent choices: {@link isGlass} for the
 * material, and whether the tile's footprint runs long in the row axis
 * (`rowSpan > colSpan`) for the orientation — an east-west door's clearance is
 * what makes it 1x1.5 instead of the north-south door's plain 1x1, so the
 * footprint itself says which art to ask for. The east-west sources are drawn
 * 32x48 to cover that taller opening at 1:1; see `EntitySprites.ts`.
 *
 * **East-west art sits on the floor, not centred.** It is drawn natively
 * rather than stretched, standing in its own 48px canvas the way the door
 * physically stands in its jamb — so when it's actually the thing being shown,
 * its footprint's bottom edge is pinned to the bottom of its own tile instead
 * of the tile-centred seating the map's `Anchor`/`OffsetY` metadata resolves
 * to (that metadata was tuned for the old pre-squished, symmetrically
 * stretched art). North-south doors' art is exactly one tile tall, where
 * centred and bottom-aligned land in the same place, so this only ever
 * affects the east-west pair, and only once their art has actually loaded —
 * the map-tile fallback keeps the centred seating it was authored for.
 *
 * **The open/closed transition is cosmetic only.** `setOpen` still flips the
 * collision grid and the Arcade body the instant it is called, exactly as
 * before art existed — a guard's `doorWork.ts` timing, the noise system, and
 * every pathing cost all assume that. The slide just plays over it, so for a
 * few frames the sprite can be mid-travel while the tile is already fully
 * passable. Gating passability on the animation instead would ripple into all
 * three systems, which is well past "mount the sprites".
 */
export class Door {
  readonly tileX: number;
  readonly tileY: number;
  readonly stats: DoorStats;
  readonly locked: boolean;
  /** Clear glazing: blocks movement while closed, but never line of sight. */
  readonly seeThrough: boolean;

  private open: boolean;
  private readonly image: Phaser.Types.Physics.Arcade.SpriteWithStaticBody;
  private readonly grid: CollisionGrid;
  private readonly cells: { x: number; y: number }[];
  private readonly closedFrame?: SpriteFrame;
  private readonly openFrame?: SpriteFrame;
  private readonly displayW: number;
  private readonly displayH: number;
  /** Which of the four door strips this tile's footprint/material calls for. */
  private readonly art: EntitySpriteId;
  /** Set while a slide is playing, so proximity never stomps it mid-travel. */
  private sliding = false;
  /** Whether the player is within {@link DOOR_SENSE_TILES} of this door. */
  private playerNear = false;

  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, grid: CollisionGrid) {
    this.tileX = tile.x;
    this.tileY = tile.y;
    this.grid = grid;
    this.stats = doorStatsFor(tile.components);
    this.locked = this.stats.key !== 0 || this.stats.state === "locked";
    this.seeThrough = isGlass(tile.components) && !glassStatsFor(tile.components).visionBlock;
    this.open = this.stats.state === "open";

    // A door's own footprint says which way it opens: one that's taller than
    // it is wide (colSpan 1 x rowSpan 1.5) is set into a wall running
    // north-south and lets the player walk *east-west* through it — the
    // extra half-tile is the swing clearance that orientation needs. A plain
    // 1x1 door is the other way: north-south passage.
    const eastWest = tile.rowSpan > tile.colSpan;
    const glass = isGlass(tile.components);
    this.art = glass
      ? eastWest
        ? "door-glass-east-west"
        : "door-glass-north-south"
      : eastWest
        ? "door-single-east-west"
        : "door-single-north-south";

    this.closedFrame = tile.stateFrames?.closed ?? tile.frame;
    this.openFrame = tile.stateFrames?.open ?? this.closedFrame;
    this.displayW = tile.colSpan * tileSize;
    this.displayH = tile.rowSpan * tileSize;

    // Horizontal centre of the footprint, in pixels (cell centre + authored offset).
    const cx = (tile.x + 0.5) * tileSize + tile.offsetX;
    // The map's own `Anchor`/`OffsetY` metadata (folded into `tile.offsetY` by
    // the exporter — see `footprintCentre`'s doc comment) seats the *old*
    // art correctly: that art was pre-squished into a single 32px cell and
    // stretched symmetrically over the footprint, so centring it was right.
    // The hand-drawn east-west art is not stretched — it's drawn natively at
    // 48px, taller than the 32px cell its tile occupies, with the door
    // standing on the floor rather than floating centred in a box. So when
    // that art is actually what's going to be shown, its footprint's bottom
    // edge is pinned to the bottom of the door's own tile instead. North-south
    // doors' art is exactly one tile tall, where centred and bottom-aligned are
    // the same position, so this only ever moves the east-west pair — and only
    // when their art is there to move; the map-tile fallback keeps the
    // exporter's centred seating, since that's still the art it's tuned for.
    const useBottomSeating = eastWest && hasEntitySprite(scene, this.art);
    const cy = useBottomSeating
      ? (tile.y + 1) * tileSize - this.displayH / 2
      : (tile.y + 0.5) * tileSize + tile.offsetY;

    // A static *sprite*, not the plain image the map-tile-only rendering used —
    // the body/collision semantics are identical either way, but only a sprite
    // can `.play()` a clip when hand-drawn art is there to play.
    if (this.closedFrame) {
      this.image = scene.physics.add.staticSprite(cx, cy, this.closedFrame.textureKey, this.closedFrame.frameKey);
    } else {
      this.image = scene.physics.add.staticSprite(cx, cy, "__WHITE");
      this.image.setVisible(false);
    }
    this.image
      .setDepth(120)
      .setDisplaySize(this.displayW, this.displayH)
      .setFlipY(tile.flipY === true)
      .setTint(tile.tint)
      .refreshBody();

    // Grid footprint: every cell whose centre falls inside the door rectangle.
    this.cells = footprintCells(tile, tileSize);

    this.applyState();
  }

  /** The Arcade body used for player collision. */
  get body(): Phaser.Types.Physics.Arcade.SpriteWithStaticBody {
    return this.image;
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Whether the player may open this by hand (adjacent tap). */
  get isManual(): boolean {
    return !this.locked;
  }

  /** True when this door's footprint covers the given tile. */
  covers(tileX: number, tileY: number): boolean {
    return this.cells.some((c) => c.x === tileX && c.y === tileY);
  }

  /** Opens/closes the door. Returns true if it changed state. */
  setOpen(open: boolean): boolean {
    if (this.open === open) return false;
    this.open = open;
    this.applyState(true);
    return true;
  }

  toggle(): boolean {
    return this.setOpen(!this.open);
  }

  /**
   * Tells the door where the player is, so its indicator can react.
   *
   * Driven per frame from `GameScene.tickWorld` over *every* door, not the
   * scene's `nearestDoor` — that one is filtered to `isManual`, which excludes
   * exactly the locked doors whose denial light is the most worth showing.
   *
   * Only the flag changing does any work, so this is a comparison and an early
   * return on all but the two frames a crossing actually happens on.
   */
  senseProximity(playerTileX: number, playerTileY: number): void {
    const dx = this.tileX + 0.5 - playerTileX;
    const dy = this.tileY + 0.5 - playerTileY;
    const near = dx * dx + dy * dy <= DOOR_SENSE_TILES * DOOR_SENSE_TILES;
    if (near === this.playerNear) return;
    this.playerNear = near;
    // Mid-slide the sprite is busy, and `refreshClip` on completion will pick
    // up whatever the flag says by then.
    if (!this.sliding) this.refreshClip();
  }

  /**
   * `changed` is false at construction, so a door that boots already open just
   * appears that way — no slide played for a change that never happened.
   */
  private applyState(changed = false): void {
    // Grid: closed doors block their whole footprint; open doors clear it. Glazed doors
    // stay transparent to sight the whole time, closed or not.
    for (const c of this.cells) this.grid.setBlocked(c.x, c.y, !this.open, this.seeThrough);

    const body = this.image.body as Phaser.Physics.Arcade.StaticBody;
    body.enable = !this.open;

    if (hasEntitySprite(this.image.scene, this.art)) {
      if (changed) this.playSlide();
      else this.refreshClip();
      return;
    }

    // No art on disk (or it hasn't loaded) — the original map-tile-frame swap.
    const frame = this.open ? this.openFrame : this.closedFrame;
    if (frame) {
      this.image.setTexture(frame.textureKey, frame.frameKey);
      this.image.setDisplaySize(this.displayW, this.displayH);
    }
  }

  /**
   * The looping clip for wherever the door has settled.
   *
   * `MOTION_DETECTION` is the resting-*open* loop rather than anything to do
   * with approach — see the class doc; its frames are the ones the door layer
   * labels `OPEN`. Closed, the door shows what it would do about the player:
   * scanning them, refusing them, or nothing at all because no one is there.
   */
  private closedTag(): string {
    if (this.playerNear) return this.locked ? "LOCKED" : "SCAN";
    return "IDLE";
  }

  /** Plays the settled loop for the current state. Idempotent. */
  private refreshClip(): void {
    const tag = this.open ? "MOTION_DETECTION" : this.closedTag();
    const key = ensureEntityAnim(this.image.scene, this.art, tag);
    if (key) this.playClip(key, true);
  }

  /**
   * Plays a clip and re-asserts the footprint.
   *
   * `setDisplaySize` stores a *scale*, worked out against whatever frame the
   * sprite happened to hold at the time — and in the constructor that is the
   * map tile's own frame, not the art. The two are not the same shape: an
   * east-west door's tile frame is 32x32 where its art is 32x48, so the scale
   * derived from the tile (1 x 1.5) applied to the art gave a door half a tile
   * too tall. Re-asserting it here, once the art frame is in place, is what
   * keeps the drawn size the footprint the map actually authored.
   */
  private playClip(key: string, ignoreIfPlaying = false): void {
    this.image.play(key, ignoreIfPlaying);
    this.image.setDisplaySize(this.displayW, this.displayH);
  }

  /**
   * Plays the one-shot travel, then settles into the loop for wherever it
   * landed — re-resolved on completion rather than captured up front, since the
   * player can walk out of range while the door is still moving.
   */
  private playSlide(): void {
    const sprite = this.image;
    const key = this.open ? this.openingClipKey() : this.closingClipKey();
    if (key === undefined) {
      this.refreshClip();
      return;
    }
    // Clears any listener from an interrupted slide — otherwise it would still
    // fire on *this* clip's completion and race the one that superseded it.
    sprite.off("animationcomplete");
    this.sliding = true;
    this.playClip(key);
    sprite.once("animationcomplete", (anim: Phaser.Animations.Animation) => {
      if (anim.key !== key) return;
      this.sliding = false;
      this.refreshClip();
    });
  }

  /**
   * Opening runs `UNLOCKED` straight into `OPENING` as one clip.
   *
   * The indicator holds `UNLOCKED` unbroken from frame 7 through the whole
   * slide, so the granted beat is the authored lead-in to it, not a separate
   * state — starting at `OPENING` would drop three frames the artist drew as
   * part of the same motion. Assembled here because no single tag spans both.
   */
  private openingClipKey(): string | undefined {
    const scene = this.image.scene;
    const key = entityAnimKey(this.art, "OPEN_SEQUENCE");
    if (scene.anims.exists(key)) return key;
    const frames = [...clipFrames(this.art, "UNLOCKED"), ...clipFrames(this.art, "OPENING")];
    if (frames.length === 0) return undefined;
    return ensureEntityClip(scene, this.art, key, frames, 0);
  }

  /**
   * Closing is `OPENING`'s frames read backwards.
   *
   * Every source *does* tag a `CLOSING`, but over the identical range as
   * `OPENING` — the artist marked "this is also the travel" rather than drawing
   * a second, reversed clip, so playing that tag would slide the door open
   * again. The reversal is built once per sprite under its own key. The
   * `UNLOCKED` lead-in is deliberately not mirrored: a door closing has nothing
   * left to grant.
   */
  private closingClipKey(): string | undefined {
    const scene = this.image.scene;
    const key = entityAnimKey(this.art, "CLOSE_SEQUENCE");
    if (scene.anims.exists(key)) return key;
    const opening = clipFrames(this.art, "OPENING");
    if (opening.length === 0) return undefined;
    return ensureEntityClip(scene, this.art, key, [...opening].reverse(), 0);
  }
}
