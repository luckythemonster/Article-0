import Phaser from "phaser";
import type { AlertNetworkSnapshot } from "../systems/AlertNetwork";
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
import { ledStateForNetwork, panelSupportsLiveState } from "./PanelLed";

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
 * This is the one panel in the HUD whose lamp actually lights. The redrawn
 * panel art dropped the three named alert colours for a plain activity light —
 * `in_use` while the network has anything to report, dark when it is quiet —
 * so {@link ledStateForNetwork} reads the same counts the detail lines below
 * already print rather than the phase word. Every other panel keeps the lamp
 * dark; six panels blinking in unison would read as a fault, not a readout.
 *
 * Also the one panel a player can hide — `N` toggles it via {@link setShown},
 * bound in `UIScene`. Hiding takes the panel and all three of its text objects
 * together, so there is nothing left on screen for the readout once it's gone.
 */
export class AlertNetworkHud {
  private readonly panel: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly detail: Phaser.GameObjects.Text;
  private readonly led: PanelLedHandle;
  private shown = true;

  constructor(scene: Phaser.Scene) {
    // Below the SRP meter and the bio-integrity dial. The budget is shared rather
    // than repeated here — see `hudLayout`.
    const top = NETWORK_TOP;
    // The text sits inside the panel's fixed border, not on it.
    const pad = UI_PAD + PANEL_INSET;

    this.panel = uiPanel(scene, UI_PAD, top, NETWORK_PANEL_W, NETWORK_PANEL_H);
    this.led = attachPanelLed(scene, this.panel, "off");

    this.label = scene.add
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

    // Pinned to "off" until the manifest catches up to the redrawn art — see
    // `panelSupportsLiveState`'s doc comment for what that guards against.
    // `led.set` already no-ops on a repeat state, so this can run every frame
    // without restarting the bounce.
    this.led.set(panelSupportsLiveState() ? ledStateForNetwork(net) : "off");

    const lines = [`UNITS ${net.total}  SPOT ${net.alerted}  SUSP ${net.suspicious}`];
    if (net.converging > 0 && net.target) {
      lines.push(`CONVERGING ${net.converging} → (${net.target.x},${net.target.y})`);
    }
    if (net.countdown > 0) {
      lines.push(`RELAX ${net.countdown.toFixed(1)}s`);
    }
    this.detail.setText(lines.join("\n"));
  }

  /** Whether the panel is currently on screen. */
  isShown(): boolean {
    return this.shown;
  }

  /** Shows or hides the panel and all three of its text objects together. */
  setShown(shown: boolean): void {
    this.shown = shown;
    this.panel.setVisible(shown);
    this.label.setVisible(shown);
    this.status.setVisible(shown);
    this.detail.setVisible(shown);
  }
}
