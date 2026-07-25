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

/**
 * Size of the generated soft light-pool stamp texture, in px. Comfortably larger
 * than the biggest pool it has to cover (a 3.5-tile light is 224px across) so the
 * stamp is always scaled *down* — an upscaled gradient shows its own pixel steps,
 * which is a texture artefact masquerading as a lighting one.
 */
const GRADIENT_SIZE = 256;

/** How dark the unlit level gets (0 = no darkening, 1 = black). */
const DARK_ALPHA = 1;

const DARK_COLOR = 0x05070a;

/** Size (px) of the generated flashlight-cone stamp texture. */
const CONE_SIZE = 256;
/** Half-angle of the flashlight cone, in radians (~30° each side). */
const CONE_HALF_ANGLE = Math.PI / 6;
/** Reach of the flashlight cone, in tiles. */
const CONE_RANGE_TILES = 5.5;

/**
 * Fraction of a light's reach that stays at full strength before the falloff starts.
 *
 * Every stamp shares the {@link falloff} curve: flat to the core, then a smoothstep
 * to nothing. The core is what keeps a pool *bright* — at 0 the light becomes a dim
 * smudge, which matters a lot now that unlit space is genuinely black rather than a
 * tint you could still read through.
 *
 * Half the radius is a deliberate balance. Against the old stacked-circle stamp it
 * keeps ~75% of the light while cutting the steepest part of the falloff from a slope
 * of ~320 (a step in all but name — the rim) to ~3. Almost all of the harshness came
 * from that near-discontinuity rather than from the plateau, so there is no need to
 * darken the level to be rid of it.
 */
const POOL_CORE = 0.5;
/** Same, along the flashlight beam — kept longer so the beam stays useful at reach. */
const CONE_RANGE_CORE = 0.4;
/** Same, across the beam: the middle of the cone is full strength, the sides fade. */
const CONE_ANGLE_CORE = 0.5;

/**
 * Feather applied to the line-of-sight boundary, in screen px.
 *
 * The shadow fan is opaque geometry, so its edges — the wall faces *and* the long
 * penumbra edges thrown by corners — are mathematically sharp. A blur is what softens
 * both at once: the corner penumbra is the fan's inner boundary *between* adjacent
 * rays, so it needs softening across the angular direction, which no amount of extra
 * rays or radial gradient can do.
 */
const SHADOW_FEATHER_PX = 4;
/**
 * Blur quality (0 = fewest taps) and pass count for that feather.
 *
 * Measured against the alternatives on this scene: low quality over two passes is
 * visually indistinguishable from medium-over-four but a quarter of the cost, while
 * dropping to a single pass starts to bring the hard edges back. Numbers came off a
 * software rasteriser, where a full-screen pass is pathologically expensive — on a GPU
 * all of these are cheap — so treat them as a ranking, not a budget.
 */
const SHADOW_FEATHER_QUALITY = 0;
const SHADOW_FEATHER_STEPS = 2;

/**
 * Radius (tiles) of the soft pool Rowan carries with him, so his immediate
 * surroundings read even with no fixture nearby. Dark-adapted eyes, not an emitted
 * light: it is deliberately *not* fed to `DetectionSystem`, so unlike the flashlight
 * it costs nothing in visibility to the guards. Still clipped by line of sight —
 * it lights the floor around you, not through the wall you are standing against.
 *
 * Kept small on purpose: at `POOL_CORE` (0.5) this is full-bright to 0.75 tiles and
 * fades out by 1.5 — enough to read your own feet and the tile beside you, not a
 * rooms-away glow. A bigger radius reads as a personal spotlight rather than
 * eyes-adjusting-to-the-dark, which undercuts the point of the darkness being opaque.
 */
const PLAYER_LIGHT_TILES = 1.5;

/** How far (px) the viewer must move before the visibility polygon is recast. */
const RECAST_EPSILON = 0.5;

