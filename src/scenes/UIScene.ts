import Phaser from "phaser";
import { Hud } from "../ui/Hud";
import type { AlertPhase } from "../systems/AlertState";

/**
 * A parallel overlay scene for the HUD.
 *
 * The game camera is zoomed for the SNES look, which also scales anything drawn
 * in that scene — including fixed UI. Running the HUD in its own unzoomed scene
 * keeps it pixel-perfect and screen-anchored. GameScene publishes the alert
 * phase and detection level through the registry; this scene reads them.
 */
export class UIScene extends Phaser.Scene {
  private hud!: Hud;
  // A tiny stand-in that mirrors the phase the HUD needs to colour itself.
  private readonly alertView = { phase: "INFILTRATION" as AlertPhase };

  constructor() {
    super("UIScene");
  }

  create(): void {
    this.hud = new Hud(this);
  }

  update(): void {
    this.alertView.phase = (this.registry.get("alertPhase") as AlertPhase) ?? "INFILTRATION";
    const detection = (this.registry.get("detection") as number) ?? 0;
    this.hud.update(this.alertView, detection);
  }
}
