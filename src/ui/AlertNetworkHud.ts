import Phaser from "phaser";
import type { AlertNetworkSnapshot } from "../systems/AlertNetwork";

/** Phase → readout label + colour for the network status line. */
const STATUS: Record<string, { label: string; color: string }> = {
  INFILTRATION: { label: "NOMINAL", color: "#39d3ff" },
  ALERT: { label: "ALERT", color: "#ff3b3b" },
  EVASION: { label: "SEARCHING", color: "#ffb03b" },
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
    const pad = 12;
    const top = pad + 118; // below the SRP meter + bio-integrity bar

    scene.add
      .text(pad, top, "NETWORK", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#8899aa",
      })
      .setScrollFactor(0)
      .setDepth(1000);

    this.status = scene.add
      .text(pad + 70, top, "NOMINAL", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: STATUS.INFILTRATION.color,
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(1000);

    this.detail = scene.add
      .text(pad, top + 16, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#9fb2c4",
        lineSpacing: 2,
      })
      .setScrollFactor(0)
      .setDepth(1000);
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
