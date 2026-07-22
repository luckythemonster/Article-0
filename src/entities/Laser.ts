import Phaser from "phaser";
import type { GameTile } from "../map/types";

/**
 * A laser hazard, drawn procedurally from the map's footprint data.
 *
 * The map places two kinds (behaviour inferred from the `ref`, since the tiles
 * carry no components — same convention as door orientation):
 *  - **scanner** (`laser_scanner_pink`, a 4×4 area) — a pink scan zone with a
 *    rotating sweep line; steps into it while active trip the alarm.
 *  - **beam** (`laser_..._horizontal` / `_vertical`, e.g. a 3×1 red flasher) —
 *    a bright line across its span.
 *
 * Both pulse active/idle on a cadence so there's always a timing window to slip
 * through, and neither blocks movement — the cost of crossing is tripping the
 * alarm. The footprint comes straight from the tile's `colSpan`/`rowSpan` +
 * offset (the sprite frames are an inconsistent 20–23-frame animation, so we
 * draw the beam ourselves rather than fight them).
 */
export type LaserKind = "scanner" | "beam";

const SCANNER_ON = 1.4;
const SCANNER_OFF = 1.0;
const BEAM_ON = 1.7;
const BEAM_OFF = 1.1;

export class Laser {
  readonly kind: LaserKind;
  private readonly horizontal: boolean;
  private active = true;
  private timer: number;
  private sweep = 0;
  /** Debounce so one crossing trips once, not every frame. */
  private crossing = false;

  private readonly cx: number;
  private readonly cy: number;
  private readonly rect: { x: number; y: number; w: number; h: number };
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number) {
    const ref = tile.ref.toLowerCase();
    this.kind = ref.includes("scanner") ? "scanner" : "beam";
    this.horizontal = !ref.includes("vertical");

    const w = tile.colSpan * tileSize;
    const h = tile.rowSpan * tileSize;
    this.cx = (tile.x + 0.5) * tileSize + tile.offsetX;
    this.cy = (tile.y + 0.5) * tileSize + tile.offsetY;

    if (this.kind === "scanner") {
      this.rect = { x: this.cx - w / 2, y: this.cy - h / 2, w, h };
    } else {
      // A thin trip band centred on the beam line.
      const band = tileSize * 0.5;
      this.rect = this.horizontal
        ? { x: this.cx - w / 2, y: this.cy - band / 2, w, h: band }
        : { x: this.cx - band / 2, y: this.cy - h / 2, w: band, h };
    }

    this.timer = this.kind === "scanner" ? SCANNER_ON : BEAM_ON;
    this.gfx = scene.add.graphics().setDepth(430);
    this.draw();
  }

  update(dt: number): void {
    this.sweep += dt * 2.4;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.active = !this.active;
      const [on, off] =
        this.kind === "scanner" ? [SCANNER_ON, SCANNER_OFF] : [BEAM_ON, BEAM_OFF];
      this.timer = this.active ? on : off;
    }
    this.draw();
  }

  /** True on the frame the player first enters this hazard while it's active. */
  checkTrip(px: number, py: number): boolean {
    const inside =
      this.active &&
      px >= this.rect.x &&
      px <= this.rect.x + this.rect.w &&
      py >= this.rect.y &&
      py <= this.rect.y + this.rect.h;
    const tripped = inside && !this.crossing;
    this.crossing = inside;
    return tripped;
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    if (this.kind === "scanner") {
      const fill = this.active ? 0.16 : 0.05;
      g.fillStyle(0xff3bd0, fill);
      g.fillRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
      g.lineStyle(2, 0xff6be0, this.active ? 0.85 : 0.35);
      g.strokeRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
      if (this.active) {
        // Rotating sweep line for that radar feel.
        const r = Math.max(this.rect.w, this.rect.h) * 0.6;
        g.lineStyle(2, 0xff9bec, 0.7);
        g.lineBetween(this.cx, this.cy, this.cx + Math.cos(this.sweep) * r, this.cy + Math.sin(this.sweep) * r);
      }
    } else {
      const color = this.active ? 0xff2b2b : 0x662020;
      g.lineStyle(this.active ? 3 : 1, color, this.active ? 0.95 : 0.4);
      if (this.horizontal) {
        g.lineBetween(this.rect.x, this.cy, this.rect.x + this.rect.w, this.cy);
      } else {
        g.lineBetween(this.cx, this.rect.y, this.cx, this.rect.y + this.rect.h);
      }
      if (this.active) {
        g.fillStyle(0xff2b2b, 0.18);
        g.fillRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
      }
    }
  }
}
