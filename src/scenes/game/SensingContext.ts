import type { AlertState } from "../../systems/AlertState";
import type { CollisionGrid } from "../../systems/CollisionGrid";
import type { DetectionSystem } from "../../systems/DetectionSystem";
import type { EnforcerContext, GuardAnomaly } from "../../entities/Enforcer";

/**
 * Builds the per-frame {@link EnforcerContext} every guard, camera and boss
 * reads — without rebuilding it.
 *
 * `GameScene.update()` used to compose this as an object literal each frame.
 * At 60fps that is not the object itself that hurts so much as its passengers:
 * five arrow functions, a player point, a velocity point and a chaff zone,
 * allocated and discarded sixty times a second for the entire run, all of them
 * closing over a `this` that never changes.
 *
 * So the shape is built once and mutated in place. The closures are bound at
 * construction; the frame's values arrive through the setters below. Consumers
 * only ever read the context within the frame they were handed it, which is
 * what makes reuse safe — the one thing not to do is stash the object, or the
 * arrays hanging off it, and read it next frame.
 */

/** The long-lived collaborators the context points at, fixed for a level. */
export interface SensingDeps {
  grid: CollisionGrid;
  tileSize: number;
  detection: DetectionSystem;
  alert: AlertState;
  /** True while the flashlight beam is lit — it makes Rowan far easier to spot. */
  flashlightOn: () => boolean;
  /** True while Thermal Gel is masking body heat. */
  thermalMasked: () => boolean;
  /** Extra detection multiplier applied on top of the map's lights. */
  flashlightMultiplier: number;
  coverTilesNear: (tileX: number, tileY: number, radiusTiles: number) => { x: number; y: number }[];
  isGuardDoor: (tileX: number, tileY: number) => boolean;
  setDoorOpen: (tileX: number, tileY: number, open: boolean) => void;
}

export class SensingContext {
  private readonly ctx: EnforcerContext;
  /** Mutated in place rather than reallocated; `ctx.chaffZone` points here or is null. */
  private readonly chaff = { x: 0, y: 0, radiusPx: 0 };

  constructor(deps: SensingDeps) {
    this.ctx = {
      grid: deps.grid,
      tileSize: deps.tileSize,
      player: { x: 0, y: 0 },
      lightMultiplierAt: (x, y) =>
        deps.detection.multiplierAt(x, y) *
        (deps.flashlightOn() ? deps.flashlightMultiplier : 1),
      playerNoise: 0,
      playerConcealed: false,
      playerCompliant: false,
      playerThermalConcealed: false,
      chaffZone: null,
      thermalRadiusMultiplier: (base) => deps.detection.thermalRadiusFor(base, deps.thermalMasked()),
      alert: deps.alert,
      anomalies: [],
      playerVelocity: { x: 0, y: 0 },
      coverTilesNear: deps.coverTilesNear,
      isGuardDoor: deps.isGuardDoor,
      setDoorOpen: deps.setDoorOpen,
    };
  }

  /** Where the player is, how loud, and how fast — for sensing and search prediction. */
  setPlayer(x: number, y: number, noise: number, vx: number, vy: number): void {
    this.ctx.player.x = x;
    this.ctx.player.y = y;
    this.ctx.playerNoise = noise;
    this.ctx.playerVelocity!.x = vx;
    this.ctx.playerVelocity!.y = vy;
  }

  /**
   * @param concealed hidden from vision cones (cover, or the Shared Field).
   * @param compliant reads as staff, so sensing is suppressed outright.
   * @param thermalConcealed hidden from the short-range heat sense as well.
   */
  setConcealment(concealed: boolean, compliant: boolean, thermalConcealed: boolean): void {
    this.ctx.playerConcealed = concealed;
    this.ctx.playerCompliant = compliant;
    this.ctx.playerThermalConcealed = thermalConcealed;
  }

  /** The live EMP Grenade EMP zone, or `active: false` when none is running. */
  setChaff(active: boolean, x: number, y: number, radiusPx: number): void {
    if (!active) {
      this.ctx.chaffZone = null;
      return;
    }
    this.chaff.x = x;
    this.chaff.y = y;
    this.chaff.radiusPx = radiusPx;
    this.ctx.chaffZone = this.chaff;
  }

  /** This frame's anomaly list. Borrowed, not copied — see the class doc. */
  setAnomalies(anomalies: GuardAnomaly[]): void {
    this.ctx.anomalies = anomalies;
  }

  /** The live chaff zone, for callers that need it outside the context. */
  get chaffZone(): { x: number; y: number; radiusPx: number } | null {
    return this.ctx.chaffZone;
  }

  /** The context for this frame. Valid only until the next `set*` call. */
  get current(): EnforcerContext {
    return this.ctx;
  }
}
