import Phaser from "phaser";
import type { GameLevel } from "../map/types";
import type { CollisionGrid } from "../systems/CollisionGrid";
import { lightStatsFor } from "../systems/EntityStats";
import {
  rayDirections,
  sightDistances,
  SIGHT_RAYS,
  type RayDirections,
} from "../systems/Visibility";

/** Size of the generated soft light-pool stamp texture, in px. */
const GRADIENT_SIZE = 128;

/** How dark the unlit level gets (0 = no darkening, 1 = black). */
const DARK_ALPHA = 1;

const DARK_COLOR = 0x05070a;

/** Size (px) of the generated flashlight-cone stamp texture. */
const CONE_SIZE = 256;
/** Half-angle of the flashlight cone, in radians (~30° each side). */
const CONE_HALF_ANGLE = Math.PI / 6;
/** Reach of the flashlight cone, in tiles. */
const CONE_RANGE_TILES = 5.5;

/** How far (px) the viewer must move before the visibility polygon is recast. */
const RECAST_EPSILON = 0.5;

interface Light {
  x: number;
  y: number;
  radiusPx: number;
  flicker: boolean;
  phase: number;
  /** The stamp erased at this light. One per light so all of them batch together. */
  stamp: Phaser.GameObjects.Image;
}

/** The player's flashlight beam, or null when it isn't emitting. */
export interface FlashlightBeam {
  x: number;
  y: number;
  /** Facing angle in radians. */
  facing: number;
}

/**
 * Visible dynamic lighting: fills the level with opaque darkness, punches bright
 * pools out of it at each `light_source` (plus the player's flashlight cone), then
 * puts the darkness back everywhere the player has no line of sight.
 *
 * The darkness is a mechanic, not a tint. Unlit space is genuinely black, and what
 * light there is only reads where walls don't stand in the way — so a lit room
 * behind a wall, and a guard patrolling around a corner, are both invisible until
 * you have real sight of them. It reads the *same* `light_sources` data the
 * `DetectionSystem` uses (via `lightStatsFor`), so a lit spot is both visibly
 * brighter and mechanically easier to be seen in.
 *
 * Two layers, deliberately kept apart because they change at different rates:
 *
 * - **The light texture** — a level-sized `RenderTexture` filled opaque dark with a
 *   soft radial-gradient stamp `erase`d at each light (erasing subtracts darkness →
 *   light). Only depends on the lights and the beam, so it is recomposited only when
 *   one of those actually changes. Every stamp is erased in a single batched call:
 *   each `erase` costs a framebuffer round-trip, and doing 50 of them per frame is
 *   what makes this expensive.
 * - **The shadow fan** — an ordinary `Graphics` layered just above, filling opaque
 *   dark over everything outside the viewer's visibility polygon (see
 *   `src/systems/Visibility.ts`). Redrawn whenever the player moves, which is most
 *   frames — so it stays on the display list rather than being drawn into a texture.
 *   Being *over* the light texture is what clips the pools and the cone to line of
 *   sight, with no per-light sight test.
 */
export class Lighting {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly coneStamp: Phaser.GameObjects.Image;
  /** The shadow fan, layered directly above {@link rt}. */
  private readonly shadowGfx: Phaser.GameObjects.Graphics;
  /** Reused erase list: every light stamp, plus the cone when the beam is on. */
  private readonly eraseList: Phaser.GameObjects.Image[] = [];
  private readonly beamRangePx: number;
  private readonly lights: Light[] = [];
  private readonly hasFlicker: boolean;
  private readonly grid: CollisionGrid;
  private readonly tileSize: number;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  /** Hard ceiling on sight: the level diagonal, in px. */
  private readonly maxFarPx: number;
  private readonly dirs: RayDirections;
  private readonly dist: Float64Array;
  private time = 0;
  /** Whether the beam was drawn last frame — so turning it off triggers a clear. */
  private lastBeamOn = false;
  /** Viewer position, camera view and grid state the shadow fan was last built for. */
  private lastViewX = Number.NaN;
  private lastViewY = Number.NaN;
  private lastCamX = Number.NaN;
  private lastCamY = Number.NaN;
  private lastCamW = 0;
  private lastCamH = 0;
  private lastRevision = -1;
  /** Forces both layers to rebuild on the next update. */
  private dirty = true;
  /** Debug switch (see GameScene's `O` hotkey). */
  private enabled = true;

