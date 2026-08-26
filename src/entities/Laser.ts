import Phaser from "phaser";
import type { GameTile } from "../map/types";
import { paced } from "../systems/EntityStats";
import { ensureEntityAnim, hasEntitySprite } from "./EntitySprites";

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
 * offset.
 *
 * ### Hand-drawn art, when it's on disk
 *
 * A **beam** is dressed with `laser-beam` segments tiled along its span and a
 * `laser-emitter` housing at each end, facing inward. The emitter's tags carry
 * the three states this class already had and had no way to show: it fires while
 * the beam is up, sits `idle` through the pulse's off window, and goes
 * `deactivated` under an EMP — so a suppressed emitter now reads as suppressed
 * rather than as a beam that happens to be mid-blink.
 *
 * The **scanner** keeps its `Graphics`. Its sweep is a rotating line over a 4x4
 * area and there is no art for it; the bundle's trip lasers are doorway-width
 * beams, not scan zones, so borrowing them would misdescribe the hazard.
 *
 * **Optional, and fails open** — the same probe every other sprite goes through.
 * The `Graphics` is built either way and simply draws nothing where sprites took
 * over, so a missing strip costs the dressing and never the hazard: the trip
 * rectangle in {@link checkTrip} is computed from the tile and never from the
 * art.
 */
export type LaserKind = "scanner" | "beam";

/**
 * Above the doors (405) and below the orderlies (440).
 *
 * A beam crosses a doorway and has to paint over the door it crosses; a body
 * walking through the beam has to paint over the beam. See `src/render/depths.ts`.
 */
const LASER_DEPTH = 430;

/** Matches the `laser-emitter` entry in {@link ENTITY_SPRITES}. */
const EMITTER_DISPLAY_TILES = 0.5;

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
  /** Seconds of EMP suppression remaining; while > 0 the hazard is forced off. */
  private empTimer = 0;

  private readonly cx: number;
  private readonly cy: number;
  private readonly rect: { x: number; y: number; w: number; h: number };
  private readonly gfx: Phaser.GameObjects.Graphics;
  /**
   * Beam segments and the two end housings, empty when the art is absent or the
   * hazard is a scanner. Held together because they are shown and hidden as one.
   */
  private readonly segments: Phaser.GameObjects.Sprite[] = [];
  private readonly emitters: Phaser.GameObjects.Sprite[] = [];
  /** What the emitters are currently playing, so a repeat is not restarted. */
  private emitterTag = "";

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
    this.gfx = scene.add.graphics().setDepth(LASER_DEPTH);
    if (this.kind === "beam") this.buildArt(scene, tileSize, w, h);
    this.draw();
  }

  /**
   * Lays the beam segments and the two housings out along the span.
   *
   * Segment count comes off the span rather than a constant: a 3x1 beam gets
   * three, and a longer one gets as many as it needs. They are placed on tile
   * centres, which is where the map's own beam runs sit, so the drawn line lands
   * on the trip band {@link rect} describes instead of near it.
   *
   * The housings face *inward* — a horizontal beam is fired east from its west
   * end and west from its east end — which is what makes a beam read as
   * something projected across the gap rather than a stripe painted on the
   * floor.
   */
  private buildArt(scene: Phaser.Scene, tileSize: number, w: number, h: number): void {
    if (!hasEntitySprite(scene, "laser-beam") || !hasEntitySprite(scene, "laser-emitter")) return;

    const span = this.horizontal ? w : h;
    const count = Math.max(1, Math.round(span / tileSize));
    const beamTag = this.horizontal ? "east-west" : "north-south";
    // `undefined` means the strip is there but that tag is not — a redraw that
    // renamed or dropped it. Fall back to the drawn line rather than shipping an
    // invisible hazard; `draw()` keys off `segments` being empty.
    const beamAnim = ensureEntityAnim(scene, "laser-beam", beamTag);
    if (!beamAnim) return;

    const start = this.horizontal ? this.cx - span / 2 : this.cy - span / 2;
    for (let i = 0; i < count; i++) {
      const along = start + (i + 0.5) * (span / count);
      const sprite = scene.add
        .sprite(this.horizontal ? along : this.cx, this.horizontal ? this.cy : along, "entity-laser-beam")
        .setDepth(LASER_DEPTH)
        .setDisplaySize(tileSize, tileSize);
      sprite.play(beamAnim);
      this.segments.push(sprite);
    }

    // Half a tile, matching this sprite's `displayTiles` — a housing is a fitting
    // bolted into its cell, not something filling it.
    const housing = tileSize * EMITTER_DISPLAY_TILES;
    const ends: [number, number, string][] = this.horizontal
      ? [
          [start, this.cy, "east"],
          [start + span, this.cy, "west"],
        ]
      : [
          [this.cx, start, "south"],
          [this.cx, start + span, "north"],
        ];
    for (const [x, y, facing] of ends) {
      const sprite = scene.add
        .sprite(x, y, "entity-laser-emitter")
        .setDepth(LASER_DEPTH)
        .setDisplaySize(housing, housing);
      sprite.setData("facing", facing);
      this.emitters.push(sprite);
    }
  }

  /** Suppresses this hazard for a stretch (an EMP Grenade burst). */
  emp(seconds: number): void {
    this.empTimer = Math.max(this.empTimer, seconds);
  }

  update(dt: number): void {
    // Only the sweep line's rotation is paced — the active/idle pulse below is a
    // timing window the player reads and slips through, so it stays real-time.
    this.sweep += dt * paced(2.4);
    // While EMP-suppressed the hazard holds off — no pulse toggle, no trip.
    if (this.empTimer > 0) {
      this.empTimer = Math.max(0, this.empTimer - dt);
      this.active = false;
      this.draw();
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.active = !this.active;
      const [on, off] =
        this.kind === "scanner" ? [SCANNER_ON, SCANNER_OFF] : [BEAM_ON, BEAM_OFF];
      this.timer = this.active ? on : off;
    }
    this.draw();
  }

  /** World-space centre of the hazard (used to test EMP-burst reach). */
  get x(): number {
    return this.cx;
  }
  get y(): number {
    return this.cy;
  }

  /** True while suppressed by an EMP Grenade burst — guards treat this as an anomaly. */
  get isEmped(): boolean {
    return this.empTimer > 0;
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

  /**
   * Puts the sprites in step with the hazard's state.
   *
   * Three states, and the emitter is the only thing that can tell them apart:
   * firing, resting between pulses, and suppressed. The beam segments are simply
   * shown or hidden, since a beam that is off is not there.
   *
   * A no-op when the art is absent — `emitters` is empty and the loop does not
   * run — which is what keeps {@link draw} the single source of the fallback.
   */
  private syncArt(): void {
    for (const seg of this.segments) seg.setVisible(this.active);

    const tag = this.empTimer > 0 ? "deactivated" : this.active ? "" : "idle";
    if (tag === this.emitterTag) return;
    this.emitterTag = tag;
    for (const emitter of this.emitters) {
      // An empty tag means "fire", and which direction that is was decided once
      // at construction — so it is read back off the sprite rather than
      // recomputed from the geometry every time the pulse turns over.
      const clip = tag === "" ? (emitter.getData("facing") as string) : tag;
      const key = ensureEntityAnim(emitter.scene, "laser-emitter", clip);
      if (key) emitter.play(key, true);
    }
  }

  private draw(): void {
    this.syncArt();
    const g = this.gfx;
    g.clear();
    // Where the sprites took over, the fallback line would double-draw over
    // them — so a dressed beam draws nothing and the art is the whole of it.
    if (this.segments.length > 0) return;
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
