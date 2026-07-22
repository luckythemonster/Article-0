import Phaser from "phaser";
import type { GameTile, SpriteFrame } from "../map/types";
import type { CollisionGrid } from "../systems/CollisionGrid";
import { doorStatsFor, type DoorStats } from "../systems/EntityStats";

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
 * and every grid cell the footprint spans (so it also blocks line of sight,
 * radar, and enforcer pathing). Opening clears both. A door with a non-zero
 * `key` is *locked* — only a terminal hack (or, later, a keycard) opens it.
 */
export class Door {
  readonly tileX: number;
  readonly tileY: number;
  readonly stats: DoorStats;
  readonly locked: boolean;

  private open: boolean;
  private readonly image: Phaser.Physics.Arcade.Image;
  private readonly grid: CollisionGrid;
  private readonly cells: { x: number; y: number }[];
  private readonly closedFrame?: SpriteFrame;
  private readonly openFrame?: SpriteFrame;
  private readonly displayW: number;
  private readonly displayH: number;

  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, grid: CollisionGrid) {
    this.tileX = tile.x;
    this.tileY = tile.y;
    this.grid = grid;
    this.stats = doorStatsFor(tile.components);
    this.locked = this.stats.key !== 0 || this.stats.state === "locked";
    this.open = this.stats.state === "open";

    this.closedFrame = tile.stateFrames?.closed ?? tile.frame;
    this.openFrame = tile.stateFrames?.open ?? this.closedFrame;
    this.displayW = tile.colSpan * tileSize;
    this.displayH = tile.rowSpan * tileSize;

    // Centre of the footprint, in pixels (cell centre + authored offset).
    const cx = (tile.x + 0.5) * tileSize + tile.offsetX;
    const cy = (tile.y + 0.5) * tileSize + tile.offsetY;

    if (this.closedFrame) {
      this.image = scene.physics.add.staticImage(cx, cy, this.closedFrame.textureKey, this.closedFrame.frameKey);
    } else {
      this.image = scene.physics.add.staticImage(cx, cy, "__WHITE");
      this.image.setVisible(false);
    }
    this.image.setDepth(120).setDisplaySize(this.displayW, this.displayH).refreshBody();

    // Grid footprint: every cell whose centre falls inside the door rectangle.
    this.cells = footprintCells(tile, tileSize);

    this.applyState();
  }

  /** The Arcade body used for player collision. */
  get body(): Phaser.Physics.Arcade.Image {
    return this.image;
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Whether the player may open this by hand (adjacent tap). */
  get isManual(): boolean {
    return !this.locked;
  }

  /** Opens/closes the door. Returns true if it changed state. */
  setOpen(open: boolean): boolean {
    if (this.open === open) return false;
    this.open = open;
    this.applyState();
    return true;
  }

  toggle(): boolean {
    return this.setOpen(!this.open);
  }

  private applyState(): void {
    // Grid: closed doors block their whole footprint; open doors clear it.
    for (const c of this.cells) this.grid.setBlocked(c.x, c.y, !this.open);

    const body = this.image.body as Phaser.Physics.Arcade.StaticBody;
    body.enable = !this.open;

    // Swap to the matching sprite (re-apply size — setTexture resets it).
    const frame = this.open ? this.openFrame : this.closedFrame;
    if (frame) {
      this.image.setTexture(frame.textureKey, frame.frameKey);
      this.image.setDisplaySize(this.displayW, this.displayH);
    }
  }
}

/** Grid cells whose centre lies inside a tile's footprint rectangle. */
function footprintCells(tile: GameTile, tileSize: number): { x: number; y: number }[] {
  const halfW = tile.colSpan / 2;
  const halfH = tile.rowSpan / 2;
  const cx = tile.x + 0.5 + tile.offsetX / tileSize;
  const cy = tile.y + 0.5 + tile.offsetY / tileSize;
  const cells: { x: number; y: number }[] = [];
  for (let gy = Math.floor(cy - halfH); gy <= Math.ceil(cy + halfH); gy++) {
    for (let gx = Math.floor(cx - halfW); gx <= Math.ceil(cx + halfW); gx++) {
      if (Math.abs(gx + 0.5 - cx) <= halfW && Math.abs(gy + 0.5 - cy) <= halfH) {
        cells.push({ x: gx, y: gy });
      }
    }
  }
  // Always cover at least the placed cell.
  if (cells.length === 0) cells.push({ x: tile.x, y: tile.y });
  return cells;
}