  constructor(scene: Phaser.Scene, level: GameLevel, tileSize: number, grid: CollisionGrid) {
    const worldW = level.width * tileSize;
    const worldH = level.height * tileSize;
    this.beamRangePx = CONE_RANGE_TILES * tileSize;
    this.grid = grid;
    this.tileSize = tileSize;
    this.camera = scene.cameras.main;
    this.maxFarPx = Math.hypot(worldW, worldH);
    this.dirs = rayDirections(SIGHT_RAYS);
    this.dist = new Float64Array(SIGHT_RAYS);

    Lighting.ensureGradientTexture(scene);
    Lighting.ensureConeTexture(scene);

    const lightLayer = level.layers.find((l) => l.name === "light_sources");
    if (lightLayer) {
      for (const t of lightLayer.tiles) {
        const s = lightStatsFor(t.components);
        const radiusPx = s.radius * tileSize;
        const x = (t.x + 0.5) * tileSize;
        const y = (t.y + 0.5) * tileSize;
        // A stamp per light, positioned once. Static lights never touch it again.
        const stamp = scene.make
          .image({ key: "light-gradient", add: false })
          .setOrigin(0.5)
          .setPosition(x, y)
          .setScale((radiusPx * 2) / GRADIENT_SIZE);
        this.lights.push({
          x,
          y,
          radiusPx,
          flicker: s.type.includes("flick"),
          phase: Math.random() * Math.PI * 2,
          stamp,
        });
        this.eraseList.push(stamp);
      }
    }
    this.hasFlicker = this.lights.some((l) => l.flicker);

    // Apex-anchored so rotation pivots at the player and the cone opens forward.
    this.coneStamp = scene.make
      .image({ key: "flashlight-cone", add: false })
      .setOrigin(0, 0.5)
      .setScale(this.beamRangePx / CONE_SIZE);

    this.rt = scene.add
      .renderTexture(0, 0, worldW, worldH)
      .setOrigin(0, 0)
      // Above every world entity (the highest is 600 — a guard's "!" marker), below
      // the debug overlay (900) and the world-space prompts/bars (1000). Opaque
      // darkness has to occlude bodies and cones, not sit under them.
      .setDepth(700);
    this.shadowGfx = scene.add.graphics().setDepth(701);

    // No first draw here: the viewer isn't known until the first update(), which
    // lands inside the scene's fade-in from black.
  }

  /**
   * @param viewer the eye the visibility polygon is cast from (the player).
   * @param beam the player's flashlight beam, or null when it isn't emitting.
   */
  update(dt: number, viewer: { x: number; y: number }, beam: FlashlightBeam | null = null): void {
    if (!this.enabled) return;
    this.time += dt;

    // The light texture only depends on the lights and the beam. Flickering lights
    // animate, and the beam tracks the player; otherwise the last composite stands.
    const beamOn = beam !== null;
    if (this.dirty || this.hasFlicker || beamOn || this.lastBeamOn) {
      this.drawLights(beam);
    }
    this.lastBeamOn = beamOn;

    // The shadow fan depends on where the player is standing, on the walls (so a door
    // opening re-clips sight even if the player never moved), and on the camera view,
    // since the fan only reaches as far as the camera can see. The camera keeps easing
    // toward the player for a few frames after they stop, and a resize changes the
    // view outright — both have to re-extend the fan.
    const v = this.camera.worldView;
    const moved =
      Math.abs(viewer.x - this.lastViewX) > RECAST_EPSILON ||
      Math.abs(viewer.y - this.lastViewY) > RECAST_EPSILON ||
      Math.abs(v.x - this.lastCamX) > RECAST_EPSILON ||
      Math.abs(v.y - this.lastCamY) > RECAST_EPSILON ||
      v.width !== this.lastCamW ||
      v.height !== this.lastCamH;
    if (this.dirty || moved || this.grid.revision !== this.lastRevision) {
      this.lastViewX = viewer.x;
      this.lastViewY = viewer.y;
      this.lastCamX = v.x;
      this.lastCamY = v.y;
      this.lastCamW = v.width;
      this.lastCamH = v.height;
      this.lastRevision = this.grid.revision;
      this.drawShadows(viewer.x, viewer.y);
    }

    this.dirty = false;
  }

