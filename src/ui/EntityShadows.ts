import Phaser from "phaser";
import type { Lighting } from "./Lighting";
import type { ShadowShape } from "../render/shadowShape";
import { ensureRadialStamp, RADIAL_STAMP_KEY, RADIAL_STAMP_SIZE } from "../render/stamps";

/**
 * Ground shadows for the cast — the soft patch under a character that says which floor
 * they are standing on.
 *
 * Light-aware rather than a fixed blob pinned to the feet. Every shadow is thrown by the
 * same `light_sources` the darkness overlay draws from (via {@link Lighting.sampleLight}),
 * so walking under a lamp swings the shadow around and out the far side, standing between
 * two shortens it to a dark patch underfoot, and an unlit corridor leaves nothing but the
 * faintest contact smudge. In a game where the lighting is a *mechanic* — where a lit
 * tile is both visibly brighter and measurably more dangerous — a shadow that ignored it
 * would be the one thing on screen contradicting the rule everything else obeys.
 *
 * Structured as a scene-level layer rather than an object each entity owns, which is the
 * same shape {@link Lighting} takes and for the same reasons. The alternative meant
 * threading a `Lighting` through `Player.update`, `Enforcer.update` and `Orderly.update`
 * — three signatures widened so three copies of this arithmetic could each get at it.
 * Here the entities only have to say how big a footprint they put on the floor
 * ({@link ShadowShape}) and where they are, and `GameScene` hands over the list.
 */

/**
 * Where the shadows sit in the depth ladder (documented in full at `src/entities/Vfx.ts`).
 *
 * Clear above the props at 120 and a dropped item's floor stain at 130/131 — a character
 * standing on a spilled sack lunch shadows it — and clear below the vision cones at 400
 * and every body from 440 up. Nothing else occupies the 300s.
 *
 * Note what this depth *does not* need to be: a special case for the player. He renders
 * at 750, above the opaque darkness at 700, which would normally mean a shadow down here
 * blinks out the moment he steps into an unlit room while he stays visible. It doesn't,
 * because he carries a light pool erased out of that darkness and sits at the apex of the
 * visibility polygon — the floor at his feet is lit whatever else is.
 */
export const ENTITY_SHADOW_DEPTH = 300;

/**
 * Faintest a shadow gets, in an unlit room.
 *
 * Deliberately not zero. This is contact, not cast: a body resting on a floor occludes
 * the floor immediately under it regardless of where the light is, and without the smudge
 * an unlit character reads as hovering. It costs nothing for the guards and orderlies —
 * they sit *below* the darkness overlay and vanish into it along with their shadows — and
 * is worth its whole keep for the player, who does not.
 */
const MIN_ALPHA = 0.18;
/** Darkest a shadow gets, in a light's full-strength core. */
const MAX_ALPHA = 0.45;

/**
 * Width of the shadow *across* the light axis, as a fraction of its length along it.
 *
 * The ellipse is built in light space — long axis pointing away from the lamp, short axis
 * across it — and then rotated to match. That ordering is the point: squashing in screen
 * Y and *then* rotating would carry the squash around with the quad, so a lamp to the
 * north would leave a character wearing a tall thin sliver instead of a shadow.
 *
 * At zero directionality the offset and the elongation both fall away and this is all
 * that is left, which is what makes the unlit case land somewhere sensible on its own: a
 * gently flattened round patch under the feet, foreshortened about as much as the
 * characters' own three-quarter drawing implies.
 */
const NARROW = 0.7;

/**
 * How far a shadow slides away from the light, as a fraction of the caster's own radius,
 * at full directionality.
 *
 * Under one radius on purpose. A shadow that detaches from the feet stops reading as
 * belonging to the body and starts reading as a second object on the floor, and at this
 * camera height a real one would not clear the boots anyway.
 */
const STRETCH = 0.9;

/** Extra length along the light axis, on top of the offset, at full strength. */
const ELONGATE = 0.6;

/**
 * Anything that casts one. Satisfied as-is by `Player`, `Enforcer`, `Drone` and `Orderly`,
 * all of which already expose public `x`/`y`.
 */
