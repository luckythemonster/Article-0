import Phaser from "phaser";
import { RelayState, type RelayView } from "../systems/RelayCore";
import { FONT_MONO } from "./fonts";
import { onResize } from "./resize";
import {
  ENCOUNTER_BANNER_TOP,
  ENCOUNTER_BAR_TOP,
  ENCOUNTER_STATUS_TOP,
  ENCOUNTER_TOP,
} from "./hudLayout";

/** Milliseconds each system banner stays up. */
const BANNER_MS = 2800;

const PHASE_STYLE: Record<number, { text: string; css: string }> = {
  [RelayState.CALIBRATE]: { text: "CALIBRATION", css: "#ffb03b" },
  [RelayState.ARMED]: { text: "DISH ALIGNED — FEED READY", css: "#39d3ff" },
  [RelayState.UPLINK]: { text: "UPLINK RUNNING — HOLD THE LINE", css: "#8effc0" },
  [RelayState.CAPTURE]: { text: "CONTAINMENT INBOUND", css: "#ff3b3b" },
  [RelayState.SEIZED]: { text: "IN CUSTODY", css: "#ff3b3b" },
};

/**
 * The rooftop relay HUD: the uplink progress bar and the phase readout.
 *
 * Same `Vent4Hud` contract as the other two encounters — top-centre band, banner queue,
 * `update(null)` clearing everything because `UIScene` outlives levels. The one thing it
 * does differently is the **capture wash**: at 100% the tactical readout is supposed to
 * stop being readable, so the bar and status flicker into noise rather than politely
 * disappearing. The player should feel the HUD lose its grip, not see it tidied away.
 */
export class RelayHud {
  private readonly title: Phaser.GameObjects.Text;
  private readonly barBg: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly status: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;
  private readonly overlay: Phaser.GameObjects.Rectangle;
  private readonly barW = 240;

  private lastMsgId = 0;
  private queue: string[] = [];
  private bannerUntil = 0;
  private lastTitle = "";
  private lastStatus = "";

  constructor(scene: Phaser.Scene) {
    this.title = scene.add
      .text(0, ENCOUNTER_TOP, "", { fontFamily: FONT_MONO, fontSize: "12px", color: "#cfe0f0", fontStyle: "bold" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
    this.barBg = scene.add
      .rectangle(0, ENCOUNTER_BAR_TOP, this.barW, 8, 0x11202b)
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setStrokeStyle(1, 0x2b4356)
      .setVisible(false);
    this.fill = scene.add
      .rectangle(0, ENCOUNTER_BAR_TOP + 1, 0, 6, 0x8effc0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false);
    this.status = scene.add
      .text(0, ENCOUNTER_STATUS_TOP, "", { fontFamily: FONT_MONO, fontSize: "10px", color: "#8899aa" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
    this.banner = scene.add
      .text(0, ENCOUNTER_BANNER_TOP, "", {
        fontFamily: FONT_MONO,
        fontSize: "12px",
        color: "#8effc0",
        fontStyle: "bold",
        backgroundColor: "#0a0f16cc",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);
    this.overlay = scene.add
      .rectangle(0, 0, 10, 10, 0xff3300, 0.1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(900)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);

    const layout = (w: number, h: number): void => {
      const cx = w / 2;
      this.title.setPosition(cx, ENCOUNTER_TOP);
      this.barBg.setPosition(cx, ENCOUNTER_BAR_TOP);
      this.fill.setPosition(cx - this.barW / 2 + 1, ENCOUNTER_BAR_TOP + 1);
      this.status.setPosition(cx, ENCOUNTER_STATUS_TOP);
      this.banner.setPosition(cx, ENCOUNTER_BANNER_TOP);
      this.overlay.setPosition(0, 0).setSize(w, h);
    };
    onResize(scene, layout, true);
  }

  update(v: RelayView | null): void {
    if (!v) {
      if (this.title.visible) this.hideAll();
      return;
    }
    const now = performance.now();
    const captured = v.state === RelayState.CAPTURE || v.state === RelayState.SEIZED;

    const pct = Math.round(v.progress * 100);
    // Past 100% the readout stops being a readout. Random hex where the number was is
    // the cheapest honest way to show a feed the mesh has taken away from you.
    const title = captured
      ? `LATTICE UPLINK · ${Math.floor(Math.random() * 0xfff)
          .toString(16)
          .toUpperCase()
          .padStart(3, "0")}%`
      : `LATTICE UPLINK · ${String(pct).padStart(3, " ")}%`;
    if (title !== this.lastTitle) {
      this.lastTitle = title;
      this.title.setText(title);
    }
    this.title.setVisible(true).setAlpha(captured ? 0.3 + Math.random() * 0.7 : 1);

    this.barBg.setVisible(true);
    this.fill.setVisible(true);
    this.fill.setFillStyle(captured ? 0xff3b3b : 0x8effc0);
    this.fill.width = (this.barW - 2) * Phaser.Math.Clamp(v.progress, 0, 1);

    const phase = PHASE_STYLE[v.state] ?? PHASE_STYLE[RelayState.CALIBRATE];
    const set = v.pedestalsSet.filter(Boolean).length;
    const status =
      v.state === RelayState.CALIBRATE
        ? `${phase.text} · PEDESTALS ${set}/${v.pedestalsSet.length}`
        : phase.text;
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      this.status.setText(status).setColor(phase.css);
    }
    this.status.setVisible(true).setAlpha(captured ? 0.2 + Math.random() * 0.8 : 1);

    if (v.msg && v.msg.id !== this.lastMsgId) {
      this.lastMsgId = v.msg.id;
      if (this.queue.length < 3) this.queue.push(v.msg.text);
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

    if (captured) {
      this.overlay.setVisible(true).setAlpha(0.08 + 0.08 * Math.sin(now / 70));
    } else {
      this.overlay.setVisible(false);
    }
  }

  private hideAll(): void {
    this.title.setVisible(false).setAlpha(1);
    this.barBg.setVisible(false);
    this.fill.setVisible(false);
    this.status.setVisible(false).setAlpha(1);
    this.banner.setVisible(false);
    this.overlay.setVisible(false);
    this.queue = [];
    this.bannerUntil = 0;
    this.lastMsgId = 0;
    this.lastTitle = "";
    this.lastStatus = "";
  }
}
