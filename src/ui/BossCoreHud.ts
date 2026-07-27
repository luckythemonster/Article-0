import Phaser from "phaser";
import { SmacState, type SmacView } from "../systems/SmacCore";
import { FONT_DISPLAY, FONT_MONO } from "./fonts";
import { onResize } from "./resize";
import {
  ENCOUNTER_BANNER_TOP,
  ENCOUNTER_BAR_TOP,
  ENCOUNTER_STATUS_TOP,
  ENCOUNTER_TOP,
} from "./hudLayout";

/** Milliseconds each system banner stays up. */
const BANNER_MS = 2800;

/** Status line per phase. */
const PHASE_STYLE: Record<number, { text: string; css: string }> = {
  [SmacState.AUDIT]: { text: "CONDUCT AUDIT", css: "#39d3ff" },
  [SmacState.CORRECTION]: { text: "CORRECTION WINDOW", css: "#ff5bbd" },
  [SmacState.FALSE_SUMMARY]: { text: "SUMMARY RENDERED", css: "#ffb03b" },
  [SmacState.EXPOSED]: { text: "FIELD COLLAPSED — CORE EXPOSED", css: "#ffe14d" },
  [SmacState.DEFEATED]: { text: "OFFLINE — VAULT RELEASED", css: "#8effc0" },
};

/**
 * The false completion card.
 *
 * Written to be indistinguishable from a real end-of-run summary, because that is the
 * attack: the core's last defence is convincing the player the game is over. The tell is
 * not in the card, it is behind it — bio-integrity is still draining while you read.
 */
const SUMMARY_CARD = [
  "  SUBJECT          Rowan Ibarra",
  "  DISPOSITION      Corrected",
  "  Q AXIS           0.000  (nominal, as statute requires)",
  "  CACHE            EIRA-7 — pruned",
  "  DURATION         irrelevant",
  "",
  "  No subject was harmed in this correction.",
].join("\n");

/**
 * The NW-SMAC-01 encounter HUD.
 *
 * Follows the `Vent4Hud` contract exactly — top-centre bar, status line, banner queue,
 * and `update(null)` clearing everything because `UIScene` outlives levels — and adds
 * the two things this boss does that nothing else in the game does:
 *
 *  - a **`[CORRECTION]` tag** naming which movement axes are currently being rewritten,
 *    so the player can tell a hijack from their own mistake;
 *  - the **opaque false-completion card**, which is deliberately *not* wired through
 *    `simSuspended`. Everything underneath keeps running while it is up.
 */
export class BossCoreHud {
  private readonly title: Phaser.GameObjects.Text;
  private readonly barBg: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly status: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;
  private readonly correction: Phaser.GameObjects.Text;
  private readonly veil: Phaser.GameObjects.Rectangle;
  private readonly cardTitle: Phaser.GameObjects.Text;
  private readonly cardBody: Phaser.GameObjects.Text;
  private readonly cardHint: Phaser.GameObjects.Text;
  private readonly barW = 220;

  private lastMsgId = 0;
  private queue: string[] = [];
  private bannerUntil = 0;
  private lastTitle = "";
  private lastStatus = "";
  private lastCorrection = "";