export interface ShadowCaster {
  readonly x: number;
  readonly y: number;
  readonly shadow: ShadowShape;
}

export class EntityShadows {
  private readonly scene: Phaser.Scene;
  private readonly lighting: Lighting;
  /**
   * Pooled shadow quads, all on the one shared stamp texture so the whole cast's worth
   * batches into a single draw. Grown on demand and never shrunk — the rooftop siege
   * spawns guards mid-level, so the caster count is not fixed, and surplus quads are
   * hidden rather than destroyed so a wave that ends doesn't churn the pool.
   */
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private enabled = true;

  constructor(scene: Phaser.Scene, lighting: Lighting) {
    this.scene = scene;
    this.lighting = lighting;
    // Already built by Lighting, which constructs first — this is here so the layer
    // does not silently depend on that ordering.
    ensureRadialStamp(scene);
  }

  /**
   * Repositions one shadow per caster and hides the rest.
   *
   * Call after the bodies have been moved for the frame, so a shadow never trails the
   * feet it belongs to by a frame.
   */
  update(casters: readonly ShadowCaster[]): void {
    if (!this.enabled) return;

    for (let i = 0; i < casters.length; i++) {
      const c = casters[i];
      const img = this.at(i);
      const { radiusPx, footOffsetPx } = c.shadow;

      // Sampled at the feet, not the sprite's centre. A character is a metre and a half
      // of body between the two, and sampling at the middle would have someone lit by a
      // floor-level lamp cast from a point well past it.
      const footY = c.y + footOffsetPx;
      const { dx, dy, strength, directionality } = this.lighting.sampleLight(c.x, footY);

      // Both the slide and the elongation scale by this, so a caster lit evenly from two
      // sides gets a shadow that is short and centred rather than merely aimed at nothing.
      const lean = directionality * strength;
      const base = (radiusPx * 2) / RADIAL_STAMP_SIZE;
      const slide = radiusPx * STRETCH * lean;

      // The quad is scaled in light space — long on local x, {@link NARROW} on local y —
      // and `setRotation` turns that whole ellipse to point away from the lamp. The slide
      // runs along the same axis, so the shape and the direction it moved always agree.
      // Unlit, `dx`/`dy` are zero: the angle is 0, the slide is 0, and what is left is
      // the flattened contact patch.
      img
        .setVisible(true)
        .setPosition(c.x + dx * slide, footY + dy * slide)
        .setRotation(Math.atan2(dy, dx))
        .setScale(base * (1 + lean * ELONGATE), base * NARROW)
        .setAlpha(MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * strength);
    }

    for (let i = casters.length; i < this.pool.length; i++) this.pool[i].setVisible(false);
  }

  /** Hides the whole layer, tracking the debug darkness toggle. */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    // The next `update` re-shows exactly the ones in use, so switching off only has to
    // clear what is currently on screen.
    if (!on) for (const img of this.pool) img.setVisible(false);
  }

  /**
   * Releases the pool. Call on scene shutdown.
   *
   * These are `scene.add.image`, so they are on the display list and Phaser would
   * reclaim them anyway; doing it here keeps ownership in one place rather than split
   * between this class and Phaser's bookkeeping, which is the same call `Lighting.destroy`
   * makes about its own render texture.
   */
  destroy(): void {
    for (const img of this.pool) img.destroy();
    this.pool.length = 0;
  }

  /** The pooled quad at `i`, minting it on first use. */
  private at(i: number): Phaser.GameObjects.Image {
    let img = this.pool[i];
    if (!img) {
      img = this.scene.add
        .image(0, 0, RADIAL_STAMP_KEY)
        .setOrigin(0.5)
        // The stamp is a white alpha mask; the tint is what makes it a shadow rather
        // than a light. Set once — a tint call per frame is a WebGL round-trip.
        .setTint(0x000000)
        .setDepth(ENTITY_SHADOW_DEPTH);
      this.pool[i] = img;
    }
    return img;
  }
}
