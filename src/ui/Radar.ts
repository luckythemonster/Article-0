import Phaser from "phaser";
import { RADAR_RADIUS_TILES, type RadarSnapshot } from "../systems/Radar";

const PANEL_BG = 0x0a0f16;
const PANEL_BG_ALPHA = 0.85;
const BEZEL_COLOR = 0x2b4356;
const CROSSHAIR_COLOR = 0x1c2c38;
const WALL_COLOR = 0x3a5568;
const PLAYER_COLOR = 0x39d3ff;
const GUARD_COLOR = 0xffe14d;
const GUARD_ALERT_COLOR = 0xff3b3b;
const JAM_BG = 0x2a0a0a;
const JAM_NOISE_COLOR = 0xff6b6b;

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
  private readonly radius = 46;
  private readonly pxPerTile: number;
  private cx = 0;
  private cy = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.pxPerTile = this.radius / RADAR_RADIUS_TILES;

    this.maskShape = scene.make.graphics({}, false);
    this.content = scene.add.graphics().setScrollFactor(0).setDepth(1000);
    this.content.setMask(this.maskShape.createGeometryMask());

    this.bezel = scene.add.graphics().setScrollFactor(0).setDepth(1001);

    this.jamText = scene.add
      .text(0, 0, "JAMMED", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#ff8a8a",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);

    this.reposition();
    scene.scale.on("resize", () => this.reposition());
  }

  private reposition(): void {
    const pad = 12;
    this.cx = this.scene.scale.width - pad - this.radius;
    this.cy = pad + this.radius;
    this.drawBezel();
    this.maskShape.clear();
    this.maskShape.fillStyle(0xffffff);
    this.maskShape.fillCircle(this.cx, this.cy, this.radius);
    this.jamText.setPosition(this.cx, this.cy + this.radius + 10);
  }

  private drawBezel(): void {
    this.bezel.clear();
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
    for (const w of snapshot.walls) {
      this.content.fillRect(cx + w.dx * pxPerTile - 1, cy + w.dy * pxPerTile - 1, 2, 2);
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
