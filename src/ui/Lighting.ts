import Phaser from "phaser";
import type { GameLevel } from "../map/types";
import { lightStatsFor } from "../systems/EntityStats";

/** Size of the generated soft light-pool stamp texture, in px. */
const GRADIENT_SIZE = 128;

/** How dark the unlit level gets (0 = no darkening, 1 = black). */
const DARK_ALPHA = 0.62;

const DARK_COLOR = 0x05070a;

interface Light {
  x: number;
  y: number;
  radiusPx: number;
  flicker: boolean;
  phase: number;
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
  private readonly lights: Light[] = [];
  private readonly hasFlicker: boolean;
  private time = 0;

  constructor(scene: Phaser.Scene, level: GameLevel, tileSize: number) {
    const worldW = level.width * tileSize;
    const worldH = level.height * tileSize;

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
    this.stamp = scene.make.image({ key: "light-gradient", add: false }).setOrigin(0.5);

    this.rt = scene.add
      .renderTexture(0, 0, worldW, worldH)
      .setOrigin(0, 0)
      .setDepth(350);

    this.draw();
  }

  update(dt: number): void {
    if (!this.hasFlicker) return; // static scene — the one-time draw stands.
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
}
