import type Phaser from "phaser";
import type { ComponentData } from "../map/types";
import { Enforcer } from "./Enforcer";
import { DRONE_SKIN } from "./DroneAnimations";

/**
 * A patrol drone. Mechanically identical to {@link Enforcer} — the map's
 * `drones` tiles (found in the crawlspace levels) carry the exact same
 * `enforcer` DataComponent/stats schema as guards — so this is just the
 * drone's {@link GuardSkin} wired into the shared AI core.
 */
export class Drone extends Enforcer {
  constructor(
    scene: Phaser.Scene,
    tileX: number,
    tileY: number,
    tileSize: number,
    components: ComponentData[],
  ) {
    super(scene, tileX, tileY, tileSize, components, DRONE_SKIN);
  }
}
