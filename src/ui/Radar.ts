import Phaser from "phaser";
import { RADAR_RADIUS_TILES, type RadarSnapshot } from "../systems/Radar";
import { FONT_MONO } from "./fonts";
import { RADAR_RADIUS } from "./hudLayout";
import { UI, UI_DEPTH, UI_PAD, UI_TEXT, hex } from "./hudTheme";
import { hasUiTexture } from "./UiTextures";
import { onResize } from "./resize";

/** Optional ring art; absent by default, in which case the bezel is stroked. */
const BEZEL_TEXTURE = "ui-radar-bezel";

const PANEL_BG = hex(UI.bgPanel);
const PANEL_BG_ALPHA = 0.85;
const BEZEL_COLOR = hex(UI.borderCool);
const PLAYER_COLOR = hex(UI.cyan);
const GUARD_COLOR = hex(UI.amberBright);
const GUARD_ALERT_COLOR = hex(UI.redDeep);

// Interior mixes, not palette entries: these exist only inside the scope's
// circle and are tuned against its own backdrop rather than the HUD's. See the
// note in `hudTheme.ts` about what does and does not belong in the shared set.
const CROSSHAIR_COLOR = 0x2a2f4e;
const WALL_COLOR = 0x424c6e;
const JAM_BG = 0x1c121c;
const JAM_NOISE_COLOR = hex(UI.red);

/**
 * Soliton-radar-style circular minimap, screen-anchored top-right.
 *
 * World-aligned (does not rotate with the player) so it reads as a plan view
 * of the room, like the classic Metal Gear radar: guard blips and nearby
 * terrain within {@link RADAR_RADIUS_TILES}, with the player as a facing
 * triangle at the centre. During ALERT the feed is jammed — a flickering
 * red static in place of blips/terrain — so the radar's safety net drops out
 * exactly when guards are actively hunting.
 *
 * Draws into a masked Graphics object (circle geometry mask) so content
 * clips cleanly at the bezel; a second, unmasked Graphics draws the ring on
 * top so the edge stays crisp.
 */
export class Radar {
  private readonly scene: Phaser.Scene;
  private readonly content: Phaser.GameObjects.Graphics;
  private readonly bezel: Phaser.GameObjects.Graphics;
  private readonly maskShape: Phaser.GameObjects.Graphics;
  private readonly jamText: Phaser.GameObjects.Text;
  /** Created lazily, and only when the optional ring art is present. */
  private bezelImage?: Phaser.GameObjects.Image;
  private readonly radius = RADAR_RADIUS;
  private readonly pxPerTile: number;
  private cx = 0;
  private cy = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.pxPerTile = this.radius / RADAR_RADIUS_TILES;

    this.maskShape = scene.make.graphics({}, false);
    this.content = scene.add.graphics().setScrollFactor(0).setDepth(UI_DEPTH.BASE);
    this.content.setMask(this.maskShape.createGeometryMask());

    this.bezel = scene.add.graphics().setScrollFactor(0).setDepth(UI_DEPTH.FILL);

    this.jamText = scene.add
      .text(0, 0, "JAMMED", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.micro,
        color: UI.red,
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.ACCENT)
      .setVisible(false);

    this.reposition();
    onResize(scene, () => this.reposition());
  }

  private reposition(): void {
    const pad = UI_PAD;
    this.cx = this.scene.scale.width - pad - this.radius;
    this.cy = pad + this.radius;
    this.drawBezel();
    this.maskShape.clear();
    this.maskShape.fillStyle(0xffffff);
    this.maskShape.fillCircle(this.cx, this.cy, this.radius);
    this.jamText.setPosition(this.cx, this.cy + this.radius + 10);
  }

  /**
   * The scope's ring — from art when `ui-radar-bezel` is present, otherwise the
   * stroked circle this has always drawn.
   *
   * The art must have a transparent interior: the scope's contents are drawn into
   * a separate, masked Graphics *beneath* this, so anything opaque inside the ring
   * hides the blips rather than sitting behind them.
   */
  private drawBezel(): void {
    this.bezel.clear();

    if (hasUiTexture(this.scene, BEZEL_TEXTURE)) {
      this.bezelImage ??= this.scene.add
        .image(this.cx, this.cy, BEZEL_TEXTURE)
        .setScrollFactor(0)
        .setDepth(UI_DEPTH.FILL);
      this.bezelImage.setPosition(this.cx, this.cy);
      return;
    }

    this.bezel.lineStyle(2, BEZEL_COLOR, 1);
    this.bezel.strokeCircle(this.cx, this.cy, this.radius);
  }

  update(snapshot: RadarSnapshot): void {
    const { cx, cy, pxPerTile } = this;
    this.jamText.setVisible(snapshot.jammed);

    this.content.clear();

    if (snapshot.jammed) {
      this.content.fillStyle(JAM_BG, PANEL_BG_ALPHA);
      this.content.fillCircle(cx, cy, this.radius);
      // Regenerated every frame: flickering static, classic "signal lost".
      this.content.fillStyle(JAM_NOISE_COLOR, 0.5);
      const noiseDots = 22;
      for (let i = 0; i < noiseDots; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * this.radius;
        this.content.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.5, 1.5);
      }
      return;
    }

    this.content.fillStyle(PANEL_BG, PANEL_BG_ALPHA);
    this.content.fillCircle(cx, cy, this.radius);

    this.content.lineStyle(1, CROSSHAIR_COLOR, 1);
    this.content.lineBetween(cx - this.radius, cy, cx + this.radius, cy);
    this.content.lineBetween(cx, cy - this.radius, cx, cy + this.radius);

    this.content.fillStyle(WALL_COLOR, 1);
    const walls = snapshot.walls;
    for (let i = 0; i < walls.count; i++) {
      this.content.fillRect(
        cx + walls.dx(i) * pxPerTile - 1,
        cy + walls.dy(i) * pxPerTile - 1,
        2,
        2,
      );
    }

    for (const b of snapshot.blips) {
      const bx = cx + b.dx * pxPerTile;
      const by = cy + b.dy * pxPerTile;
      const color = b.alerted ? GUARD_ALERT_COLOR : GUARD_COLOR;
      this.content.fillStyle(color, 1);
      this.content.fillCircle(bx, by, b.alerted ? 3 : 2.2);
      this.content.lineStyle(1.5, color, 0.9);
      this.content.lineBetween(bx, by, bx + Math.cos(b.facing) * 5, by + Math.sin(b.facing) * 5);
    }

    this.drawPlayerMarker(cx, cy, snapshot.facing);
  }

  /** A small filled triangle pointing along the player's facing angle. */
  private drawPlayerMarker(cx: number, cy: number, facing: number): void {
    const size = 5;
    const tip = { x: cx + Math.cos(facing) * size, y: cy + Math.sin(facing) * size };
    const back = facing + Math.PI;
    const spread = Phaser.Math.DegToRad(140);
    const l = { x: cx + Math.cos(back - spread / 2) * size, y: cy + Math.sin(back - spread / 2) * size };
    const r = { x: cx + Math.cos(back + spread / 2) * size, y: cy + Math.sin(back + spread / 2) * size };
    this.content.fillStyle(PLAYER_COLOR, 1);
    this.content.fillTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
  }
}
