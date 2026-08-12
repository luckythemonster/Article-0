/**
 * The box a character occupies, in its own art's unscaled pixel space.
 *
 * This is the contract between what a character *looks like* and what it
 * *collides with*. Three things read it: the player's Arcade body
 * (`Player`), a guard's collision radius (`guardRadiusTiles` in `GuardSkin`),
 * and every character's ground shadow (`shadowShapeFor` in
 * `src/render/shadowShape.ts`).
 *
 * ### It used to be derived; now it is the definition
 *
 * These numbers were traced out of PixelLab-generated PNGs by a collider
 * generator, which read each sprite's alpha silhouette and emitted a module
 * under `src/entities/generated/`. The art is gone and the cast is drawn
 * procedurally now (see `CastArt.ts`), so the relationship inverts: the box is
 * no longer measured from a picture, it is the thing the picture is drawn to
 * fill. That is simpler than what it replaces — there is one number for "how
 * big is an enforcer" instead of a PNG, a tracer and a generated file that had
 * to be kept in step with each other.
 *
 * The values are the traced ones, carried over unchanged and on purpose: they
 * are what the guard radii, the player's body and the shadow widths were all
 * tuned against, so keeping them means the pixels changed and nothing else did.
 */

/** A character's silhouette box, in unscaled source pixels. */
export interface Silhouette {
  /** Size of the (square) frame the box sits in. */
  readonly frameWidth: number;
  readonly frameHeight: number;
  /**
   * Tight-fit box around the body. `width`/`height` feed Arcade's
   * `body.setSize`, `offsetX`/`offsetY` its `body.setOffset` — so this is
   * measured from the frame's top-left, not its centre.
   */
  readonly aabb: {
    readonly width: number;
    readonly height: number;
    readonly offsetX: number;
    readonly offsetY: number;
  };
}

/**
 * Rowan. Narrow — 13px of body in a 36px frame — which is what keeps the player
 * able to slip through the one-tile gaps `duct1` is built out of.
 */
export const PLAYER_SILHOUETTE: Silhouette = {
  frameWidth: 36,
  frameHeight: 36,
  aabb: { width: 13, height: 25, offsetX: 11, offsetY: 6 },
};

/**
 * The enforcer: the widest thing that walks, and the reason
 * `MAX_GUARD_RADIUS_TILES` exists. 46px at 1.125 display tiles works out to a
 * 0.36-tile radius, just inside the half-tile a one-tile corridor allows.
 */
export const ENFORCER_SILHOUETTE: Silhouette = {
  frameWidth: 72,
  frameHeight: 72,
  aabb: { width: 46, height: 62, offsetX: 12, offsetY: 4 },
};

/**
 * The drone: squat and splayed, wider relative to its frame than anything else
 * (41 of 48), but on a small enough display size to still clear the ducts.
 */
export const DRONE_SILHOUETTE: Silhouette = {
  frameWidth: 48,
  frameHeight: 48,
  aabb: { width: 41, height: 35, offsetX: 3, offsetY: 5 },
};

/**
 * The orderly: a thin standing figure on a generously padded frame — 17px of
 * body in 96. `FOOT_WIDEN` in `shadowShape.ts` exists mostly for this one,
 * whose shadow reads as a stripe without it.
 */
export const ORDERLY_SILHOUETTE: Silhouette = {
  frameWidth: 96,
  frameHeight: 96,
  aabb: { width: 17, height: 47, offsetX: 38, offsetY: 23 },
};