/** Smooth 0→1 ramp with zero slope at both ends. */
function smoothstep(t: number): number {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

/**
 * Light strength at normalised distance `u` (0 at the source, 1 at its reach): full
 * out to `core`, then easing to nothing at the edge.
 *
 * Shared by every stamp so they all fade the same way. The shape matters more than it
 * looks: the previous stamps were built by stacking translucent circles, whose
 * composite happened to hold a flat 1.0 out to 60% of the radius and then fall off a
 * cliff over the last third — a plateau with a rim, which is what read as artificial
 * once the surrounding dark went fully opaque.
 */
function falloff(u: number, core: number): number {
  if (u <= core) return 1;
  if (u >= 1) return 0;
  return 1 - smoothstep((u - core) / (1 - core));
}

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
  /** The pool Rowan carries — see {@link PLAYER_LIGHT_TILES}. */
  private readonly playerStamp: Phaser.GameObjects.Image;
  /** The shadow fan, layered directly above {@link rt}. */
  private readonly shadowGfx: Phaser.GameObjects.Graphics;
  /**
   * Reused erase list. The fixed `light_source` stamps occupy the first
   * {@link lightCount} slots; the player's pool and the cone are appended per draw.
   */
  private readonly eraseList: Phaser.GameObjects.Image[] = [];
  private readonly lightCount: number;
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
    this.lightCount = this.eraseList.length;

    // Apex-anchored so rotation pivots at the player and the cone opens forward.
    this.coneStamp = scene.make
      .image({ key: "flashlight-cone", add: false })
      .setOrigin(0, 0.5)
      .setScale(this.beamRangePx / CONE_SIZE);

    this.playerStamp = scene.make
      .image({ key: "light-gradient", add: false })
      .setOrigin(0.5)
      .setScale((PLAYER_LIGHT_TILES * tileSize * 2) / GRADIENT_SIZE);

    this.rt = scene.add
      .renderTexture(0, 0, worldW, worldH)
      .setOrigin(0, 0)
      // Above every world entity (the highest is 600 — a guard's "!" marker), below
      // the debug overlay (900) and the world-space prompts/bars (1000). Opaque
      // darkness has to occlude bodies and cones, not sit under them.
      .setDepth(700);
    this.shadowGfx = scene.add.graphics().setDepth(701);
    // Soften the sight boundary — see SHADOW_FEATHER_PX. Optional-chained because
    // Phaser only populates `postFX` once a Game Object has initialised its post
    // pipeline; if a build ever stops doing that for Graphics, the shadows go back to
    // being crisp rather than taking the whole scene down with a null dereference.
    this.shadowGfx.postFX?.addBlur(
      SHADOW_FEATHER_QUALITY,
      SHADOW_FEATHER_PX,
      SHADOW_FEATHER_PX,
      1,
      0xffffff,
      SHADOW_FEATHER_STEPS,
    );

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

    const viewerMoved =
      Math.abs(viewer.x - this.lastViewX) > RECAST_EPSILON ||
      Math.abs(viewer.y - this.lastViewY) > RECAST_EPSILON;

    // The light texture depends on the lights, the beam, and — since Rowan carries a
    // pool of his own — on where he is standing. Flickering lights animate and the
    // beam tracks him; otherwise the last composite stands.
    const beamOn = beam !== null;
    if (this.dirty || viewerMoved || this.hasFlicker || beamOn || this.lastBeamOn) {
      this.drawLights(viewer, beam);
    }
    this.lastBeamOn = beamOn;

    // The shadow fan depends on the same position, on the walls (so a door opening
    // re-clips sight even if the player never moved), and on the camera view, since
    // the fan only reaches as far as the camera can see. The camera keeps easing
    // toward the player for a few frames after they stop, and a resize changes the
    // view outright — both have to re-extend the fan.
    const v = this.camera.worldView;
    const moved =
      viewerMoved ||
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
  private drawLights(viewer: { x: number; y: number }, beam: FlashlightBeam | null): void {
    this.rt.clear();
    this.rt.fill(DARK_COLOR, DARK_ALPHA);

    for (const l of this.lights) {
      if (!l.flicker) continue;
      // Gentle irregular pulse in both brightness and reach.
      const f =
        0.82 + 0.18 * Math.sin(this.time * 7 + l.phase) * Math.sin(this.time * 3.1 + l.phase);
      l.stamp.setAlpha(f).setScale(((l.radiusPx * 2) / GRADIENT_SIZE) * (0.92 + 0.08 * f));
    }

    // Everything in one batched erase — each erase is a framebuffer round-trip, and
    // doing them one stamp at a time is what made this unaffordable.
    const list = this.eraseList;
    list.push(this.playerStamp.setPosition(viewer.x, viewer.y));
    // The flashlight: a forward-facing bright cone carved into the dark.
    if (beam) list.push(this.coneStamp.setPosition(beam.x, beam.y).setRotation(beam.facing));
    this.rt.erase(list);
    list.length = this.lightCount;
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

  /**
   * Builds (once) a stamp texture by evaluating `alphaAt` per pixel.
   *
   * Written pixel by pixel rather than by stacking translucent shapes, so the falloff
   * is exactly {@link falloff} instead of whatever a pile of alpha-composited fills
   * happens to add up to. Only the alpha channel carries meaning — these are masks
   * `erase`d out of the darkness, never drawn — but the RGB is left white so the
   * texture is also sane if it ever gets drawn normally.
   *
   * Filtered LINEAR, overriding the game-wide `pixelArt` NEAREST: a lighting mask is
   * not sprite art, and nearest-neighbour sampling puts stair-steps in the gradient.
   * The level art underneath keeps its crisp look regardless, since the darkness is a
   * separate object layered above it.
   */
  private static ensureStampTexture(
    scene: Phaser.Scene,
    key: string,
    size: number,
    alphaAt: (x: number, y: number) => number,
  ): void {
    if (scene.textures.exists(key)) return;
    const tex = scene.textures.createCanvas(key, size, size);
    if (!tex) return;
    const ctx = tex.getContext();
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = Math.round(255 * alphaAt(x + 0.5, y + 0.5));
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  /** The soft radial light-pool stamp: full centre → clear edge. */
  private static ensureGradientTexture(scene: Phaser.Scene): void {
    const c = GRADIENT_SIZE / 2;
    Lighting.ensureStampTexture(scene, "light-gradient", GRADIENT_SIZE, (x, y) =>
      falloff(Math.hypot(x - c, y - c) / c, POOL_CORE),
    );
  }

  /**
   * The flashlight-cone stamp: a sector with its apex at the left edge (local origin)
   * opening toward +x, so the caller can pivot it at the player and point it along
   * their facing. Falls off both *along* the beam and *across* it — the second is what
   * keeps the cone's sides from being a hard step.
   */
  private static ensureConeTexture(scene: Phaser.Scene): void {
    const apexY = CONE_SIZE / 2;
    Lighting.ensureStampTexture(scene, "flashlight-cone", CONE_SIZE, (x, y) => {
      const dx = x;
      const dy = y - apexY;
      const reach = falloff(Math.hypot(dx, dy) / CONE_SIZE, CONE_RANGE_CORE);
      if (reach <= 0) return 0;
      const offAxis = Math.atan2(Math.abs(dy), dx);
      return reach * falloff(offAxis / CONE_HALF_ANGLE, CONE_ANGLE_CORE);
    });
  }
}