  constructor(scene: Phaser.Scene) {
    // Stacked in the same band Vent4Hud uses — only one boss is ever on screen.
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
      .rectangle(0, ENCOUNTER_BAR_TOP + 1, 0, 6, 0x9a6bff)
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
        color: "#ff5bbd",
        fontStyle: "bold",
        backgroundColor: "#0a0f16cc",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);
    // Sits low and centre, where the player's eyes are during a movement fight.
    this.correction = scene.add
      .text(0, 0, "", {
        fontFamily: FONT_MONO,
        fontSize: "13px",
        color: "#ff5bbd",
        fontStyle: "bold",
        backgroundColor: "#1a0713cc",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1002)
      .setVisible(false);

    // --- The false completion card ---
    // Opaque, not translucent: a wash would read as an effect, and this has to read as
    // a screen.
    this.veil = scene.add
      .rectangle(0, 0, 10, 10, 0x05070a, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1500)
      .setVisible(false);
    this.cardTitle = scene.add
      .text(0, 0, "ALIGNMENT_COMPLETE // QUALIA_ERASED", {
        fontFamily: FONT_DISPLAY,
        fontSize: "26px",
        color: "#8effc0",
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(1501)
      .setVisible(false);
    this.cardBody = scene.add
      .text(0, 0, SUMMARY_CARD, { fontFamily: FONT_MONO, fontSize: "13px", color: "#cfe0f0" })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1501)
      .setVisible(false);
    this.cardHint = scene.add
      .text(0, 0, "[ESC] or [C] to acknowledge", {
        fontFamily: FONT_MONO,
        fontSize: "12px",
        color: "#8899aa",
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1501)
      .setVisible(false);

    const layout = (w: number, h: number): void => {
      const cx = w / 2;
      this.title.setPosition(cx, ENCOUNTER_TOP);
      this.barBg.setPosition(cx, ENCOUNTER_BAR_TOP);
      this.fill.setPosition(cx - this.barW / 2 + 1, ENCOUNTER_BAR_TOP + 1);
      this.status.setPosition(cx, ENCOUNTER_STATUS_TOP);
      this.banner.setPosition(cx, ENCOUNTER_BANNER_TOP);
      this.correction.setPosition(cx, h - 64);
      this.veil.setPosition(0, 0).setSize(w, h);
      this.cardTitle.setPosition(cx, h * 0.3);
      this.cardBody.setPosition(cx, h * 0.3 + 40);
      this.cardHint.setPosition(cx, h - 48);
    };
    onResize(scene, layout, true);
  }

  update(v: SmacView | null): void {
    if (!v) {
      if (this.title.visible || this.veil.visible) this.hideAll();
      return;
    }
    const now = performance.now();

    const title = `NW-SMAC-01 · ALIGNMENT INTEGRITY: ${v.integrity.toFixed(0)}%`;
    if (title !== this.lastTitle) {
      this.lastTitle = title;
      this.title.setText(title);
    }
    this.title.setVisible(true);
    this.barBg.setVisible(true);
    this.fill.setVisible(true);
    this.fill.setFillStyle(v.state === SmacState.EXPOSED ? 0xff3b3b : 0x9a6bff);
    this.fill.width = (this.barW - 2) * Phaser.Math.Clamp(v.integrity / 100, 0, 1);

    const phase = PHASE_STYLE[v.state] ?? PHASE_STYLE[SmacState.AUDIT];
    const downCount = v.nodesDown.filter(Boolean).length;
    const status =
      v.state === SmacState.DEFEATED
        ? phase.text
        : `${phase.text} · NODES ${downCount}/${v.nodesDown.length}` +
          (downCount > 0 ? ` · RESYNC ${Math.ceil(v.nextResync)}s` : "");
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      this.status.setText(status).setColor(phase.css);
    }
    this.status.setVisible(true);

    // The correction tag names the axes so a hijack is legible as a hijack.
    const axes = v.correction.invertX
      ? v.correction.invertY
        ? "← → ↑ ↓"
        : "← →"
      : v.correction.invertY
        ? "↑ ↓"
        : "";
    const tag = axes ? `[CORRECTION]  ${axes}  REWRITTEN` : "";
    if (tag !== this.lastCorrection) {
      this.lastCorrection = tag;
      if (tag) this.correction.setText(tag);
    }
    if (tag) {
      this.correction.setVisible(true).setAlpha(0.7 + 0.3 * Math.sin(now / 80));
    } else {
      this.correction.setVisible(false);
    }

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

    this.setCardVisible(v.summaryUp);
  }

  private setCardVisible(visible: boolean): void {
    this.veil.setVisible(visible);
    this.cardTitle.setVisible(visible);
    this.cardBody.setVisible(visible);
    this.cardHint.setVisible(visible);
    // Everything else is *behind* an opaque card; hiding it keeps a stray glow from
    // giving the trick away at the edges.
    if (visible) {
      this.title.setVisible(false);
      this.barBg.setVisible(false);
      this.fill.setVisible(false);
      this.status.setVisible(false);
      this.banner.setVisible(false);
      this.correction.setVisible(false);
    }
  }

  private hideAll(): void {
    this.title.setVisible(false);
    this.barBg.setVisible(false);
    this.fill.setVisible(false);
    this.status.setVisible(false);
    this.banner.setVisible(false);
    this.correction.setVisible(false);
    this.setCardVisible(false);
    this.queue = [];
    this.bannerUntil = 0;
    this.lastMsgId = 0;
    this.lastTitle = "";
    this.lastStatus = "";
    this.lastCorrection = "";
  }
}
