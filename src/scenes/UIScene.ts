import Phaser from "phaser";
import { Hud } from "../ui/Hud";
import { Radar } from "../ui/Radar";
import { InventoryHud } from "../ui/InventoryHud";
import { AlertNetworkHud } from "../ui/AlertNetworkHud";
import { ObjectiveHud } from "../ui/ObjectiveHud";
import { SharedFieldHud, type SharedFieldView } from "../ui/SharedFieldHud";
import { Vent4Hud } from "../ui/Vent4Hud";
import { BossCoreHud } from "../ui/BossCoreHud";
import { RelayHud } from "../ui/RelayHud";
import { DebugHud, type DebugSnapshot } from "../ui/DebugHud";
import { DEBUG_ALLOWED } from "../systems/DebugFlag";
import type { AlertPhase } from "../systems/AlertState";
import type { RadarSnapshot } from "../systems/Radar";
import type { AlertNetworkSnapshot } from "../systems/AlertNetwork";
import type { MissionFeatures, ObjectiveState } from "../systems/Objectives";
import type { Vent4View } from "../systems/Vent4Core";
import type { SmacView } from "../systems/SmacCore";
import type { RelayView } from "../systems/RelayCore";
import type { ActiveItemsView } from "../systems/ActiveItems";
import type { ConductView } from "../systems/Conduct";
import { consumableSlots } from "../systems/EntityStats";
import { isSuspended, missionFeatures } from "../systems/GameState";

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
  private smac!: BossCoreHud;
  private relay!: RelayHud;
  // The debug inspector is only built when DEBUG_ALLOWED (see create()).
  private debug?: DebugHud;
  // A tiny stand-in that mirrors the phase the HUD needs to colour itself.
  private readonly alertView = { phase: "INFILTRATION" as AlertPhase };
  /** Which acts this map furnished; see `missionFeatures`. Constant for the run. */
  private features?: MissionFeatures;
  /** The item cursor: `,`/`.` move the selection, `Enter` uses it. */
  private itemKeys!: {
    prev: Phaser.Input.Keyboard.Key;
    next: Phaser.Input.Keyboard.Key;
    use: Phaser.Input.Keyboard.Key;
  };

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
    this.smac = new BossCoreHud(this);
    this.relay = new RelayHud(this);
    if (DEBUG_ALLOWED) this.debug = new DebugHud(this);

    const K = Phaser.Input.Keyboard.KeyCodes;
    const kb = this.input.keyboard!;
    this.itemKeys = {
      prev: kb.addKey(K.COMMA),
      next: kb.addKey(K.PERIOD),
      use: kb.addKey(K.ENTER),
    };
  }

  update(): void {
    this.alertView.phase = (this.registry.get("alertPhase") as AlertPhase) ?? "INFILTRATION";
    const detection = (this.registry.get("detection") as number) ?? 0;
    const hp = (this.registry.get("playerHp") as number | undefined) ?? 0;
    const maxHp = (this.registry.get("playerMaxHp") as number | undefined) ?? 1;
    this.hud.update(
      this.alertView,
      detection,
      hp,
      maxHp,
      this.registry.get("conduct") as ConductView | undefined,
    );

    const radarSnapshot = this.registry.get("radar") as RadarSnapshot | undefined;
    if (radarSnapshot) this.radar.update(radarSnapshot);

    const items = (this.registry.get("inventory") as string[] | undefined) ?? [];

    // The item cursor: `,`/`.` move the selection among held consumables (in
    // canonical order), `Enter` uses whichever one is currently selected —
    // the Metal-Gear-style cycle-then-confirm scheme, replacing a direct
    // per-slot hotkey. The selection is normalised every frame (regardless of
    // suspension, so the HUD never shows a stale pick) to whatever's still
    // held; only the keys that move or spend it are gated below.
    const slots = consumableSlots(items);
    let selected = this.registry.get("selectedConsumable") as string | undefined;
    if (!slots.some((s) => s.name === selected)) {
      selected = slots[0]?.name;
      if (selected) this.registry.set("selectedConsumable", selected);
      else this.registry.remove("selectedConsumable");
    }
    // Skipped while an overlay owns the screen. This scene keeps updating behind
    // the pause menu, the codec and both minigames, so without the gate a
    // keypress there queues an itemUseRequest that GameScene spends the moment
    // play resumes — a consumable vanishing for no reason several seconds later.
    if (!isSuspended(this.registry) && slots.length > 0) {
      const index = slots.findIndex((s) => s.name === selected);
      if (Phaser.Input.Keyboard.JustDown(this.itemKeys.next)) {
        selected = slots[(index + 1) % slots.length].name;
        this.registry.set("selectedConsumable", selected);
      } else if (Phaser.Input.Keyboard.JustDown(this.itemKeys.prev)) {
        selected = slots[(index - 1 + slots.length) % slots.length].name;
        this.registry.set("selectedConsumable", selected);
      }
      if (selected && Phaser.Input.Keyboard.JustDown(this.itemKeys.use)) {
        this.registry.set("itemUseRequest", selected);
      }
    }
    const activeItems = (this.registry.get("activeItems") as ActiveItemsView | undefined) ?? {
      chaffRemaining: 0,
      thermalRemaining: 0,
      flashlightOwned: true,
      flashlightOn: false,
      flashlightCharge: 1,
      sackLunchOpened: false,
    };
    this.inventory.update(items, activeItems, selected);

    const network = this.registry.get("alertNetwork") as AlertNetworkSnapshot | undefined;
    if (network) this.network.update(network);

    const objState = this.registry.get("objectives") as ObjectiveState | undefined;
    const level = (this.registry.get("currentLevel") as string | undefined) ?? "";
    if (objState) {
      // Resolved once: the flags behind it are written by BootScene before the first
      // frame and never move, so rebuilding it here was an object and a closure per
      // frame to re-derive a constant — in a second 60fps loop, on every level.
      this.features ??= missionFeatures(this.registry);
      this.objectives.update(objState, level, this.features);
    }

    const field = this.registry.get("sharedField") as SharedFieldView | undefined;
    if (field) this.sharedField.update(field);

    // All three encounter HUDs are updated unconditionally: this scene outlives level
    // swaps, so passing null is how each one learns to clear itself.
    this.vent4.update((this.registry.get("vent4") as Vent4View | null | undefined) ?? null);
    this.smac.update((this.registry.get("smac") as SmacView | null | undefined) ?? null);
    this.relay.update((this.registry.get("relay") as RelayView | null | undefined) ?? null);

    this.debug?.update(this.registry.get("debug") as DebugSnapshot | undefined);
  }
}
