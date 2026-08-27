import Phaser from "phaser";
import { footprintCells } from "../map/footprint";
import { doorBlocks, doorSeating } from "./doorGeometry";
import type { GameTile, SpriteFrame } from "../map/types";
import type { CollisionGrid } from "../systems/CollisionGrid";
import {
  doorIsLocked,
  doorOpensWith,
  doorStatsFor,
  glassStatsFor,
  isGlass,
  type DoorStats,
} from "../systems/EntityStats";
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
 * Above a guard's or camera's vision cone (`Enforcer`/`Sensor`, depth 400), so a
 * closed door reads as solid rather than getting the cone's translucent fill
 * painted across its own face.
 *
 * Draw order only. The cone's polygon legitimately ends right at the door (that
 * edge *is* what "the guard's view stops here" means), but at depth 120 — the
 * floor every other entity this class's size sits at — the door was drawn
 * *behind* that edge instead of in front of it, so the last thing painted there
 * was cone, not door.
 *
 * Worth being exact about what this does and does not buy, because the first
 * pass at the reported bug stopped here and shipped with the bug intact: a
 * closed door stops sight at its own cell and always did, but the cell *above*
 * an east-west door is a padded wall whose collider left a 0.4-tile channel
 * across the run, and cones poured through that. Raising the depth hid nothing
 * and fixed nothing there; the retraction pass in `CollisionGrid`'s constructor
 * is what closed it. This constant only decides who paints last.
 *
 * Still well under orderlies (440), bodies (450) and the player (750): a
 * character standing in or beside the doorway must draw over the door, not
 * behind it.
 */
const DOOR_DEPTH = 405;

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
 * Closed, it blocks the player (an Arcade static body) and every grid cell the
 * footprint spans (so it also blocks radar and enforcer pathing). Opening clears
 * both. A door with a non-zero `key` is *locked*: a terminal hack force-opens it
 * regardless, and Rowan opens it by hand only while carrying the matching keycard
 * — see {@link opensWith}. A door authored `LOCKED` with **no** id is sealed
 * outright, since there is no credential that could name it.
 *
 * **The body is a zone sized by `colliderRect`, not the sprite.** It used to ride
 * on the sprite — `setDisplaySize(footprint) + refreshBody()` — which covered the
 * raw `colSpan x rowSpan` footprint and ignored the tile's authored
 * `ColliderPadding`. Every shipped door def carries some: the north-south defs
 * inset `{Bottom: 0.4}`, so the lower 12.8px of a doorway that should be walkable
 * was solid, and the east-west defs inset `{Left: 0.2, Right: 0.2}`, so a
 * 19.2px-wide body was 32. `colliderRect` in `src/map/footprint.ts` exists
 * precisely to apply that padding, and `src/map/TileBake.ts` has always routed
 * padded *walls* through it — this class was the one collider path that never
 * called it.
 *
 * Its own zone also frees the sprite to be rescaled by an animation (`playClip`
 * re-asserts `setDisplaySize` after every `play()`) without collision noticing.
 * What it must *not* be free to do is stand somewhere else: the pass that
 * introduced the zone also decoupled its vertical seating from the art's, which
 * left the solid box 12px below the drawn door on every east-west def. Both now
 * come from one call to `doorSeating` in `src/entities/doorGeometry.ts`, which
 * is also where the reasoning and the tests for it live.
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
 * the map-tile fallback keeps the centred seating it was authored for. The
 * collider is seated off the same call, so it goes wherever the art goes.
 *
 * **A door blocks for as long as it is in the way, opening included.** It used
 * to be the other way round: `setOpen` flipped the collision grid and the Arcade
 * body the instant it was called and the slide merely played over the top, so a
 * door you had just tapped was passable for the whole 1350ms of `OPEN_SEQUENCE`
 * — 750ms of `UNLOCKED` indicator on a door that has not moved, then 600ms of
 * travel — while still drawn shut. Passability now comes from `doorBlocks` in
 * `src/entities/doorGeometry.ts` and only clears when the slide finishes.
 *
 * Nothing else had to move for that, which is worth recording because the fear
 * of it is why the first pass left the bug in:
 *
 * - **The player** is the only thing that collides with a door's Arcade body
 *   (`GameScene` builds one collider, `player.sprite` against `doorBodies`), so
 *   this is felt exactly where it was asked for and nowhere else.
 * - **Guards** never touch that body. They read the grid, and `Pathfinder`
 *   already routes through a shut-but-openable door at `DOOR_STEP_COST` rather
 *   than treating it as wall — so a cell that stays blocked through the slide
 *   costs a guard nothing, and `workDoors` holds its `heldDoor` across those
 *   frames rather than trying to open it twice.
 * - **Re-pathing** gets quieter, not noisier: `CollisionGrid.setBlocked`
 *   early-returns when a cell is already in the state asked for, so holding the
 *   block through the slide means one `revision` bump at the end instead of one
 *   at the start.
 *
 * `isOpen` deliberately still reports what the door was *told* to be, which is
 * what the noise ping, the anomaly scan, the interact prompt and `doorWork.ts`
 * all mean by it. {@link isSolid} is the physical answer.
 */
