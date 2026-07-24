import Phaser from "phaser";
import type { GameLevel } from "../map/types";
import { lightStatsFor } from "../systems/EntityStats";

/** Size of the generated soft light-pool stamp texture, in px. */
const GRADIENT_SIZE = 128;

/** How dark the unlit level gets (0 = no darkening, 1 = black). */
const DARK_ALPHA = 0.62;

const DARK_COLOR = 0x05070a;

/** Size (px) of the generated flashlight-cone stamp texture. */
const CONE_SIZE = 256;
/** Half-angle of the flashlight cone, in radians (~30° each side). */
const CONE_HALF_ANGLE = Math.PI / 6;
/** Reach of the flashlight cone, in tiles. */
const CONE_RANGE_TILES = 5.5;

interface Light {
  x: number;
  y: number;
  radiusPx: number;
  flicker: boolean;
  phase: number;
}

/** The player's flashlight beam, or null when it isn't emitting. */
export interface FlashlightBeam {
  x: number;
  y: number;
  /** Facing angle in radians. */
  facing: number;
}

/**
 * Visible dynamic lighting: darkens the whole level and punches soft, bright
 * pools out of the darkness at each `light_source`. Purely presentational — it
 * reads the *same* `light_sources` data the {@link DetectionSystem} uses (via
 * `lightStatsFor`), so a lit spot is both visibly brighter and mechanically
 * easier to be seen in.
 *
 * Implementation: a level-sized `RenderTexture` filled dark, with a soft
 * radial-gradient stamp `erase`d at each light (erasing subtracts darkness →
 * light). Static lights draw once; flickering lights pulse, so the texture is
 * only redrawn when at least one flickering light is present.
 */
export class Lighting {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly stamp: Phaser.GameObjects.Image;
  private readonly coneStamp: Phaser.GameObjects.Image;
  private readonly beamRangePx: number;
  private readonly lights: Light[] = [];
  private readonly hasFlicker: boolean;
  private time = 0;
  /** The active flashlight beam this frame, or null. */
  private beam: FlashlightBeam | null = null;
  /** Whether the beam was drawn last frame — so turning it off triggers a clear. */
  private lastBeamOn = false;

  constructor(scene: Phaser.Scene, level: GameLevel, tileSize: number) {
    const worldW = level.width * tileSize;
    const worldH = level.height * tileSize;
    this.beamRangePx = CONE_RANGE_TILES * tileSize;

    const lightLayer = level.layers.find((l) => l.name === "light_sources");
    if (lightLayer) {
      for (const t of lightLayer.tiles) {
        const s = lightStatsFor(t.components);
        this.lights.push({
          x: (t.x + 0.5) * tileSize,
          y: (t.y + 0.5) * tileSize,
          radiusPx: s.radius * tileSize,
          flicker: s.type.includes("flick"),
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    this.hasFlicker = this.lights.some((l) => l.flicker);

    Lighting.ensureGradientTexture(scene);
    Lighting.ensureConeTexture(scene);
    this.stamp = scene.make.image({ key: "light-gradient", add: false }).setOrigin(0.5);
    // Apex-anchored so rotation pivots at the player and the cone opens forward.
    this.coneStamp = scene.make.image({ key: "flashlight-cone", add: false }).setOrigin(0, 0.5);

    this.rt = scene.add
      .renderTexture(0, 0, worldW, worldH)
      .setOrigin(0, 0)
      .setDepth(350);

    this.draw();
  }

  /**
   * @param beam the player's flashlight beam, or null when it isn't emitting.
   */
  update(dt: number, beam: FlashlightBeam | null = null): void {
    this.beam = beam;
    const beamOn = beam !== null;
    // Redraw when a flickering light animates, the beam is on, or the beam just
    // turned off (one final frame to clear the cone). Otherwise the static draw
    // stands and we skip the reflow.
    const needRedraw = this.hasFlicker || beamOn || this.lastBeamOn;
    this.lastBeamOn = beamOn;
    if (!needRedraw) return;
    this.time += dt;
    this.draw();
  }

  private draw(): void {
    this.rt.clear();
    this.rt.fill(DARK_COLOR, DARK_ALPHA);
    for (const l of this.lights) {
      let scale = (l.radiusPx * 2) / GRADIENT_SIZE;
      let alpha = 1;
      if (l.flicker) {
        // Gentle irregular pulse in both brightness and reach.
        const f = 0.82 + 0.18 * Math.sin(this.time * 7 + l.phase) * Math.sin(this.time * 3.1 + l.phase);
        alpha = f;
        scale *= 0.92 + 0.08 * f;
      }
      this.stamp.setPosition(l.x, l.y).setScale(scale).setAlpha(alpha);
      this.rt.erase(this.stamp);
    }
    // The player's flashlight: a forward-facing bright cone carved into the dark.
    if (this.beam) {
      this.coneStamp
        .setPosition(this.beam.x, this.beam.y)
        .setRotation(this.beam.facing)
        .setScale(this.beamRangePx / CONE_SIZE)
        .setAlpha(1);
      this.rt.erase(this.coneStamp);
    }
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
