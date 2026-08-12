/**
 * The eight sprite directions, and the one place anything snaps a heading to
 * them.
 *
 * Every character sheet in the game — the player, the enforcer, the drone, the
 * orderly — was exported at the same eight facings, which is what lets movement
 * and vision stay continuous while the art stays discrete. Both the player's
 * animation module and the guards' skin module used to carry their own copy of
 * this list *and* their own copy of the angular table used to snap into it, in
 * the same order, with the same contents. They were never allowed to disagree;
 * now they can't.
 *
 * Pure — no Phaser — so `src/systems`-style tests can reach it.
 */

/**
 * The eight directions in **export order**, matching how the sheets are laid
 * out on disk. Iteration order for preloading; not an angular sequence.
 */
export const DIRS_8 = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const;

export type Dir8 = (typeof DIRS_8)[number];

/** The same eight in angular order, starting at east (0°) going clockwise. */
const BY_ANGLE: Dir8[] = [
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
  "north",
  "north-east",
];

/** Snaps a facing angle (radians, 0 = east, +y = south) to the nearest of the 8. */
export function nearestDirection(angle: number): Dir8 {
  const angleDeg = (angle * 180) / Math.PI;
  const normalized = ((angleDeg % 360) + 360) % 360;
  return BY_ANGLE[Math.round(normalized / 45) % 8];
}

/** {@link nearestDirection} for callers holding a movement vector, not an angle. */
export function directionOf(dx: number, dy: number): Dir8 {
  return nearestDirection(Math.atan2(dy, dx));
}

/**
 * The heading a direction names, in radians (0 = east, +y = south).
 *
 * The inverse of {@link nearestDirection}, and the reason it belongs here
 * rather than next to its caller: the two tables have to agree, and this file
 * exists so they cannot drift. `CastArt` draws each character eight times, once
 * per facing, and needs the angle to place the figure's front.
 */
export function angleOf(dir: Dir8): number {
  return (BY_ANGLE.indexOf(dir) * Math.PI) / 4;
}
