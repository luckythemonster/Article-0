import Phaser from "phaser";
import { FONT_MONO } from "./fonts";
import { onResize } from "./resize";
import { UI, hex } from "./hudTheme";
import {
  ENCOUNTER_BANNER_TOP,
  ENCOUNTER_BAR_TOP,
  ENCOUNTER_STATUS_TOP,
  ENCOUNTER_TOP,
} from "./hudLayout";

/** Milliseconds each system banner stays up. */
const BANNER_MS = 2800;

/** Most banners queued at once; a burst of transitions shouldn't back up forever. */
const QUEUE_MAX = 3;

export interface EncounterBandStyle {
  /** Bar width in pixels. */
  barW: number;
  /** Fill colour while nothing overrides it. */
  fillColor: number;
  /** Banner text colour. */
  bannerColor: number;
  /** Optional full-screen wash this encounter breathes during its worst phase. */
  wash?: { color: number; alpha: number };
}

/** One frame of readout. */
export interface EncounterBandFrame {
  title: string;
  /** Bar fill, 0..1. */
  frac: number;
  status: string;
  /** CSS colour for the status line. */
  statusColor: string;
  /** Overrides {@link EncounterBandStyle.fillColor} for this frame. */
  fillColor?: number;
  /** The encounter's latest system message; re-showing is keyed on `id`. */
  msg?: { id: number; text: string };
  /** Whether the wash should be breathing this frame. */
  wash?: boolean;
  /** 0..1 alpha jitter for a readout that is losing its grip; 1 = steady. */
  legibility?: number;
}

/**
 * The top-centre encounter readout: title, bar, status line and a flashing banner queue.
 *
 * All three encounters put the same widget on screen — VENT-4's Compliance Index,
 * NW-SMAC-01's Alignment Integrity, the roof's uplink percentage — and for a while all
 * three owned a private copy of it. The copies were byte-identical for about 90 lines
 * each: the five game objects and their chained builders, the `onResize` layout closure,
 * the `lastTitle`/`lastStatus` memoisation that keeps `setText` (a canvas reflow and a
 * texture re-raster) off the frame path, the enqueue/dequeue/flash block, and `hideAll`.
 *
 * They had already started to drift — one restored alpha in `hideAll` and the others
 * didn't; one's `update(null)` guard checked a condition the others' missed — which is
 * the ordinary fate of three copies nobody edits together. `hudLayout.ts` exists because
 * a previous change to this band was missed in one of them.
 *
 * Composed, not inherited: the house rule (see `HoldTarget`) is that shared *mechanics*
 * go in an object the users hold, so each HUD keeps its own vocabulary and the one thing
 * it alone does — VENT-4's band table, NW-SMAC-01's `[CORRECTION]` tag and false
 * completion card, the roof's capture flicker.
 */
export class EncounterBand {
  private readonly title: Phaser.GameObjects.Text;
  private readonly barBg: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly status: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;
  private readonly overlay?: Phaser.GameObjects.Rectangle;

  private lastMsgId = 0;
  private queue: string[] = [];
  private bannerUntil = 0;
  private lastTitle = "";
  private lastStatus = "";

  constructor(
    scene: Phaser.Scene,
    private readonly style: EncounterBandStyle,
  ) {
    this.title = scene.add
      .text(0, ENCOUNTER_TOP, "", {
        fontFamily: FONT_MONO,
        fontSize: "12px",
        color: UI.textStrong,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
    this.barBg = scene.add
      .rectangle(0, ENCOUNTER_BAR_TOP, style.barW, 8, hex(UI.track))
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setStrokeStyle(1, hex(UI.borderCool))
      .setVisible(false);
    this.fill = scene.add
      .rectangle(0, ENCOUNTER_BAR_TOP + 1, 0, 6, style.fillColor)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false);
    this.status = scene.add
      .text(0, ENCOUNTER_STATUS_TOP, "", {
        fontFamily: FONT_MONO,
        fontSize: "10px",
        color: UI.textFaint,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
    this.banner = scene.add
      .text(0, ENCOUNTER_BANNER_TOP, "", {
        fontFamily: FONT_MONO,
        fontSize: "12px",
        color: `#${style.bannerColor.toString(16).padStart(6, "0")}`,
        fontStyle: "bold",
        backgroundColor: "#0a0f16cc",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);
    if (style.wash) {
      this.overlay = scene.add
        .rectangle(0, 0, 10, 10, style.wash.color, style.wash.alpha)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(900)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false);
    }

    const layout = (w: number, h: number): void => {
      const cx = w / 2;
      this.title.setPosition(cx, ENCOUNTER_TOP);
      this.barBg.setPosition(cx, ENCOUNTER_BAR_TOP);
      this.fill.setPosition(cx - style.barW / 2 + 1, ENCOUNTER_BAR_TOP + 1);
      this.status.setPosition(cx, ENCOUNTER_STATUS_TOP);
      this.banner.setPosition(cx, ENCOUNTER_BANNER_TOP);
      this.overlay?.setPosition(0, 0).setSize(w, h);
    };
    onResize(scene, layout, true);
  }

  /** True while the band owns screen space — the cheap "do I need hiding?" check. */
  get visible(): boolean {
    return this.title.visible;
  }

  /** Draws one frame. */
  set(f: EncounterBandFrame): void {
    const now = performance.now();
    const alpha = f.legibility ?? 1;

    if (f.title !== this.lastTitle) {
      this.lastTitle = f.title;
      this.title.setText(f.title);
    }
    this.title.setVisible(true).setAlpha(alpha);

    this.barBg.setVisible(true);
    this.fill.setVisible(true).setFillStyle(f.fillColor ?? this.style.fillColor);
    this.fill.width = (this.style.barW - 2) * Phaser.Math.Clamp(f.frac, 0, 1);

    if (f.status !== this.lastStatus) {
      this.lastStatus = f.status;
      this.status.setText(f.status).setColor(f.statusColor);
    }
    this.status.setVisible(true).setAlpha(alpha);

    // A new message id enqueues; one shows at a time, flashing.
    if (f.msg && f.msg.id !== this.lastMsgId) {
      this.lastMsgId = f.msg.id;
      if (this.queue.length < QUEUE_MAX) this.queue.push(f.msg.text);
    }
    if (now >= this.bannerUntil && this.queue.length > 0) {
      this.banner.setText(this.queue.shift()!);
      this.bannerUntil = now + BANNER_MS;
    }
    if (now < this.bannerUntil) {
      this.banner.setVisible(true).setAlpha(0.55 + 0.45 * Math.sin(now / 90));
    } else {
      this.banner.setVisible(false);
    }

    if (this.overlay) {
      if (f.wash) this.overlay.setVisible(true).setAlpha(0.07 + 0.05 * Math.sin(now / 120));
      else this.overlay.setVisible(false);
    }
  }

  /** Hides every part and forgets the queue — `UIScene` outlives levels. */
  hide(): void {
    this.title.setVisible(false).setAlpha(1);
    this.barBg.setVisible(false);
    this.fill.setVisible(false);
    this.status.setVisible(false).setAlpha(1);
    this.banner.setVisible(false);
    this.overlay?.setVisible(false);
    this.queue = [];
    this.bannerUntil = 0;
    this.lastMsgId = 0;
    this.lastTitle = "";
    this.lastStatus = "";
  }

  /** Hides only the band, leaving a caller's own extras alone (the false-summary card). */
  conceal(): void {
    this.title.setVisible(false);
    this.barBg.setVisible(false);
    this.fill.setVisible(false);
    this.status.setVisible(false);
    this.banner.setVisible(false);
    this.overlay?.setVisible(false);
  }
}
