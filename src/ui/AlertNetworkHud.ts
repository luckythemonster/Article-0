import Phaser from "phaser";
import type { AlertNetworkSnapshot } from "../systems/AlertNetwork";
import type { AlertPhase } from "../systems/AlertState";
import { FONT_MONO } from "./fonts";
import {
  NETWORK_DETAIL_TOP,
  NETWORK_PANEL_H,
  NETWORK_PANEL_W,
  NETWORK_TOP,
  PANEL_INSET,
} from "./hudLayout";
import { UI, UI_DEPTH, UI_PAD, UI_TEXT } from "./hudTheme";
import { attachPanelLed, uiPanel, type PanelLedHandle } from "./NineSlicePanel";
import { ledStateFor } from "./PanelLed";

/** Phase → readout label + colour for the network status line. */
const STATUS: Record<string, { label: string; color: string }> = {
  INFILTRATION: { label: "NOMINAL", color: UI.cyan },
  ALERT: { label: "ALERT", color: UI.redDeep },
  EVASION: { label: "SEARCHING", color: UI.amber },
};

/**
 * A small readout of the base's security network, pinned under the detection
 * meter (top-left). Shows the network status, how many detectors are online /
 * alerted / suspicious, and — while combat-aware — how many guards are
 * converging on the last-known position and the seconds until it relaxes.
 *
 * Reads the snapshot the scene publishes to the registry; screen-anchored so
 * the camera zoom doesn't scale it (same pattern as {@link Hud}).
 *
 * This is the one panel in the HUD whose status lamp is lit. The panel art's
 * corner lamp has exactly three states and they are this readout's three phases,
 * drawn in the same palette entries the text beside it uses — so the frame is
 * saying what the words say, and a player who has stopped reading the words still
 * gets the phase from the corner of their eye. Every other panel keeps the lamp
 * dark; six blinking in unison would read as a fault rather than a readout.
 */
export class AlertNetworkHud {
  private readonly status: Phaser.GameObjects.Text;
  private readonly detail: Phaser.GameObjects.Text;
  private readonly led: PanelLedHandle;
  /** Last phase pushed to the lamp, so a steady state doesn't restart the blink. */
  private phase: AlertPhase | null = null;

  constructor(scene: Phaser.Scene) {
    // Below the SRP meter and the bio-integrity dial. The budget is shared rather
    // than repeated here — see `hudLayout`.
    const top = NETWORK_TOP;
    // The text sits inside the panel's fixed border, not on it.
    const pad = UI_PAD + PANEL_INSET;

    const panel = uiPanel(scene, UI_PAD, top, NETWORK_PANEL_W, NETWORK_PANEL_H);
    this.led = attachPanelLed(scene, panel, "active");

    scene.add
      .text(pad, top + PANEL_INSET, "NETWORK", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.small,
        color: UI.textFaint,
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);

    this.status = scene.add
      .text(pad + 70, top + PANEL_INSET, "NOMINAL", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.small,
        color: STATUS.INFILTRATION.color,
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);

    this.detail = scene.add
      .text(pad, top + PANEL_INSET + NETWORK_DETAIL_TOP, "", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.small,
        color: UI.textBtn,
        lineSpacing: 2,
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);
  }

  update(net: AlertNetworkSnapshot): void {
    const s = STATUS[net.status] ?? STATUS.INFILTRATION;
    this.status.setText(s.label).setColor(s.color);

    // `status` is a string on the snapshot rather than an AlertPhase, so an
    // unrecognised value falls back the same way the label above does instead of
    // leaving the lamp on whatever it showed last.
    const phase: AlertPhase = net.status in STATUS ? (net.status as AlertPhase) : "INFILTRATION";
    if (phase !== this.phase) {
      this.phase = phase;
      this.led.set(ledStateFor(phase));
    }

    const lines = [`UNITS ${net.total}  SPOT ${net.alerted}  SUSP ${net.suspicious}`];
    if (net.converging > 0 && net.target) {
      lines.push(`CONVERGING ${net.converging} → (${net.target.x},${net.target.y})`);
    }
    if (net.countdown > 0) {
      lines.push(`RELAX ${net.countdown.toFixed(1)}s`);
    }
    this.detail.setText(lines.join("\n"));
  }
}
