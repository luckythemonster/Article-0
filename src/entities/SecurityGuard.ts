import type Phaser from "phaser";
import type { ComponentData } from "../map/types";
import { Enforcer } from "./Enforcer";
import { SECURITY_SKIN } from "./SecurityGuardAnimations";
import { securityGuardStatsFor } from "../systems/EntityStats";
import type { PatrolRoute } from "../systems/PatrolRoute";

/**
 * A human security guard — facility staff on a shift, not a silicate.
 *
 * The same arrangement {@link Drone} has with {@link Enforcer}, one step further:
 * the drone swaps the skin and keeps an enforcer's numbers, and this swaps both.
 * The AI underneath is unchanged, because a man walking a beat and a sentry
 * gliding one want the same patrol/suspect/pursue machine — what differs is how
 * well he does it, and that is entirely in
 * {@link securityGuardStatsFor}: shorter sight, slower to be sure, no thermal
 * sense, a radio instead of a place on the mesh.
 *
 * He reads the map's `enforcer` component like every other guard, since that is
 * the tuning schema the `security_guard_*` boards actually carry — see
 * `src/map/EntityIndex.ts` for how a board becomes one of these.
 */
export class SecurityGuard extends Enforcer {
  /** He is a person. See {@link Enforcer.isSilicate} for what that changes. */
  override get isSilicate(): boolean {
    return false;
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
    super(
      scene,
      tileX,
      tileY,
      tileSize,
      components,
      SECURITY_SKIN,
      route,
      plane,
      securityGuardStatsFor(components),
    );
  }
}
