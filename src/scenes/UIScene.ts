import Phaser from "phaser";
import { Hud } from "../ui/Hud";
import { Radar } from "../ui/Radar";
import { InventoryHud } from "../ui/InventoryHud";
import { AlertNetworkHud } from "../ui/AlertNetworkHud";
import { ObjectiveHud } from "../ui/ObjectiveHud";
import { SharedFieldHud, type SharedFieldView } from "../ui/SharedFieldHud";
import { Vent4Hud } from "../ui/Vent4Hud";
import { DebugHud, type DebugSnapshot } from "../ui/DebugHud";
import { DEBUG_ALLOWED } from "../systems/DebugFlag";
import type { AlertPhase } from "../systems/AlertState";
import type { RadarSnapshot } from "../systems/Radar";
import type { AlertNetworkSnapshot } from "../systems/AlertNetwork";
import type { ObjectiveState } from "../systems/Objectives";
import type { Vent4View } from "../systems/Vent4Core";
import type { ActiveItemsView } from "../systems/ActiveItems";
import { consumableSlots } from "../systems/EntityStats";

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
  // The debug inspector is only built when DEBUG_ALLOWED (see create()).
  private debug?: DebugHud;
  // A tiny stand-in that mirrors the phase the HUD needs to colour itself.
  private readonly alertView = { phase: "INFILTRATION" as AlertPhase };
  /** Hotkeys [1]–[4], mapped dynamically to the held consumables each frame. */
  private itemKeys!: Phaser.Input.Keyboard.Key[];

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
    if (DEBUG_ALLOWED) this.debug = new DebugHud(this);

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.itemKeys = [K.ONE, K.TWO, K.THREE, K.FOUR].map((c) => this.input.keyboard!.addKey(c));
  }

  update(): void {
    this.alertView.phase = (this.registry.get("alertPhase") as AlertPhase) ?? "INFILTRATION";
    const detection = (this.registry.get("detection") as number) ?? 0;
    const hp = (this.registry.get("playerHp") as number | undefined) ?? 0;
    const maxHp = (this.registry.get("playerMaxHp") as number | undefined) ?? 1;
    this.hud.update(this.alertView, detection, hp, maxHp);

    const radarSnapshot = this.registry.get("radar") as RadarSnapshot | undefined;
    if (radarSnapshot) this.radar.update(radarSnapshot);

    const items = (this.registry.get("inventory") as string[] | undefined) ?? [];
    // Hotkeys [1]–[4] map to the held consumables in canonical slot order.
    const slots = consumableSlots(items);
    for (let i = 0; i < this.itemKeys.length; i++) {
      if (!Phaser.Input.Keyboard.JustDown(this.itemKeys[i])) continue;
      const slot = slots.find((s) => s.slot === i + 1);
      if (slot) this.registry.set("itemUseRequest", slot.name);
    }
    const activeItems = (this.registry.get("activeItems") as ActiveItemsView | undefined) ?? {
      chaffRemaining: 0,
      thermalRemaining: 0,
      flashlightOwned: true,
      flashlightOn: false,
      flashlightCharge: 1,
    };
    this.inventory.update(items, activeItems);

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
