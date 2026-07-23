import Phaser from "phaser";
import type { AlertPhase } from "../systems/AlertState";

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
  private readonly pad = 12;

  constructor(scene: Phaser.Scene) {
    const x = scene.scale.width - this.pad;

    this.panel = scene.add
      .text(x, this.pad, "", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#cfe8ff",
        align: "left",
        backgroundColor: "#0a0f16cc",
        padding: { x: 8, y: 6 },
        lineSpacing: 2,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1500)
      .setVisible(false);

    this.legend = scene.add
      .text(x, this.pad, "`=debug  G=god  N=no-clip  V=world  1-5=warp", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#6b7f92",
        backgroundColor: "#0a0f16cc",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1500)
      .setVisible(false);

    const onResize = (size: Phaser.Structs.Size): void => this.reposition(size.width);
    scene.scale.on("resize", onResize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off("resize", onResize));
  }

  private reposition(width: number): void {
    const x = width - this.pad;
    this.panel.setPosition(x, this.pad);
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
        units ? `units:\n${units}` : "units: (none)",
      ].join("\n"),
    );

    this.reposition(this.panel.scene.scale.width);
  }
}
