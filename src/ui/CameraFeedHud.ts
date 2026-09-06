import Phaser from "phaser";
import type { SurveillanceView } from "../systems/Surveillance";
import { chromeRects, feedViewport, type FeedRect } from "./CameraFeed";
import { FONT_MONO } from "./fonts";
import { UI, UI_DEPTH, UI_TEXT, hex } from "./hudTheme";
import { onResize } from "./resize";

/**
 * The monitor's casing: the veil around the picture, the bezel, which channel is
 * up, the channel list and the key hints.
 *
 * The picture itself is not drawn here and cannot be — it is a second Phaser
 * camera belonging to `GameScene` (`src/scenes/game/CameraFeeds.ts`), and this
 * scene sits above that one entirely. Everything below is therefore arranged
 * *around* a rectangle it must never paint over, which is what {@link chromeRects}
 * is for: the veil is four bands with a hole in the middle rather than a sheet.
 *
 * The two scenes agree on where that hole is by both asking `./CameraFeed.ts`,
 * never by passing the rect between them — the same discipline `hudLayout.ts`
 * exists to enforce, and for the same reason.
 *
 * Reads `SurveillanceView` off the registry like every other widget here, and
 * draws nothing at all when the key is absent, which is how it knows the monitor
 * is down.
 */

/**
 * How dark the room behind the monitor goes.
 *
 * As opaque as the elevator plate's veil, and it has to be: at 0.82 a *lit* room
 * behind it still read through plainly — the level's own darkness overlay was
 * doing most of the hiding, so the veil looked fine over an unlit corridor and
 * failed everywhere a light pool reached. The HUD is drawn above this and stays
 * legible either way, which is what the remaining transparency is for.
 */
const VEIL_ALPHA = 0.94;

/** Scanline spacing and opacity over the picture — the one thing drawn on top. */
const SCANLINE_STEP = 3;
const SCANLINE_ALPHA = 0.14;

/** How many channels the list prints before it starts counting instead. */
const LIST_MAX = 6;

export class CameraFeedHud {
  private readonly veil: Phaser.GameObjects.Graphics;
  private readonly bezel: Phaser.GameObjects.Graphics;
  private readonly scanlines: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly list: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  /** Static over the picture while the feed is jammed. Redrawn per frame. */
  private readonly jam: Phaser.GameObjects.Graphics;
  private readonly jamText: Phaser.GameObjects.Text;

  private vp: FeedRect;
  private shown = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.vp = feedViewport(scene.scale.width, scene.scale.height);

    this.veil = scene.add.graphics().setScrollFactor(0).setDepth(UI_DEPTH.PANEL);
    this.bezel = scene.add.graphics().setScrollFactor(0).setDepth(UI_DEPTH.BASE);
    this.scanlines = scene.add.graphics().setScrollFactor(0).setDepth(UI_DEPTH.FILL);
    this.jam = scene.add.graphics().setScrollFactor(0).setDepth(UI_DEPTH.FILL);

    this.title = this.text(UI_TEXT.label, UI.cyanBright);
    this.status = this.text(UI_TEXT.small, UI.greenSoft);
    this.list = this.text(UI_TEXT.small, UI.textMuted);
    this.hint = this.text(UI_TEXT.small, UI.textDisabled);
    this.jamText = this.text(UI_TEXT.label, UI.red).setOrigin(0.5).setDepth(UI_DEPTH.ACCENT);

