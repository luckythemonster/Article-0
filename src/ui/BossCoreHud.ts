import Phaser from "phaser";
import { SmacState, type SmacView } from "../systems/SmacCore";
import { EncounterBand } from "./EncounterBand";
import { FONT_DISPLAY, FONT_MONO } from "./fonts";
import { onResize } from "./resize";

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
 * The bar/status/banner is the shared {@link EncounterBand}. What this file owns is the
 * two things this boss does that nothing else in the game does:
 *
 *  - a **`[CORRECTION]` tag** naming which movement axes are currently being rewritten,
 *    so the player can tell a hijack from their own mistake;
 *  - the **opaque false-completion card**, which is deliberately *not* wired through
 *    `simSuspended`. Everything underneath keeps running while it is up.
 */
export class BossCoreHud {
  private readonly band: EncounterBand;
  private readonly correction: Phaser.GameObjects.Text;
  private readonly veil: Phaser.GameObjects.Rectangle;
  private readonly cardTitle: Phaser.GameObjects.Text;
  private readonly cardBody: Phaser.GameObjects.Text;
  private readonly cardHint: Phaser.GameObjects.Text;
  private lastCorrection = "";

  constructor(scene: Phaser.Scene) {
    this.band = new EncounterBand(scene, {
      barW: 220,
      fillColor: 0x9a6bff,
      bannerColor: 0xff5bbd,
    });

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
      if (this.band.visible || this.veil.visible) this.hideAll();
      return;
    }
    const phase = PHASE_STYLE[v.state] ?? PHASE_STYLE[SmacState.AUDIT];

    this.band.set({
      title: `NW-SMAC-01 · ALIGNMENT INTEGRITY: ${v.integrity.toFixed(0)}%`,
      frac: v.integrity / 100,
      fillColor: v.state === SmacState.EXPOSED ? 0xff3b3b : 0x9a6bff,
      status:
        v.state === SmacState.DEFEATED
          ? phase.text
          : `${phase.text} · NODES ${v.nodesDown}/${v.nodeCount}` +
            (v.nodesDown > 0 ? ` · RESYNC ${Math.ceil(v.nextResync)}s` : ""),
      statusColor: phase.css,
      msg: v.msg,
    });

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
      this.correction.setVisible(true).setAlpha(0.7 + 0.3 * Math.sin(performance.now() / 80));
    } else {
      this.correction.setVisible(false);
    }

    this.setCardVisible(v.state === SmacState.FALSE_SUMMARY);
  }

  private setCardVisible(visible: boolean): void {
    this.veil.setVisible(visible);
    this.cardTitle.setVisible(visible);
    this.cardBody.setVisible(visible);
    this.cardHint.setVisible(visible);
    // Everything else is *behind* an opaque card; hiding it keeps a stray glow from
    // giving the trick away at the edges.
    if (visible) {
      this.band.conceal();
      this.correction.setVisible(false);
    }
  }

  private hideAll(): void {
    this.band.hide();
    this.correction.setVisible(false);
    this.setCardVisible(false);
    this.lastCorrection = "";
  }
}
