import type { CollisionGrid } from "./CollisionGrid";

/** How far the radar reaches, in tiles. */
export const RADAR_RADIUS_TILES = 10;

/** A guard blip, player-relative, in tile units. */
export interface RadarBlip {
  dx: number;
  dy: number;
  facing: number;
  /** True once the guard is past the "spotted" threshold — draws hot/red. */
  alerted: boolean;
}

/** Everything the radar UI needs to draw one frame, in screen-agnostic units. */
export interface RadarSnapshot {
  /** Player facing angle, radians (world convention: 0 = east, +y = south). */
  facing: number;
  /** True during ALERT — the signal is jammed and nothing else is populated. */
  jammed: boolean;
  blips: RadarBlip[];
  /** Nearby blocked-tile offsets, player-relative, in tile units. */
  walls: { dx: number; dy: number }[];
}

/**
 * Builds one frame's radar data: guard blips and terrain within
 * {@link RADAR_RADIUS_TILES} of the player, in player-relative tile units, plus
 * a jammed flag. Pure — never touches Phaser — so it's cheap to call every
 * frame and easy to unit-check.
 *
 * Soliton-radar homage: during ALERT the signal is jammed (mirrors classic
 * Metal Gear radio jamming), so you lose the safety net exactly when guards
 * are actively hunting and have to rely on line of sight instead.
 */
export function buildRadarSnapshot(
  grid: CollisionGrid,
  tileSize: number,
  player: { x: number; y: number; facing: number },
  guards: { position: { x: number; y: number }; facing: number; detection: number }[],
  jammed: boolean,
): RadarSnapshot {
  if (jammed) {
    return { facing: player.facing, jammed: true, blips: [], walls: [] };
  }

  const ptx = player.x / tileSize;
  const pty = player.y / tileSize;
  const r2 = RADAR_RADIUS_TILES * RADAR_RADIUS_TILES;

  const blips: RadarBlip[] = [];
  for (const g of guards) {
    const dx = g.position.x / tileSize - ptx;
    const dy = g.position.y / tileSize - pty;
    if (dx * dx + dy * dy > r2) continue;
    blips.push({ dx, dy, facing: g.facing, alerted: g.detection > 0.66 });
  }

  const walls = grid.wallsNear(ptx, pty, RADAR_RADIUS_TILES);

  return { facing: player.facing, jammed: false, blips, walls };
}
