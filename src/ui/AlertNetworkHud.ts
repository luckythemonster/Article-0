import Phaser from "phaser";
import type { AlertNetworkSnapshot } from "../systems/AlertNetwork";
import { FONT_MONO } from "./fonts";
import { NETWORK_TOP } from "./hudLayout";
import { UI, UI_DEPTH, UI_PAD, UI_TEXT } from "./hudTheme";

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
 */
export class AlertNetworkHud {
  private readonly status: Phaser.GameObjects.Text;
  private readonly detail: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const pad = UI_PAD;
    // Below the SRP meter and the bio-integrity dial. The budget is shared rather
    // than repeated here — see `hudLayout`.
    const top = NETWORK_TOP;

    scene.add
      .text(pad, top, "NETWORK", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.small,
        color: UI.textFaint,
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);

    this.status = scene.add
      .text(pad + 70, top, "NOMINAL", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.small,
        color: STATUS.INFILTRATION.color,
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.BASE);

    this.detail = scene.add
      .text(pad, top + 16, "", {
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
