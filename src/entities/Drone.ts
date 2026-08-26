import type Phaser from "phaser";
import type { ComponentData } from "../map/types";
import { Enforcer } from "./Enforcer";
import { DRONE_SKIN } from "./DroneAnimations";
import type { SilicateVoice } from "../systems/SilicateBarks";
import type { PatrolRoute } from "../systems/PatrolRoute";

/**
 * A patrol drone. Mechanically identical to {@link Enforcer} — the map's
 * `drones` tiles (found in the crawlspace levels) carry the exact same
 * `enforcer` DataComponent/stats schema as guards — so this is just the
 * drone's {@link GuardSkin} wired into the shared AI core.
 */
export class Drone extends Enforcer {
  /** The smaller, faster of the two silicate voices. See `SilicateBarks`. */
  protected override get voice(): SilicateVoice {
    return "drone";
  }

  constructor(
    scene: Phaser.Scene,
    tileX: number,
    tileY: number,
    tileSize: number,
    components: ComponentData[],
    route: PatrolRoute = [],
    plane = 0,
  ) {
    super(scene, tileX, tileY, tileSize, components, DRONE_SKIN, route, plane);
  }
}
