import Phaser from "phaser";
import type { AlertPhase } from "../systems/AlertState";
import { FONT_MONO } from "./fonts";
import { RADAR_BOTTOM } from "./hudLayout";
import { UI, UI_DEPTH, UI_PAD, UI_TEXT } from "./hudTheme";
import { onResize } from "./resize";

/**
 * The panel's translucent backdrop: the surface token plus an alpha suffix.
 *
 * Phaser's `backgroundColor` takes a CSS colour string, so this is the one place
 * the palette is concatenated rather than passed through `hex()`.
 */
const PANEL_BG = `${UI.bgPanel}cc`;

/** A named unit and its current detection level (0..1). */
export interface DebugUnitView {
  label: string;
  detection: number;
}

/**
 * Live game state published by {@link GameScene} for the debug panel. Written to
 * the registry under the `"debug"` key each frame (dev builds only).
 */
export interface DebugSnapshot {
  enabled: boolean;
  godMode: boolean;
  noClip: boolean;
  worldDraw: boolean;
  frozenWorld: boolean;
  darknessOff: boolean;
  /** Whether Rowan currently reads as compliant staff, and if not, what broke it. */
  compliant: boolean;
  breach: string | null;
  flaggedRemaining: number;
  /** Carrying the Q0 compliance cert (lets compliance survive a search). */
  certified: boolean;
  /** The item name [I] currently grants. */
  selectedItem: string;
  /** How many of {@link selectedItem} are currently held. */
  selectedHeld: number;
  fps: number;
  px: number;
  py: number;
  tileX: number;
  tileY: number;
  facing: number;
  hp: number;
  maxHp: number;
  capture: number;
  captureTime: number;
  level: string;
  alertPhase: AlertPhase;
  units: DebugUnitView[];
}

/**
 * A developer inspector panel: FPS, player position, cheat flags, alert phase,
 * and per-unit detection. Pinned to the top-right of the (unzoomed) UIScene and
 * only ever built when debug mode is allowed — see the `DEBUG_ALLOWED` guard in
 * {@link UIScene}. Follows the same monospace / scroll-factor-0 conventions as
 * {@link Hud}.
 */
export class DebugHud {
  private readonly panel: Phaser.GameObjects.Text;
  private readonly legend: Phaser.GameObjects.Text;
  private readonly pad = UI_PAD;

  constructor(scene: Phaser.Scene) {
    const x = scene.scale.width - this.pad;

    this.panel = scene.add
      .text(x, RADAR_BOTTOM, "", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.label,
        color: UI.textStrong,
        align: "left",
        backgroundColor: PANEL_BG,
        padding: { x: 8, y: 6 },
        lineSpacing: 2,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.DEBUG)
      .setVisible(false);

    this.legend = scene.add
      .text(x, RADAR_BOTTOM, "`=debug  G=god  N=no-clip  V=world  H=halt  O=dark  1-6=warp  [ ]=item  I=give", {
        fontFamily: FONT_MONO,
        fontSize: UI_TEXT.small,
        color: UI.textDim,
        backgroundColor: PANEL_BG,
        padding: { x: 6, y: 3 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH.DEBUG)
      .setVisible(false);

    onResize(scene, (w) => this.reposition(w));
  }

  /**
   * Top-right, but *below* the radar rather than on top of it.
   *
   * Both used to anchor at `(width, pad)` and simply overlapped — the inspector
   * printing over the scope for anyone who opened it. `hudLayout` owns where the
   * radar ends.
   */
  private reposition(width: number): void {
    const x = width - this.pad;
    this.panel.setPosition(x, RADAR_BOTTOM);
    this.legend.setPosition(x, this.panel.y + this.panel.height + 4);
  }

  update(view: DebugSnapshot | undefined): void {
    const visible = view?.enabled ?? false;
    this.panel.setVisible(visible);
    this.legend.setVisible(visible);
    if (!view || !visible) return;

    const flag = (on: boolean): string => (on ? "ON" : "off");
    const facingDeg = Math.round(Phaser.Math.RadToDeg(view.facing));
    const units = view.units
      .map((u) => `  ${u.label} ${u.detection.toFixed(2)}`)
      .join("\n");

    this.panel.setText(
      [
        `-- DEBUG --   ${Math.round(view.fps)} fps`,
        `level  ${view.level}`,
        `pos    ${Math.round(view.px)},${Math.round(view.py)}  tile ${view.tileX},${view.tileY}`,
        `facing ${facingDeg}deg`,
        `hp     ${Math.round(view.hp)}/${view.maxHp}`,
        `capture ${view.capture.toFixed(2)}/${view.captureTime.toFixed(2)}`,
        `alert  ${view.alertPhase}`,
        `god ${flag(view.godMode)}  no-clip ${flag(view.noClip)}  world ${flag(view.worldDraw)}`,
        `freeze ${flag(view.frozenWorld)}  dark ${flag(!view.darknessOff)}`,
        (view.compliant
          ? "conduct COMPLIANT"
          : `conduct ${view.breach ?? "FLAGGED"} ${view.flaggedRemaining.toFixed(1)}s`) +
          (view.certified ? "  cert ON" : ""),
        `item   ${view.selectedItem} (${view.selectedHeld} held)`,
        units ? `units:\n${units}` : "units: (none)",
      ].join("\n"),
    );

    this.reposition(this.panel.scene.scale.width);
  }
}
