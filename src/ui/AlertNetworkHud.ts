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
import { setPanelFrame, uiPanel } from "./NineSlicePanel";
import {
  INDICATOR_SIZE,
  SCREEN_OFF,
  disconnectedFrames,
  framesFor,
  type NetworkIndicatorFrames,
} from "./NetworkPanel";
import { hasUiTexture } from "./UiTextures";

/** Manifest key for the corner-indicator sheet. */
const INDICATOR_KEY = "ui-network-indicators";

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
 * This is the one panel in the HUD that is also an instrument. Its art carries
 * four indicators — three binary LED clusters counting units, spotters and
 * suspicious contacts, plus a status badge — and they say the same numbers the
 * detail lines below print in words, so the two cannot disagree. Everything
 * else that adopts a panel gets plain chrome; see {@link ./NetworkPanel} for
 * what each frame means.
 *
 * The indicators are separate sprites rather than baked frames because they
 * vary independently: 2 x 8 x 8 x 8 x 4 is 4096 combinations. Pinning them to
 * the panel's corners works because nine-slice reproduces corners at native
 * size however far the middle is stretched.
 *
 * Also the one panel a player can hide — `N` toggles it via {@link setShown},
 * bound in `UIScene`. Hiding takes the panel, its three text objects *and* its
 * four indicators together, so nothing is left stranded on screen.
 */
export class AlertNetworkHud {
  private readonly panel: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly detail: Phaser.GameObjects.Text;
  /** Corner indicators, empty when the art isn't present. */
  private readonly indicators: Phaser.GameObjects.Image[] = [];
  private unit?: Phaser.GameObjects.Image;
  private spot?: Phaser.GameObjects.Image;
  private susp?: Phaser.GameObjects.Image;
  private badge?: Phaser.GameObjects.Image;
  private shown = true;

  constructor(scene: Phaser.Scene) {
    // Below the SRP meter and the bio-integrity dial. The budget is shared rather
    // than repeated here — see `hudLayout`.
    const top = NETWORK_TOP;
    // The text sits inside the panel's fixed border, not on it.
    const pad = UI_PAD + PANEL_INSET;

    // Built disconnected: `UIScene` only calls `update()` once the scene has
    // published a snapshot, so "no data yet" is a state the panel really passes
    // through rather than a theoretical one.
    const initial = disconnectedFrames();
    this.panel = uiPanel(scene, UI_PAD, top, NETWORK_PANEL_W, NETWORK_PANEL_H, {
      frame: SCREEN_OFF,
    });

    if (hasUiTexture(scene, INDICATOR_KEY)) {
      const right = UI_PAD + NETWORK_PANEL_W - INDICATOR_SIZE;
      const bottom = top + NETWORK_PANEL_H - INDICATOR_SIZE;
      // Corners, in the order the sheet lays them out. Just above the panel and
      // below UI_DEPTH.BASE, so HUD text still draws over them.
      this.unit = this.addIndicator(scene, UI_PAD, top, initial.unit);
      this.spot = this.addIndicator(scene, right, bottom, initial.spot);
      this.susp = this.addIndicator(scene, UI_PAD, bottom, initial.susp);
      this.badge = this.addIndicator(scene, right, top, initial.badge);
    }

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

  /** One corner indicator, registered so `setShown` can't forget about it. */
  private addIndicator(
    scene: Phaser.Scene,
    x: number,
    y: number,
    frame: number,
  ): Phaser.GameObjects.Image {
    const img = scene.add
      .image(x, y, INDICATOR_KEY, frame)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.PANEL + 1);
    this.indicators.push(img);
    return img;
  }

  update(net: AlertNetworkSnapshot): void {
    const s = STATUS[net.status] ?? STATUS.INFILTRATION;
    this.status.setText(s.label).setColor(s.color);

    this.apply(framesFor(net));

    const lines = [`UNITS ${net.total}  SPOT ${net.alerted}  SUSP ${net.suspicious}`];
    if (net.converging > 0 && net.target) {
      lines.push(`CONVERGING ${net.converging} → (${net.target.x},${net.target.y})`);
    }
    if (net.countdown > 0) {
      lines.push(`RELAX ${net.countdown.toFixed(1)}s`);
    }
    this.detail.setText(lines.join("\n"));
  }

  /** Points the chrome and the four indicators at one readout's frames. */
  private apply(frames: NetworkIndicatorFrames): void {
    setPanelFrame(this.panel, frames.screen);
    this.unit?.setFrame(frames.unit);
    this.spot?.setFrame(frames.spot);
    this.susp?.setFrame(frames.susp);
    this.badge?.setFrame(frames.badge);
  }

  /** Whether the panel is currently on screen. */
  isShown(): boolean {
    return this.shown;
  }

  /** Shows or hides the panel, its text and its indicators together. */
  setShown(shown: boolean): void {
    this.shown = shown;
    this.panel.setVisible(shown);
    this.label.setVisible(shown);
    this.status.setVisible(shown);
    this.detail.setVisible(shown);
    for (const ind of this.indicators) ind.setVisible(shown);
  }
}
