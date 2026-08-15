/**
 * Where each walk surface sits in the render stack.
 *
 * The world stack runs 0–600 (baked art at 0, fixtures 120, ground shadows 300,
 * cones 400, bodies 440–456, markers 600), the darkness sits at 700/701, the
 * remembered layer at 702/703, and the player at 750 — deliberately above the
 * darkness, so he never vanishes with an unlit room.
 *
 * Two full world stacks do not fit under 700, and the numbers above are bare
 * literals in twenty-odd files. So rather than renumber everything, the **top**
 * walk surface keeps today's depths and lower ones are pushed *down* by a
 * stride. A single-plane level therefore gets an offset of exactly zero and
 * renders byte-identically to before planes existed, which is seven of the nine
 * shipped levels and every level any earlier map ever had.
 *
 * On a two-plane level that puts the floor's art at −700 and its entities at
 * −580…−100, all of it below the deck's art at 0 — which is the point: the deck
 * is over the floor, so it draws over it.
 */

/** Depth span reserved for one walk surface. */
export const PLANE_DEPTH_STRIDE = 700;

/**
 * How much to shift everything belonging to `plane`, given how many planes the
 * level has. The topmost plane returns 0.
 */
export function planeDepthOffset(plane: number, planeCount: number): number {
  return (plane - (planeCount - 1)) * PLANE_DEPTH_STRIDE;
}

/**
 * The canopy: roof art the player passes under.
 *
 * Above every world entity (600) so it occludes what is beneath it, and below
 * the darkness (700) so an unexplored roof stays dark like everything else.
 * The player is above the darkness anyway, so he is never lost under it.
 */
export const CANOPY_DEPTH = 650;

/**
 * How far a canopy — or the deck the player is standing *under* — fades when he
 * is beneath it, so the surface he is actually on stays readable.
 */
export const UNDER_ALPHA = 0.25;