export class Door {
  readonly tileX: number;
  readonly tileY: number;
  readonly stats: DoorStats;
  readonly locked: boolean;
  /** Clear glazing: blocks movement while closed, but never line of sight. */
  readonly seeThrough: boolean;

  private open: boolean;
  /** Art only. Collision lives on {@link collider} — see the class doc. */
  private readonly image: Phaser.GameObjects.Sprite;
  /**
   * The static body the player collides with, sized from the tile's authored
   * `ColliderPadding` rather than from the sprite. See the class doc.
   */
  private readonly collider: Phaser.GameObjects.Zone;
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
  /** Whether the player standing there carries what this door asks for. */
  private playerAdmitted = false;

  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, grid: CollisionGrid) {
    this.tileX = tile.x;
    this.tileY = tile.y;
    this.grid = grid;
    this.stats = doorStatsFor(tile.components);
    this.locked = doorIsLocked(this.stats);
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
    // One seating for the art and the collider — see `doorSeating`, which owns
    // both the bottom-seating rule for east-west art and the reason the solid
    // box has to ride along with it. The map-tile fallback keeps the exporter's
    // centred seating, since that's still the art it's tuned for.
    const seating = doorSeating(tile, tileSize, eastWest && hasEntitySprite(scene, this.art));
    const cy = seating.centreY;

    // A static *sprite*, not the plain image the map-tile-only rendering used —
    // the body/collision semantics are identical either way, but only a sprite
    // can `.play()` a clip when hand-drawn art is there to play.
    if (this.closedFrame) {
      this.image = scene.add.sprite(cx, cy, this.closedFrame.textureKey, this.closedFrame.frameKey);
    } else {
      this.image = scene.add.sprite(cx, cy, "__WHITE");
      this.image.setVisible(false);
    }
    this.image
      .setDepth(DOOR_DEPTH)
      .setDisplaySize(this.displayW, this.displayH)
      .setFlipY(tile.flipY === true)
      .setTint(tile.tint);

    // The body is its own zone, built from the tile's authored collider rather
    // than from the sprite — the same `colliderRect` -> `add.zone` route
    // `buildWallBodies` in `src/map/TileBake.ts` takes for a padded wall, seated
    // on the same centre line as the art above.
    const rect = seating.collider;
    this.collider = scene.add.zone(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h);
    scene.physics.add.existing(this.collider, true);

    // Grid footprint: every cell whose centre falls inside the door rectangle.
    this.cells = footprintCells(tile, tileSize);

    this.applyState();
  }

  /** The Arcade body used for player collision. */
  get body(): Phaser.GameObjects.Zone {
    return this.collider;
  }

  /** What the door was last *told* to be. See the class doc, and {@link isSolid}. */
  get isOpen(): boolean {
    return this.open;
  }

  /**
   * Whether the door is physically in the way right now.
   *
   * True while shut, and while a slide is running in either direction — an
   * opening door is still a door until its travel finishes. This is what drives
   * both the Arcade body and the grid; `isOpen` is the commanded state.
   */
  get isSolid(): boolean {
    return doorBlocks(this.open, this.sliding);
  }

  /**
   * Whether this door takes no credential at all.
   *
   * **Not the player's question — the *guards'*.** `GameScene.guardOperableDoorAt`
   * reads this to decide what a patrol may work for itself, and a keycard door is a
   * chokepoint for them too. Teaching it about inventory would hand every guard on
   * the level whatever Rowan is carrying, so the player's path goes through
   * {@link opensWith} instead and this stays a property of the door alone.
   */
  get isManual(): boolean {
    return !this.locked;
  }

  /**
   * Whether whoever is holding `inventory` can open this by hand.
   *
   * A keycard does not *unlock* the door — {@link locked} stays `readonly`, because
   * the door has not changed. It says this opener is carrying the credential the door
   * asks for, which is why the answer is a function of who is standing there rather
   * than state anybody mutates.
   *
   * A `state: "locked"` door with `key: 0` names no clearance, so nothing opens it by
   * hand however well equipped Rowan is; a terminal hack is the only way through.
   */
  opensWith(inventory: readonly string[]): boolean {
    return doorOpensWith(this.stats, inventory);
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
   *
   * It also carries the slide watchdog, for having the one hook that already
   * runs over every door every frame. Now that an opening door is solid until
   * its `animationcomplete` fires, a slide that never gets there — a scene
   * paused mid-travel, a listener lost to an interruption — would wall a doorway
   * off permanently. Cheap: a boolean and a flag Phaser already maintains.
   */
  senseProximity(playerTileX: number, playerTileY: number, inventory: readonly string[]): void {
    if (this.sliding && !this.image.anims.isPlaying) this.settle();
    const dx = this.tileX + 0.5 - playerTileX;
    const dy = this.tileY + 0.5 - playerTileY;
    const near = dx * dx + dy * dy <= DOOR_SENSE_TILES * DOOR_SENSE_TILES;
    // Short-circuited on `locked` so an ordinary door costs the same comparison it
    // always did — only a door that actually asks for a credential scans the bag.
    const admits = !this.locked || this.opensWith(inventory);
    // Both, because picking a keycard up while already standing at the door has to
    // turn the denial light off without the player stepping away and back.
    if (near === this.playerNear && admits === this.playerAdmitted) return;
    this.playerNear = near;
    this.playerAdmitted = admits;
    // Mid-slide the sprite is busy, and `refreshClip` on completion will pick
    // up whatever the flag says by then.
    if (!this.sliding) this.refreshClip();
  }

  /**
   * `changed` is false at construction, so a door that boots already open just
   * appears that way — no slide played for a change that never happened.
   */
  private applyState(changed = false): void {
    if (hasEntitySprite(this.image.scene, this.art)) {
      if (changed) this.playSlide();
      else this.refreshClip();
    } else {
      // No art on disk (or it hasn't loaded) — the original map-tile-frame swap.
      const frame = this.open ? this.openFrame : this.closedFrame;
      if (frame) {
        this.image.setTexture(frame.textureKey, frame.frameKey);
        this.image.setDisplaySize(this.displayW, this.displayH);
      }
    }
    // *After* the sprite, because `playSlide` is what raises `sliding`, and an
    // opening door stays solid for as long as that flag is up. With no art there
    // is no slide, so this still flips instantly, exactly as it always did.
    this.applyCollision();
  }

  /**
   * Points the grid and the Arcade body at {@link isSolid}.
   *
   * Called on every state change and again when a slide finishes — the second
   * call is the one that actually opens the doorway. Glazed doors stay
   * transparent to sight the whole time, blocking or not.
   */
  private applyCollision(): void {
    const solid = this.isSolid;
    for (const c of this.cells) this.grid.setBlocked(c.x, c.y, solid, this.seeThrough);
    (this.collider.body as Phaser.Physics.Arcade.StaticBody).enable = solid;
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
    // Off `playerAdmitted`, not `locked`: a door refusing a man who is holding its own
    // keycard is the indicator telling him something untrue.
    if (this.playerNear) return this.playerAdmitted ? "SCAN" : "LOCKED";
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
   *
   * The completion is load-bearing now, not just cosmetic: it is the moment an
   * opening door stops being solid. {@link settle} is that moment, and
   * {@link senseProximity} watches for a slide that never reaches it.
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
      this.settle();
    });
  }

  /**
   * Ends a slide: the door has arrived, so it is whatever it was told to be.
   *
   * Collision before the clip, because the clip is what the player sees and the
   * collision is what they walk into — and `refreshClip` starts an animation,
   * which would otherwise make the watchdog's "is anything playing" test true
   * again before the doorway had actually opened.
   */
  private settle(): void {
    this.sliding = false;
    this.applyCollision();
    this.refreshClip();
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
