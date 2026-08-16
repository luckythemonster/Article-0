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
import { len } from "../systems/distance";
import {
  ensureRadialStamp,
  ensureStampTexture,
  RADIAL_STAMP_KEY,
  RADIAL_STAMP_SIZE,
} from "../render/stamps";
import { falloff } from "../render/falloff";
import { snapToPixel } from "../render/pixelScale";
import { emptySample, sampleLightAt, type LightSample } from "../render/lightSampling";
import { UI, hex } from "./hudTheme";

/** How dark the unlit level gets (0 = no darkening, 1 = black). */
const DARK_ALPHA = 1;

const DARK_COLOR = hex(UI.bgVoid);

/** Size (px) of the generated flashlight-cone stamp texture. */
const CONE_SIZE = 256;
/** Half-angle of the flashlight cone, in radians (~30° each side). */
const CONE_HALF_ANGLE = Math.PI / 6;
/** Reach of the flashlight cone, in tiles. */
const CONE_RANGE_TILES = 5.5;

/**
 * The `POOL_CORE` from `src/render/falloff.ts` as it applies along the
 * flashlight beam — kept longer so the beam stays useful at reach.
 */
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

interface Light {
  x: number;
  y: number;
  radiusPx: number;
  flicker: boolean;
  phase: number;
  /**
   * The fixture's tile-def ref, which is what a breaker's `Target` names.
   *
   * Kept per light rather than resolved to a list of indices once, so that this
   * and `DetectionSystem` — which has to make the identical cut — do not have to
   * agree on an iteration order neither of them states.
   */
  ref: string;
  /** False once a breaker has opened this light's circuit. See {@link Lighting.setCircuit}. */
  powered: boolean;
  /**
   * Current brightness multiplier, 1 for a steady light and the flicker factor for a
   * guttering one. Written by {@link Lighting.drawLights} where that factor is already
   * being computed for the stamp, and read by {@link Lighting.sampleLight} so a shadow
   * cast by a failing lamp gutters along with it.
   */
  intensity: number;
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
   * A never-rendered twin of {@link shadowGfx}, existing only to be a geometry
   * mask source — see {@link shadowGeometry}.
   */
  private readonly shadowMaskGfx: Phaser.GameObjects.Graphics;
  /**
   * Reused erase list. The fixed `light_source` stamps occupy the first
   * {@link lightCount} slots; the player's pool and the cone are appended per draw.
   */
  private readonly eraseList: Phaser.GameObjects.Image[] = [];
  /**
   * How many of {@link eraseList}'s leading slots are fixture stamps.
   *
   * Not `readonly`: {@link setCircuit} rebuilds the prefix from the lights that
   * still have power, so a killed circuit costs nothing per frame rather than
   * being skipped inside the batched erase — which it could not be anyway, since
   * `erase` takes the list wholesale.
   */
  private lightCount: number;
  private readonly beamRangePx: number;
  private readonly lights: Light[] = [];
  private hasFlicker: boolean;
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
  /** The walk surface the visibility polygon is cast against. */
  private plane = 0;
  /** Scratch result for {@link sampleLight} — see the note there on why it is reused. */
  private readonly sample: LightSample = emptySample();

