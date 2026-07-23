import Phaser from "phaser";
import { Vent4State, type Vent4View } from "../systems/Vent4Core";

/** Fill/status colors per compliance band. */
const BAND_STYLE: Record<string, { hex: number; css: string; label: string }> = {
  LAMINAR: { hex: 0x39d3ff, css: "#39d3ff", label: "LAMINAR FLOW" },
  TURBULENT: { hex: 0xffb03b, css: "#ffb03b", label: "TURBULENCE" },
  CRITICAL: { hex: 0xff3b3b, css: "#ff3b3b", label: "CRITICAL BLOCKAGE" },
};

/** Milliseconds each system banner stays up. */
const BANNER_MS = 2800;

/**
 * The VENT-4 encounter HUD: a top-centre Compliance Index bar (the boss's
 * "health", 100% → 0%), a band/status readout, a flashing system-message
 * banner queue in the machine's bracket diction, and the Phase-3 purge's
 * red screen wash. Hidden entirely outside the vent core (UIScene runs across
 * level swaps, so `update(null)` must clear everything).
 */
export class Vent4Hud {
  private readonly title: Phaser.GameObjects.Text;
  private readonly barBg: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly status: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;
  private readonly overlay: Phaser.GameObjects.Rectangle;
  private readonly barW = 220;

  private lastMsgId = 0;
  private queue: string[] = [];
  private bannerUntil = 0;
  private lastTitle = "";
  private lastStatus = "";

  constructor(scene: Phaser.Scene) {
    // Stacked below the ObjectiveHud's directive block (y ≈ 10–70).
    this.title = scene.add
      .text(0, 76, "", { fontFamily: "monospace", fontSize: "12px", color: "#cfe0f0", fontStyle: "bold" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
    this.barBg = scene.add
      .rectangle(0, 94, this.barW, 8, 0x11202b)
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setStrokeStyle(1, 0x2b4356)
      .setVisible(false);
    this.fill = scene.add
      .rectangle(0, 95, 0, 6, 0x39d3ff)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false);
    this.status = scene.add
      .text(0, 106, "", { fontFamily: "monospace", fontSize: "10px", color: "#8899aa" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
    this.banner = scene.add
      .text(0, 122, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffb03b",
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
      this.title.setPosition(cx, 76);
      this.barBg.setPosition(cx, 94);
      this.fill.setPosition(cx - this.barW / 2 + 1, 95);
      this.status.setPosition(cx, 106);
      this.banner.setPosition(cx, 122);
      this.overlay.setPosition(0, 0).setSize(w, h);
    };
    layout(scene.scale.width, scene.scale.height);
    const onResize = (size: Phaser.Structs.Size): void => layout(size.width, size.height);
    scene.scale.on("resize", onResize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off("resize", onResize));
  }

  update(v: Vent4View | null): void {
    if (!v) {
      if (this.title.visible) this.hideAll();
      return;
    }

    const band = BAND_STYLE[v.band] ?? BAND_STYLE.LAMINAR;
    const now = performance.now();

    const title = `VENT-4 · COMPLIANCE INDEX: ${v.compliance.toFixed(1)}%`;
    if (title !== this.lastTitle) {
      this.lastTitle = title;
      this.title.setText(title);
    }
    this.title.setVisible(true);
    this.barBg.setVisible(true);
    this.fill
      .setVisible(true)
      .setFillStyle(band.hex);
    this.fill.width = (this.barW - 2) * Phaser.Math.Clamp(v.compliance / 100, 0, 1);

    let status: string;
    let statusColor: string;
    if (v.state === Vent4State.DEFEATED) {
      status = "OFFLINE — COMPLIANCE CERT ACCEPTED";
      statusColor = "#8effc0";
    } else if (v.state === Vent4State.JAMMED) {
      status = `TRIAGE SUSPENDED ${Math.ceil(v.jamLeft)}s — CORE EXPOSED`;
      statusColor = "#ffe14d";
    } else {
      status = band.label;
      statusColor = band.css;
    }
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      this.status.setText(status).setColor(statusColor);
    }
    this.status.setVisible(true);

    // System banners: a new msg id enqueues; one shows at a time, flashing.
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

    // Phase-3 thermal purge: the whole screen breathes red.
    if (v.state === Vent4State.PHASE_3_PURGE) {
      this.overlay.setVisible(true).setAlpha(0.07 + 0.05 * Math.sin(now / 120));
    } else {
      this.overlay.setVisible(false);
    }
  }

  private hideAll(): void {
    this.title.setVisible(false);
    this.barBg.setVisible(false);
    this.fill.setVisible(false);
    this.status.setVisible(false);
    this.banner.setVisible(false);
    this.overlay.setVisible(false);
    this.queue = [];
    this.bannerUntil = 0;
    this.lastMsgId = 0;
    this.lastTitle = "";
    this.lastStatus = "";
  }
}
