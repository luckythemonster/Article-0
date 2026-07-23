import Phaser from "phaser";
import { Hud } from "../ui/Hud";
import { Radar } from "../ui/Radar";
import { InventoryHud } from "../ui/InventoryHud";
import { AlertNetworkHud } from "../ui/AlertNetworkHud";
import type { AlertPhase } from "../systems/AlertState";
import type { RadarSnapshot } from "../systems/Radar";
import type { AlertNetworkSnapshot } from "../systems/AlertNetwork";

/**
 * A parallel overlay scene for the HUD.
 *
 * The game camera is zoomed for the SNES look, which also scales anything drawn
 * in that scene — including fixed UI. Running the HUD in its own unzoomed scene
 * keeps it pixel-perfect and screen-anchored. GameScene publishes the alert
 * phase, detection level, and radar snapshot through the registry; this scene
 * reads them.
 */
export class UIScene extends Phaser.Scene {
  private hud!: Hud;
  private radar!: Radar;
  private inventory!: InventoryHud;
  private network!: AlertNetworkHud;
  // A tiny stand-in that mirrors the phase the HUD needs to colour itself.
  private readonly alertView = { phase: "INFILTRATION" as AlertPhase };

  constructor() {
    super("UIScene");
  }

  create(): void {
    this.hud = new Hud(this);
    this.radar = new Radar(this);
    this.inventory = new InventoryHud(this);
    this.network = new AlertNetworkHud(this);
  }

  update(): void {
    this.alertView.phase = (this.registry.get("alertPhase") as AlertPhase) ?? "INFILTRATION";
    const detection = (this.registry.get("detection") as number) ?? 0;
    this.hud.update(this.alertView, detection);

    const radarSnapshot = this.registry.get("radar") as RadarSnapshot | undefined;
    if (radarSnapshot) this.radar.update(radarSnapshot);

    this.inventory.update((this.registry.get("inventory") as string[] | undefined) ?? []);

    const network = this.registry.get("alertNetwork") as AlertNetworkSnapshot | undefined;
    if (network) this.network.update(network);
  }
}
