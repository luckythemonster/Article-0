import Phaser from "phaser";
import type { GameTile } from "../map/types";
import type { CollisionGrid } from "../systems/CollisionGrid";
import { doorStatsFor, type DoorStats } from "../systems/EntityStats";

/**
 * An interactive door.
 *
 * Closed, it blocks the player two ways at once: an Arcade static body (so it
 * stops movement exactly like a wall) and a {@link CollisionGrid} cell (so it
 * also blocks line of sight, radar, and enforcer pathing). Opening clears both;
 * closing restores both. A door with a non-zero `key` is *locked* — it can't be
 * opened by hand, only by a terminal hack (or, later, a matching keycard).
 *
 * Renders its own sprite from the map tile's frame (the `doors` board is added
 * to GameScene's ENTITY_LAYERS so the static renderer skips it).
 */
export class Door {
  readonly tileX: number;
  readonly tileY: number;
  readonly stats: DoorStats;
  readonly locked: boolean;

  private open: boolean;
  private readonly image?: Phaser.Physics.Arcade.Image;
  private readonly grid: CollisionGrid;

  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, grid: CollisionGrid) {
    this.tileX = tile.x;
    this.tileY = tile.y;
    this.grid = grid;
    this.stats = doorStatsFor(tile.components);
    this.locked = this.stats.key !== 0 || this.stats.state === "locked";
    this.open = this.stats.state === "open";

    const px = (tile.x + 0.5) * tileSize;
    const py = (tile.y + 0.5) * tileSize;
    if (tile.frame) {
      this.image = scene.physics.add.staticImage(px, py, tile.frame.textureKey, tile.frame.frameKey);
    } else {
      // No art resolved — still block with an invisible tile-sized body.
      this.image = scene.physics.add.staticImage(px, py, "__WHITE");
      this.image.setDisplaySize(tileSize, tileSize).refreshBody();
      this.image.setVisible(false);
    }
    this.image.setDepth(120);

    // Apply the initial open/closed state to body + grid + visuals.
    this.applyState();
  }

  /** The Arcade body used for player collision (undefined if art is missing). */
  get body(): Phaser.Physics.Arcade.Image | undefined {
    return this.image;
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Whether the player may open this by hand (adjacent tap). */
  get isManual(): boolean {
    return !this.locked;
  }

  /** Opens the door (if not already). Returns true if it changed state. */
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
    // Grid: closed doors block LOS/radar/enforcers; open doors are clear.
    this.grid.setBlocked(this.tileX, this.tileY, !this.open);

    const body = this.image?.body as Phaser.Physics.Arcade.StaticBody | undefined;
    if (body) body.enable = !this.open;
    if (this.image) {
      // Slide/fade out when open; a faint sliver stays so the frame reads.
      this.image.setAlpha(this.open ? 0.2 : 1);
    }
  }
}
