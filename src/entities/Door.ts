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
 * An interactive door, sized and placed from the map's authoring data.
 *
 * The door art is drawn pre-squished into a 32px cell but describes a larger
 * footprint via the tile's `colSpan`/`rowSpan` (single doors 1.5 tiles, double
 * doors 2.5) and is nudged into place with `offsetX`/`offsetY` — so we scale the
 * sprite to that footprint and centre it (the editor anchors doors at centre).
 * The two keyframes give distinct **closed** and **open** sprites, which we swap
 * on state change rather than just fading.
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
 * gives every door four *authored* states — `IDLE`/`LOCKED`/`UNLOCKED`, all
 * two-frame blinking indicator-light loops, plus a resting `OPEN` loop and an
 * `OPENING`/`CLOSING` swing — where the map's own tile art has always carried
 * only two (`closed`/`open`). Picking `EntitySpriteId` is two independent
 * choices: {@link isGlass} for the material, and whether the tile's footprint
 * runs long in the row axis (`rowSpan > colSpan`) for the orientation — a
 * north-south door's swing clearance is what makes it 1×1.5 instead of the
 * east-west door's plain 1×1, so the footprint itself says which art to ask
 * for. `LOCKED`/`OPENING`/`CLOSING` read the *same* casing on all four
 * sources; the plain "door, nothing else going on" tag does not — it's `IDLE`
 * on the east-west pair and `idle` on the north-south pair, an artist
 * inconsistency between the two orientations that's read around rather than
 * "fixed" (the same call the breaker keypad's endianness note makes).
 *
 * The **open/closed transition is cosmetic only.** `setOpen` still flips the
 * collision grid and the Arcade body the instant it's called, exactly as
 * before art existed — a guard's `doorWork.ts` timing, the noise system, and
 * every pathing cost all assume that. The `OPENING`/`CLOSING` swing just plays
 * over it, so for a few frames the sprite can be mid-swing while the tile is
 * already fully passable. Gating passability on the animation instead would
 * ripple into all three systems, which is well past "mount the sprites."
 *
 * `UNLOCKED` is wired but **currently unreachable**: `locked` below is `true`
 * whenever a door has any `key` at all, and it never changes after
 * construction (there is no unlock verb — the Access Chit item is real but not
 * wired to anything, same gap `docs/MAP_AUTHORING.md` already documents). So a
 * keyed door is always `LOCKED`, never `UNLOCKED`, until a terminal hack forces
 * it open directly. Same treatment as the terminal's unwired `DESTROYED` tag:
 * ship the art, wire what current game logic can reach, leave the rest inert.
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
  /** `"IDLE"` on east-west sources, `"idle"` on north-south ones — see class doc. */
  private readonly idleTag: string;

  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, grid: CollisionGrid) {
    this.tileX = tile.x;
    this.tileY = tile.y;
    this.grid = grid;
    this.stats = doorStatsFor(tile.components);
    this.locked = this.stats.key !== 0 || this.stats.state === "locked";
    this.seeThrough = isGlass(tile.components) && !glassStatsFor(tile.components).visionBlock;
    this.open = this.stats.state === "open";

    const northSouth = tile.rowSpan > tile.colSpan;
    const glass = isGlass(tile.components);
    this.art = glass
      ? northSouth
        ? "door-glass-north-south"
        : "door-glass-east-west"
      : northSouth
        ? "door-single-north-south"
        : "door-single-east-west";
    this.idleTag = northSouth ? "idle" : "IDLE";

    this.closedFrame = tile.stateFrames?.closed ?? tile.frame;
    this.openFrame = tile.stateFrames?.open ?? this.closedFrame;
    this.displayW = tile.colSpan * tileSize;
    this.displayH = tile.rowSpan * tileSize;

    // Centre of the footprint, in pixels (cell centre + authored offset).
    const cx = (tile.x + 0.5) * tileSize + tile.offsetX;
    const cy = (tile.y + 0.5) * tileSize + tile.offsetY;

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
    this.applyState(open ? "OPENING" : "CLOSING");
    return true;
  }

  toggle(): boolean {
    return this.setOpen(!this.open);
  }

  /**
   * `transition` is only given on a real state *change* — construction calls
   * this with none, so a door that boots already open just appears that way,
   * with no swing played for a change that never happened.
   */
  private applyState(transition?: "OPENING" | "CLOSING"): void {
    // Grid: closed doors block their whole footprint; open doors clear it. Glazed doors
    // stay transparent to sight the whole time, closed or not.
    for (const c of this.cells) this.grid.setBlocked(c.x, c.y, !this.open, this.seeThrough);

    const body = this.image.body as Phaser.Physics.Arcade.StaticBody;
    body.enable = !this.open;

    if (hasEntitySprite(this.image.scene, this.art)) {
      this.playArt(transition);
      return;
    }

    // No art on disk (or it hasn't loaded) — the original map-tile-frame swap.
    const frame = this.open ? this.openFrame : this.closedFrame;
    if (frame) {
      this.image.setTexture(frame.textureKey, frame.frameKey);
      this.image.setDisplaySize(this.displayW, this.displayH);
    }
  }

  /** Which closed-door indicator loops: dark/idle, or lit red for locked. */
  private get closedIndicatorTag(): string {
    // key === 0 with no lock authored: no card reader on this door at all —
    // the plain idle lamp, not "unlocked" (there was never anything to unlock).
    if (this.stats.key === 0 && !this.locked) return this.idleTag;
    return this.locked ? "LOCKED" : "UNLOCKED";
  }

  private playArt(transition?: "OPENING" | "CLOSING"): void {
    const sprite = this.image;
    const key = transition === "CLOSING" ? this.closingClipKey() : this.openingClipKey(transition);
    if (key !== undefined) {
      // Clears any listener from an interrupted transition — otherwise it would
      // still fire on *this* clip's completion and could double-chain into the
      // loop, or race a still-later transition that superseded this one.
      sprite.off("animationcomplete");
      sprite.play(key);
      sprite.once("animationcomplete", (anim: Phaser.Animations.Animation) => {
        if (anim.key === key) this.playLoop();
      });
      return;
    }
    this.playLoop();
  }

  /** `OPENING` is a named tag — straightforward, but only when actually opening. */
  private openingClipKey(transition?: "OPENING" | "CLOSING"): string | undefined {
    if (transition !== "OPENING") return undefined;
    return ensureEntityAnim(this.image.scene, this.art, "OPENING", undefined, 0);
  }

  /**
   * `CLOSING` isn't its own tag on any of the four sources — it names the same
   * frame range as `OPENING` (the door swinging through the same poses either
   * way), so closing is that range player in reverse. Built once per sprite,
   * under a key of its own, from `OPENING`'s frames read backwards.
   */
  private closingClipKey(): string | undefined {
    const scene = this.image.scene;
    const key = entityAnimKey(this.art, "CLOSING");
    if (scene.anims.exists(key)) return key;
    const opening = clipFrames(this.art, "OPENING");
    if (opening.length === 0) return undefined;
    return ensureEntityClip(scene, this.art, key, [...opening].reverse(), 0);
  }

  /** The looping clip for wherever the door has settled: open, or closed-and-X. */
  private playLoop(): void {
    const tag = this.open ? "OPEN" : this.closedIndicatorTag;
    const key = ensureEntityAnim(this.image.scene, this.art, tag);
    if (key) this.image.play(key, true);
  }
}
