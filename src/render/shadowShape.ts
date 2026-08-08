import type { SpriteCollider } from "../entities/generated/playerCollider";

/**
 * Sizing a character's ground shadow off the art it belongs to.
 *
 * Separate from the layer that draws it (`src/ui/EntityShadows.ts`) for two reasons: the
 * arithmetic is worth testing without standing up a Phaser scene, and the entities need
 * to call it from their constructors — an `src/entities/` module reaching into a UI
 * overlay to size its own sprite would have the dependency the wrong way round.
 */

/** The floor footprint a caster puts down, in px. Fixed at construction. */
export interface ShadowShape {
  /** Half-width of the shadow. */
  radiusPx: number;
  /** Distance below the sprite's `y` to the bottom of its silhouette — where the feet are. */
  footOffsetPx: number;
}

/**
 * How much wider than the traced silhouette a shadow sits.
 *
 * The trace is a tight box around the *whole* body, which for a standing figure is
 * already shoulder width rather than foot width — so this is a small nudge, not a
 * licence. It exists mostly for the orderly, whose idle pose traces 17px against the
 * player's 27 and reads as a stripe on the floor without it.
 *
 * The ceiling on it is the drone. `duct1` is built entirely from one-tile crawlways, and
 * the drone's splayed chassis traces nearly as wide as the duct it walks down — at 1.35
 * its shadow ran 27.7px into a 32px passage and visibly climbed the walls. Exported so
 * the test can hold the whole cast to that bound without restating the number.
 */
export const FOOT_WIDEN = 1.15;

/**
 * Derives a caster's {@link ShadowShape} from its generated alpha silhouette.
 *
 * Every character in the game is drawn at `(tileSize * displayTiles) / sourceSize` on
 * square art, so the collider's own `frameHeight` *is* that source size and the scale can
 * be recovered here rather than passed in — which means one call site per character and
 * no chance of a shadow being sized against a scale its sprite isn't actually using.
 *
 * Taking both numbers off the trace is the same discipline `guardRadiusTiles` follows in
 * `src/entities/GuardSkin.ts`: re-run `npm run gen:colliders` after an art change and the
 * shadows follow the new silhouette without anyone remembering to re-tune them. It also
 * gets the foot offset right for free, which is the part that would otherwise need
 * per-character fiddling — the four sheets pad their frames differently, so the distance
 * from a sprite's centre down to its boots is 10.5px for Rowan and 15px for an enforcer.
 */
export function shadowShapeFor(
  collider: SpriteCollider,
  displayTiles: number,
  tileSize: number,
): ShadowShape {
  const scale = (tileSize * displayTiles) / collider.frameHeight;
  const { width, height, offsetY } = collider.aabb;
  return {
    radiusPx: (width / 2) * scale * FOOT_WIDEN,
    footOffsetPx: (offsetY + height - collider.frameHeight / 2) * scale,
  };
}