    this.setVisible(false);
    onResize(scene, (w, h) => {
      this.vp = feedViewport(w, h);
      if (this.shown) this.layout();
    });
  }

  private text(size: string, color: string): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, "", { fontFamily: FONT_MONO, fontSize: size, color })
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.ACCENT);
  }

  /** One frame. `null` — the registry key absent — means the monitor is down. */
  update(v: SurveillanceView | null): void {
    if (!v || v.index < 0) {
      if (this.shown) this.setVisible(false);
      this.shown = false;
      return;
    }
    if (!this.shown) {
      this.shown = true;
      this.setVisible(true);
      this.layout();
    }

    const channel = v.channels[v.index];
    this.title.setText(channel?.label ?? "NO SIGNAL");

    if (v.jammed) {
      // The radar's own rule, one readout over: during ALERT the facility's mesh is
      // what is hunting Rowan, and the channel he is riding on it goes with it.
      this.status.setText("• SIGNAL LOST").setColor(UI.red);
    } else if (channel?.looped) {
      this.status
        .setText(`◎ LOOPED ${channel.remaining.toFixed(1).padStart(4, "0")}`)
        .setColor(UI.amberBright);
    } else {
      this.status.setText("• LIVE").setColor(UI.greenSoft);
    }

    this.list.setText(this.channelList(v));
    this.drawJam(v.jammed);
  }

  /**
   * The channel strip under the picture.
   *
   * Truncated past {@link LIST_MAX} rather than wrapped or scrolled: no shipped
   * deck has more than four cameras, and a list that could grow a scrollbar would
   * be machinery for a case the map cannot currently produce.
   */
  private channelList(v: SurveillanceView): string {
    const rows = v.channels.slice(0, LIST_MAX).map((c, i) => {
      const mark = i === v.index ? "▸" : " ";
      const state = c.looped ? "LOOP" : "LIVE";
      return `${mark} ${String(i + 1).padStart(2, "0")} ${state}`;
    });
    if (v.channels.length > LIST_MAX) rows.push(`  +${v.channels.length - LIST_MAX} MORE`);
    return rows.join("   ");
  }

  private setVisible(on: boolean): void {
    for (const o of [
      this.veil,
      this.bezel,
      this.scanlines,
      this.jam,
      this.title,
      this.status,
      this.list,
      this.hint,
    ]) {
      o.setVisible(on);
    }
    // The jam tag has a visibility of its own inside `drawJam`; never leave it up
    // over a monitor that has been taken down.
    this.jamText.setVisible(false);
    if (!on) {
      this.jam.clear();
      this.scanlines.clear();
    }
  }

  /** Repaints everything whose position depends only on the viewport. */
  private layout(): void {
    const { x, y, w, h } = this.vp;
    const { width, height } = this.scene.scale;

    this.veil.clear();
    this.veil.fillStyle(hex(UI.bgVoid), VEIL_ALPHA);
    for (const b of chromeRects(this.vp, width, height)) {
      this.veil.fillRect(b.x, b.y, b.w, b.h);
    }

    this.bezel.clear();
    this.bezel.lineStyle(1, hex(UI.borderCool), 1);
    this.bezel.strokeRect(x - 1, y - 1, w + 2, h + 2);

    // Drawn once here rather than per frame: they are fixed stripes over a fixed
    // rectangle, and the picture moving underneath them is the point.
    this.scanlines.clear();
    this.scanlines.fillStyle(hex(UI.bgVoid), SCANLINE_ALPHA);
    for (let sy = y; sy < y + h; sy += SCANLINE_STEP) {
      this.scanlines.fillRect(x, sy, w, 1);
    }

    this.title.setPosition(x, y - 20);
    this.status.setPosition(x + w, y - 18).setOrigin(1, 0);
    this.list.setPosition(x, y + h + 8);
    // `A`/`D` rather than the arrow glyphs the keys also answer to: at this type
    // size `←`/`→` collapse into a pair of stubs that read as plus signs. Both
    // bindings are live, so naming the legible one costs nothing.
    this.hint
      .setText("[A/D] CHANNEL   [R] LOOP FEED   [E] CLOSE")
      .setPosition(x + w, y + h + 9)
      .setOrigin(1, 0);
    this.jamText.setPosition(x + w / 2, y + h / 2);
  }

  /**
   * Red static over the picture while the signal is gone.
   *
   * The same trick the radar plays for its own `JAMMED` state, and deliberately
   * regenerated every frame: a still field of dots reads as a texture, and a
   * moving one reads as a dead channel.
   */
  private drawJam(jammed: boolean): void {
    this.jam.clear();
    this.jamText.setVisible(jammed);
    if (!jammed) return;
    const { x, y, w, h } = this.vp;
    this.jam.fillStyle(hex(UI.bgVoid), 0.85);
    this.jam.fillRect(x, y, w, h);
    this.jam.fillStyle(hex(UI.red), 0.5);
    for (let i = 0; i < 90; i++) {
      this.jam.fillRect(x + Math.random() * w, y + Math.random() * h, 2, 1.5);
    }
    this.jamText.setText("SIGNAL LOST");
  }
}
