import Phaser from "phaser";
import { Hud } from "../ui/Hud";
import { Radar } from "../ui/Radar";
import { InventoryHud } from "../ui/InventoryHud";
import { AlertNetworkHud } from "../ui/AlertNetworkHud";
import { ObjectiveHud } from "../ui/ObjectiveHud";
import { SharedFieldHud, type SharedFieldView } from "../ui/SharedFieldHud";
import { Vent4Hud } from "../ui/Vent4Hud";
import { DebugHud, type DebugSnapshot } from "../ui/DebugHud";
import type { AlertPhase } from "../systems/AlertState";
import type { RadarSnapshot } from "../systems/Radar";
import type { AlertNetworkSnapshot } from "../systems/AlertNetwork";
import type { ObjectiveState } from "../systems/Objectives";
import type { Vent4View } from "../systems/Vent4Core";

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
  private objectives!: ObjectiveHud;
  private sharedField!: SharedFieldHud;
  private vent4!: Vent4Hud;
  // The debug inspector exists only in dev builds (see create()).
  private debug?: DebugHud;
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
    this.objectives = new ObjectiveHud(this);
    this.sharedField = new SharedFieldHud(this);
    this.vent4 = new Vent4Hud(this);
    if (import.meta.env.DEV) this.debug = new DebugHud(this);
  }

  update(): void {
    this.alertView.phase = (this.registry.get("alertPhase") as AlertPhase) ?? "INFILTRATION";
    const detection = (this.registry.get("detection") as number) ?? 0;
    const hp = (this.registry.get("playerHp") as number | undefined) ?? 0;
    const maxHp = (this.registry.get("playerMaxHp") as number | undefined) ?? 1;
    this.hud.update(this.alertView, detection, hp, maxHp);

    const radarSnapshot = this.registry.get("radar") as RadarSnapshot | undefined;
    if (radarSnapshot) this.radar.update(radarSnapshot);

    this.inventory.update((this.registry.get("inventory") as string[] | undefined) ?? []);

    const network = this.registry.get("alertNetwork") as AlertNetworkSnapshot | undefined;
    if (network) this.network.update(network);

    const objState = this.registry.get("objectives") as ObjectiveState | undefined;
    const level = (this.registry.get("currentLevel") as string | undefined) ?? "";
    if (objState) this.objectives.update(objState, level);

    const field = this.registry.get("sharedField") as SharedFieldView | undefined;
    if (field) this.sharedField.update(field);

    this.vent4.update((this.registry.get("vent4") as Vent4View | null | undefined) ?? null);

    this.debug?.update(this.registry.get("debug") as DebugSnapshot | undefined);
  }
}
