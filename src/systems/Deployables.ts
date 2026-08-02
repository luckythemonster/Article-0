/**
 * Things the player leaves on the floor, and how the AI senses them.
 *
 * Every other consumable in the game resolves the instant it is spent — a burst, a
 * buff, a dart. A *deployable* is the other shape: it becomes an object in the world
 * with a sensor signature of its own, and the interesting behaviour belongs to
 * whoever notices it rather than to the player who dropped it.
 *
 * This module is the sensor half of that, kept apart from both the item that spawns
 * one ({@link DeployedItem}) and the AI that reacts ({@link Orderly}) so a second
 * deployable needs one {@link LURE_SPECS} entry and nothing else. Pure — no Phaser,
 * no allocation per call — so it unit-tests like the rest of `src/systems`.
 */

import {
  SACK_LUNCH_SCENT_TILES,
  SACK_LUNCH_SIGHT_TILES,
  SANITATION_SECONDS,
} from "./EntityStats";

/** Which deployable a lure is. One entry today; the point is that it is a list. */
export type DeployableKind = "sackLunch";

/**
 * A deployed object as the AI sees it: where it is, what it is, and whether it has
 * already been dealt with.
 *
 * Declared structurally rather than as a class so the Phaser-side {@link DeployedItem}
 * satisfies it by shape and a test can hand these functions plain objects — the same
 * arrangement {@link SensingWorld} uses for the guard context.
 */
export interface DeployedLure {
  readonly kind: DeployableKind;
  /** Pixel-space position. */
  readonly x: number;
  readonly y: number;
  /** True once serviced (or otherwise removed); a spent lure attracts nobody. */
  readonly spent: boolean;
  /**
   * Finish with it: the responder has done whatever the item asked of it. Part of
   * the contract rather than the scene's business, because the AI that services a
   * lure is the only thing that knows when it is done — and must be idempotent,
   * since two responders can finish on the same frame.
   */
  consume(): void;
}

/** How one kind of deployable reads to the AI, and what servicing it costs. */
export interface LureSpec {
  /** Reach (tiles) at which it is noticed with a clear line of sight. */
  sightTiles: number;
  /** Shorter reach (tiles) at which it is noticed *through* walls, by smell. */
  scentTiles: number;
  /** Seconds of servicing before it is destroyed. */
  serviceSeconds: number;
  /** What the responder is doing about it, for the on-screen state readout. */
  label: string;
}

export const LURE_SPECS: Record<DeployableKind, LureSpec> = {
  sackLunch: {
    sightTiles: SACK_LUNCH_SIGHT_TILES,
    scentTiles: SACK_LUNCH_SCENT_TILES,
    serviceSeconds: SANITATION_SECONDS,
    label: "SANITATION",
  },
};

/** The slice of the world {@link noticedLure} reads. Matches the guard context by shape. */
export interface LureWorld {
  tileSize: number;
  grid: { hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean };
}

/**
 * The nearest lure an observer at `(x, y)` notices this frame, or null.
 *
 * Two channels, per the spec's "line of sight or scent/noise radius": the long one
 * needs an unobstructed view, the short one does not need anything at all. Nearest
 * wins across both, so an observer standing between two lunches services the one at
 * its feet rather than the one it happens to have a cleaner view of.
 *
 * `ignore` skips lures this observer has already written off — the scent channel
 * reaches *through* walls, so without it an orderly that gave up on a lunch it
 * cannot walk to would smell the same lunch again on the very next frame and spend
 * the rest of the level pressed against that wall.
 *
 * Distances stay squared throughout — every use is a threshold comparison, and the
 * square root would only be thrown away.
 */
export function noticedLure(
  x: number,
  y: number,
  lures: readonly DeployedLure[],
  world: LureWorld,
  ignore?: (lure: DeployedLure) => boolean,
): DeployedLure | null {
  let best: DeployedLure | null = null;
  let bestDist2 = Infinity;

  for (const lure of lures) {
    if (lure.spent) continue;
    if (ignore?.(lure)) continue;
    const dx = lure.x - x;
    const dy = lure.y - y;
    const dist2 = dx * dx + dy * dy;
    if (dist2 >= bestDist2) continue;

    const spec = LURE_SPECS[lure.kind];
    const scentPx = spec.scentTiles * world.tileSize;
    const sightPx = spec.sightTiles * world.tileSize;
    // Smelled through the wall, or seen across the room — checked in that order
    // because the scent test is free and the line-of-sight walk is not.
    const noticed =
      dist2 <= scentPx * scentPx ||
      (dist2 <= sightPx * sightPx &&
        world.grid.hasLineOfSight(
          x / world.tileSize,
          y / world.tileSize,
          lure.x / world.tileSize,
          lure.y / world.tileSize,
        ));
    if (!noticed) continue;

    best = lure;
    bestDist2 = dist2;
  }

  return best;
}