  constructor(scene: Phaser.Scene, level: GameLevel, tileSize: number, grid: CollisionGrid) {
    const worldW = level.width * tileSize;
    const worldH = level.height * tileSize;
    this.beamRangePx = CONE_RANGE_TILES * tileSize;
    this.grid = grid;
    this.tileSize = tileSize;
    this.camera = scene.cameras.main;
    this.maxFarPx = len(worldW, worldH);
    this.dirs = rayDirections(SIGHT_RAYS);
    this.dist = new Float64Array(SIGHT_RAYS);

    ensureRadialStamp(scene);
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
          .image({ key: RADIAL_STAMP_KEY, add: false })
          .setOrigin(0.5)
          .setPosition(x, y)
          .setScale((radiusPx * 2) / RADIAL_STAMP_SIZE);
        this.lights.push({
          x,
          y,
          radiusPx,
          flicker: s.type.includes("flick"),
          phase: Math.random() * Math.PI * 2,
          // Steady until `drawLights` says otherwise, which it only does for flickers.
          intensity: 1,
          ref: t.ref,
          powered: true,
          stamp,
        });
      }
    }
    this.hasFlicker = false;
    this.lightCount = 0;
    this.refreshPoweredLights();

    // Apex-anchored so rotation pivots at the player and the cone opens forward.
    this.coneStamp = scene.make
      .image({ key: "flashlight-cone", add: false })
      .setOrigin(0, 0.5)
      .setScale(this.beamRangePx / CONE_SIZE);

    this.playerStamp = scene.make
      .image({ key: RADIAL_STAMP_KEY, add: false })
      .setOrigin(0.5)
      .setScale((PLAYER_LIGHT_TILES * tileSize * 2) / RADIAL_STAMP_SIZE);

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

    // The mask twin. It shares `shadowGfx`'s command buffer *by reference*, so it
    // always holds exactly the fan that was last drawn at no cost: `drawShadows`
    // emits its triangles once, and `Graphics.clear()` empties the buffer in
    // place (`commandBuffer.length = 0`) rather than replacing the array, so the
    // two never come apart. It is never added to the display list's render pass —
    // `setVisible(false)` — because that is the whole point of it existing.
    this.shadowMaskGfx = scene.add.graphics().setVisible(false);
    this.shadowMaskGfx.commandBuffer = this.shadowGfx.commandBuffer;

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

    // Everything downstream works from the snapped origin, so the halo and the fan
    // agree with each other and with the level under them.
    const eye = snapToPixel(viewer.x, viewer.y);
    // Recast when the snapped origin changes, not on a sub-pixel threshold: below a
    // whole pixel the result is identical, so the old epsilon deadband only bought a
    // lag that showed up as one more step.
    const viewerMoved = eye.x !== this.lastViewX || eye.y !== this.lastViewY;

    // The light texture depends on the lights, the beam, and — since Rowan carries a
    // pool of his own — on where he is standing. Flickering lights animate and the
    // beam tracks him; otherwise the last composite stands.
    const beamOn = beam !== null;
    if (this.dirty || viewerMoved || this.hasFlicker || beamOn || this.lastBeamOn) {
      this.drawLights(eye, beam);
    }
    this.lastBeamOn = beamOn;

    // The shadow fan depends on the same position, on the walls (so a door opening
    // re-clips sight even if the player never moved), and on the camera view, since
    // the fan only reaches as far as the camera can see. The camera keeps easing
    // toward the player for a few frames after they stop, and a resize changes the
    // view outright — both have to re-extend the fan.
    // `worldView` is floored by Phaser regardless of `roundPixels`, so these are
    // already whole pixels and an exact comparison is the honest one.
    const v = this.camera.worldView;
    const moved =
      viewerMoved ||
      v.x !== this.lastCamX ||
      v.y !== this.lastCamY ||
      v.width !== this.lastCamW ||
      v.height !== this.lastCamH;
    if (this.dirty || moved || this.grid.revision !== this.lastRevision) {
      this.lastViewX = eye.x;
      this.lastViewY = eye.y;
      this.lastCamX = v.x;
      this.lastCamY = v.y;
      this.lastCamW = v.width;
      this.lastCamH = v.height;
      this.lastRevision = this.grid.revision;
      this.drawShadows(eye.x, eye.y);
    }

    this.dirty = false;
  }

  /**
   * The shadow fan's geometry — the region the viewer *cannot* see.
   *
   * Exposed for `src/ui/MemoryLayer.ts`, which masks itself to exactly this so
   * remembered art appears only outside line of sight. Sharing the geometry
   * rather than casting a second polygon is what keeps the two boundaries the
   * same line by construction, at no extra cost.
   *
   * This hands back the **mask twin**, not the fan that is actually drawn, and
   * the distinction is load-bearing: a `Graphics` that is rendered on the display
   * list does not also work as a geometry-mask source. Masking to the drawn fan
   * silently produced a stencil that passed everywhere, so remembered art washed
   * over the lit room the player was standing in — measurably, the visible floor
   * came out 30% darker. Two objects over one command buffer is what fixes it.
   */
  get shadowGeometry(): Phaser.GameObjects.Graphics {
    return this.shadowMaskGfx;
  }

  /**
   * How the point `(x, y)` is lit — see {@link sampleLightAt} for the arithmetic.
   *
   * Exists so `EntityShadows` can throw a character's shadow away from whatever is
   * actually lighting them, off the same `light_sources` this overlay draws and the
   * `DetectionSystem` scores. One source of truth: a spot that reads bright, plays
   * dangerous *and* casts a long shadow, and retuning a light moves all three together.
   *
   * The result is a reused scratch object, valid only until the next call. The whole
   * cast asks this every frame and none of them keep the answer.
   *
   * **Only the fixed `light_source` fixtures cast.** The two moving lights are left out
   * deliberately:
   *
   * - Rowan's carried pool is dark-adapted eyes rather than something he emits — the
   *   same reason {@link PLAYER_LIGHT_TILES} keeps it out of `DetectionSystem`. Letting
   *   it cast would put a shadow under everyone he walks near, thrown by nothing.
   * - The flashlight is rigidly attached to him, so his own shadow would sit pinned at
   *   a fixed offset no matter how he moved — motionless relative to the only thing
   *   that could reveal it was there. Worth revisiting for *other* casters lit by the
   *   beam, which is a real effect and needs the cone's angular test to get right.
   */
  sampleLight(x: number, y: number): LightSample {
    return sampleLightAt(this.lights, x, y, this.grid, this.tileSize, this.sample);
  }

  /**
   * Releases everything this overlay owns. Call on scene shutdown.
   *
   * The stamps are the reason this has to exist. They are built with
   * `scene.make.image({ add: false })` — deliberately, because they are erase
   * brushes stamped into a RenderTexture rather than things the camera should
   * draw — but the cost of staying off the display list is that
   * `Scene.shutdown` never sees them, and so never destroys them. Every level
   * transition is a `scene.restart()` that constructs a fresh `Lighting`, so
   * without this each swap orphaned one stamp per light source (49 of them on
   * `main1`) plus the cone and the player's pool, for the life of the session.
   *
   * `rt` and `shadowGfx` *are* on the display list and would be collected
   * anyway; destroying them here too keeps the ownership in one place rather
   * than split between this class and Phaser's bookkeeping.
   */
  destroy(): void {
    for (const light of this.lights) light.stamp.destroy();
    this.lights.length = 0;
    this.eraseList.length = 0;
    this.coneStamp.destroy();
    this.playerStamp.destroy();
    this.rt.destroy();
    // The twin first: it borrows `shadowGfx`'s command buffer, so drop the
    // borrower before the owner.
    this.shadowMaskGfx.destroy();
    this.shadowGfx.destroy();
  }

  /**
   * Which walk surface sight is cast against — see `src/map/planes.ts`.
   *
   * Changing it invalidates the polygon outright: the deck and the floor beneath
   * it occlude completely differently, so there is nothing to reuse.
   */
  setPlane(plane: number): void {
    if (plane === this.plane) return;
    this.plane = plane;
    this.dirty = true;
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

  /**
   * Powers every fixture whose tile-def ref is `ref` on or off — a breaker throw.
   *
   * Matching on the ref is the whole mechanic: `light_overhead1` is one tile def
   * placed fifty times across main1, so `main1`'s single breaker takes the deck's
   * entire overhead lighting with it. See `src/systems/PowerGrid.ts`.
   *
   * Cheap despite the count. The stamps are erased in one batched call and the
   * texture is only recomposited when {@link dirty}, so fifty lights going out is
   * one rebuild of the list plus one redraw — not fifty of anything.
   */
  setCircuit(ref: string, on: boolean): void {
    let changed = false;
    for (const light of this.lights) {
      if (light.ref !== ref || light.powered === on) continue;
      light.powered = on;
      changed = true;
    }
    if (!changed) return;
    this.refreshPoweredLights();
    this.dirty = true;
  }

  /**
   * Refills {@link eraseList}'s fixture prefix from the lights that have power.
   *
   * `hasFlicker` is recomputed here rather than at construction because a dead
   * circuit should also stop forcing a recomposite every frame: the flicker
   * lights on it are no longer guttering, they are off.
   */
  private refreshPoweredLights(): void {
    this.eraseList.length = 0;
    let flicker = false;
    for (const light of this.lights) {
      // Zero intensity is also what takes a dead light out of `sampleLight`, and
      // with it out of every ground shadow — `sampleLightAt` drops a light whose
      // contribution is <= 0. A lamp that is off must not still be casting.
      light.intensity = light.powered ? 1 : 0;
      if (!light.powered) continue;
      this.eraseList.push(light.stamp);
      if (light.flicker) flicker = true;
    }
    this.lightCount = this.eraseList.length;
    this.hasFlicker = flicker;
  }

  /** Recomposites the darkness and the light carved out of it. */
  private drawLights(viewer: { x: number; y: number }, beam: FlashlightBeam | null): void {
    this.rt.clear();
    this.rt.fill(DARK_COLOR, DARK_ALPHA);

    for (const l of this.lights) {
      if (!l.flicker || !l.powered) continue;
      // Gentle irregular pulse in both brightness and reach.
      const f =
        0.82 + 0.18 * Math.sin(this.time * 7 + l.phase) * Math.sin(this.time * 3.1 + l.phase);
      l.intensity = f;
      l.stamp.setAlpha(f).setScale(((l.radiusPx * 2) / RADIAL_STAMP_SIZE) * (0.92 + 0.08 * f));
    }

    // Everything in one batched erase — each erase is a framebuffer round-trip, and
    // doing them one stamp at a time is what made this unaffordable.
    const list = this.eraseList;
    list.push(this.playerStamp.setPosition(viewer.x, viewer.y));
    // The flashlight: a forward-facing bright cone carved into the dark. Snapped
    // like the halo and the fan — it is emitted from the same eye, and a cone that
    // slides while they step would just move the disagreement somewhere else.
    if (beam) {
      const at = snapToPixel(beam.x, beam.y);
      list.push(this.coneStamp.setPosition(at.x, at.y).setRotation(beam.facing));
    }
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
      this.plane,
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
    return len(dx, dy) + this.tileSize;
  }

  /**
   * The flashlight-cone stamp: a sector with its apex at the left edge (local origin)
   * opening toward +x, so the caller can pivot it at the player and point it along
   * their facing. Falls off both *along* the beam and *across* it — the second is what
   * keeps the cone's sides from being a hard step.
   */
  private static ensureConeTexture(scene: Phaser.Scene): void {
    const apexY = CONE_SIZE / 2;
    ensureStampTexture(scene, "flashlight-cone", CONE_SIZE, (x, y) => {
      const dx = x;
      const dy = y - apexY;
      const reach = falloff(len(dx, dy) / CONE_SIZE, CONE_RANGE_CORE);
      if (reach <= 0) return 0;
      const offAxis = Math.atan2(Math.abs(dy), dx);
      return reach * falloff(offAxis / CONE_HALF_ANGLE, CONE_ANGLE_CORE);
    });
  }
}