  /**
   * Debug switch: hides the whole overlay so the level can be read at full
   * brightness. Re-enabling rebuilds both layers, since they went stale while off.
   */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.rt.setVisible(on);
    this.shadowGfx.setVisible(on);
    if (on) this.dirty = true;
  }

  /** Recomposites the darkness and the light carved out of it. */
  private drawLights(beam: FlashlightBeam | null): void {
    this.rt.clear();
    this.rt.fill(DARK_COLOR, DARK_ALPHA);

    for (const l of this.lights) {
      if (!l.flicker) continue;
      // Gentle irregular pulse in both brightness and reach.
      const f =
        0.82 + 0.18 * Math.sin(this.time * 7 + l.phase) * Math.sin(this.time * 3.1 + l.phase);
      l.stamp.setAlpha(f).setScale(((l.radiusPx * 2) / GRADIENT_SIZE) * (0.92 + 0.08 * f));
    }

    // The player's flashlight: a forward-facing bright cone carved into the dark.
    // One batched erase for everything — each erase is a framebuffer round-trip.
    if (beam) {
      this.coneStamp.setPosition(beam.x, beam.y).setRotation(beam.facing);
      this.eraseList.push(this.coneStamp);
      this.rt.erase(this.eraseList);
      this.eraseList.pop();
    } else if (this.eraseList.length > 0) {
      this.rt.erase(this.eraseList);
    }
  }

  /**
   * Puts the darkness back everywhere the viewer can't see, which is also what
   * clips the light pools and the flashlight cone to line of sight.
   *
   * For each adjacent pair of rays, the region between where sight stopped and the
   * far edge of the level is one opaque quad, drawn as two triangles. Neighbouring
   * quads share exact vertices, so the fan tiles the shadow without seams.
   */
  private drawShadows(viewX: number, viewY: number): void {
    // Only reach as far as the camera can actually see. The quads are huge — running
    // them to the level diagonal rasterizes mostly off-screen pixels for nothing, and
    // anything beyond the view is already dark from the fill underneath.
    const far = Math.min(this.maxFarPx, this.viewReach(viewX, viewY));

    sightDistances(
      this.grid,
      viewX / this.tileSize,
      viewY / this.tileSize,
      far / this.tileSize,
      this.dirs,
      this.dist,
    );

    const g = this.shadowGfx;
    g.clear();
    g.fillStyle(DARK_COLOR, 1);
    const { cos, sin } = this.dirs;
    const n = cos.length;
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      const ti = this.dist[i] * this.tileSize;
      const tj = this.dist[j] * this.tileSize;
      // Both rays ran to the cap: this wedge is unobstructed, nothing to darken.
      if (ti >= far && tj >= far) continue;
      const ax = viewX + cos[i] * ti;
      const ay = viewY + sin[i] * ti;
      const bx = viewX + cos[j] * tj;
      const by = viewY + sin[j] * tj;
      const cx = viewX + cos[j] * far;
      const cy = viewY + sin[j] * far;
      const dx = viewX + cos[i] * far;
      const dy = viewY + sin[i] * far;
      g.fillTriangle(ax, ay, bx, by, cx, cy);
      g.fillTriangle(ax, ay, cx, cy, dx, dy);
    }
  }

  /**
   * Distance from the viewer to the furthest corner of what the camera is showing,
   * plus a tile of slack so the shadow never stops short of the screen edge.
   */
  private viewReach(viewX: number, viewY: number): number {
    const v = this.camera.worldView;
    const dx = Math.max(Math.abs(viewX - v.x), Math.abs(v.right - viewX));
    const dy = Math.max(Math.abs(viewY - v.y), Math.abs(v.bottom - viewY));
    return Math.hypot(dx, dy) + this.tileSize;
  }

  /** Builds (once) the soft radial-gradient stamp: opaque centre → clear edge. */
  private static ensureGradientTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists("light-gradient")) return;
    const g = scene.make.graphics({ x: 0, y: 0 });
    const c = GRADIENT_SIZE / 2;
    const steps = 60;
    for (let i = steps; i > 0; i--) {
      const r = (c * i) / steps;
      // Alpha rises toward the centre; stacked fills make a smooth falloff.
      const a = 0.04 + 0.9 * (1 - i / steps);
      g.fillStyle(0xffffff, a);
      g.fillCircle(c, c, r);
    }
    g.generateTexture("light-gradient", GRADIENT_SIZE, GRADIENT_SIZE);
    g.destroy();
  }

  /**
   * Builds (once) the flashlight-cone stamp: a sector with its apex at the left
   * edge (local origin), opening toward +x, brightest at the apex and softening
   * along its reach — nested slices give the radial falloff, same idea as the
   * light-pool gradient.
   */
  private static ensureConeTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists("flashlight-cone")) return;
    const g = scene.make.graphics({ x: 0, y: 0 });
    const apexY = CONE_SIZE / 2;
    const steps = 48;
    for (let i = steps; i > 0; i--) {
      const r = (CONE_SIZE * i) / steps;
      // Alpha rises toward the apex; stacked sectors make a smooth falloff.
      const a = 0.03 + 0.85 * (1 - i / steps);
      g.fillStyle(0xffffff, a);
      g.slice(0, apexY, r, -CONE_HALF_ANGLE, CONE_HALF_ANGLE, false);
      g.fillPath();
    }
    g.generateTexture("flashlight-cone", CONE_SIZE, CONE_SIZE);
    g.destroy();
  }
}
