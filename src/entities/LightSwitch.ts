import type Phaser from "phaser";
import type { GameTile } from "../map/types";
import { lightSwitchStatsFor, type LightSwitchStats } from "../systems/EntityStats";
import {
  entitySpriteKey,
  hasEntitySprite,
  type EntitySpriteId,
} from "./EntitySprites";

/**
 * A wall plate that kills the lights in one zone. The quiet half of the power grid.
 *
 * ### What makes it different from a breaker
 *
 * Everything except the fact that both cut power. `src/entities/Breaker.ts` is a
 * cabinet: it plays a 2.4-second keypad sequence you cannot interrupt, it is heard
 * seven tiles out, it is charged as a breach, and the facility sends an orderly to
 * put it back. That is the price of taking a whole wing.
 *
 * This is a light switch. It flips instantly, it is heard two tiles out, **nobody is
 * charged and nobody is sent**, and it takes exactly the room you are standing in.
 * The contrast is the mechanic, not an oversight: the breaker is the loud move that
 * buys a lot of darkness on a clock, and the switch is the quiet one that buys a
 * little and keeps it. A player who wants a specific room dark and wants to still be
 * nobody has to walk into that room to do it.
 *
 * ### Where they come from
 *
 * Almost always derived rather than placed — `src/map/AutoLight.ts` files one per
 * lit zone, on standable floor with a wall to sit against. A map is free to author
 * them on a `light_switches` board too; the component is the claim, exactly as
 * `power_grid` is for a breaker.
 */

const ART: EntitySpriteId = "light-switch";

export class LightSwitch {
  readonly tileX: number;
  readonly tileY: number;
  /** Pixel centre — public for the same reason as {@link Breaker.x}. */
  readonly x: number;
  readonly y: number;
  readonly stats: LightSwitchStats;

  /** Live circuit state: true when the zone's lights are on. */
  private closed: boolean;

  /**
   * The plate, when there is no art on disk to draw it with.
   *
   * Optional for the reason `EntitySprites` states: every entity here already draws
   * *something*, so missing art costs the upgrade and never the fixture. Same
   * arrangement as `Sensor`'s housing.
   */
  private readonly plate?: Phaser.GameObjects.Graphics;
  private readonly sprite?: Phaser.GameObjects.Sprite;
  private readonly tileSize: number;

  /**
   * @param closed the zone's live state — the persisted `PowerGridState` override
   *   if the player has thrown this one before, and the map's authored `state`
   *   otherwise, so a room they darkened is still dark when they come back to it.
   */
  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, closed: boolean) {
    this.tileX = tile.x;
    this.tileY = tile.y;
    this.x = (tile.x + 0.5) * tileSize + tile.offsetX;
    this.y = (tile.y + 0.5) * tileSize + tile.offsetY;
    this.stats = lightSwitchStatsFor(tile.components);
    this.closed = closed;
    this.tileSize = tileSize;

    if (hasEntitySprite(scene, ART)) {
      this.sprite = scene.add
        .sprite(this.x, this.y, entitySpriteKey(ART))
        .setDisplaySize(tileSize, tileSize)
        // Beside the breaker on the fixture layer, under everything that walks.
        .setDepth(120);
    } else {
      this.plate = scene.add.graphics().setDepth(120);
    }
    this.draw();
  }

  /** True when the zone's lights are on. */
  get isClosed(): boolean {
    return this.closed;
  }

  /**
   * Flips the switch and reports the state it landed in.
   *
   * No `started` return and no callback, unlike {@link Breaker.toggle}: there is no
   * animation to be already playing, so a tap can never be refused and there is
   * nothing to fire mid-way through. The caller acts on the answer directly.
   */
  toggle(): boolean {
    this.closed = !this.closed;
    this.draw();
    return this.closed;
  }

  /**
   * Repaints for the current state.
   *
   * A frame swap where there is art, and where there isn't, a small plate whose
   * rocker is lit while the circuit is closed — the same reading as the breaker
   * cabinet's green screen, so the two fixtures agree about which way "on" looks.
   */
  private draw(): void {
    if (this.sprite) {
      // Two frames if the art has them, frame 0 if it is a single cel.
      const frames = this.sprite.texture.getFrameNames().length;
      if (frames > 1) this.sprite.setFrame(this.closed ? 0 : 1);
      return;
    }

    const g = this.plate;
    if (!g) return;
    const w = this.tileSize * 0.34;
    const h = this.tileSize * 0.46;
    g.clear();
    g.fillStyle(0x1a2330, 1);
    g.fillRect(this.x - w / 2, this.y - h / 2, w, h);
    g.lineStyle(1, 0x424c6e, 1);
    g.strokeRect(this.x - w / 2, this.y - h / 2, w, h);
    // The rocker: bright and high while the lights are on, dim and low while off.
    g.fillStyle(this.closed ? 0xd3fc7e : 0x2a2f4e, 1);
    const rockerH = h * 0.34;
    const top = this.closed ? this.y - h * 0.38 : this.y + h * 0.04;
    g.fillRect(this.x - w * 0.28, top, w * 0.56, rockerH);
  }
}
