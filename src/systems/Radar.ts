import type { CollisionGrid } from "./CollisionGrid";
import { WallBuffer } from "./CollisionGrid";

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

/** Anything the radar can plot: a guard or a camera. */
export interface RadarUnit {
  x: number;
  y: number;
  facing: number;
  detection: number;
}

/**
 * Everything the radar UI needs to draw one frame, in screen-agnostic units.
 *
 * Rebuilt every frame, so its arrays are **reused buffers owned by the
 * snapshot**, not fresh ones: read them during the frame you were handed them
 * and do not retain them. Terrain within radar reach runs to a few hundred
 * points, and minting a `{dx, dy}` for each of them sixty times a second was
 * the largest single source of garbage in the frame.
 */
export interface RadarSnapshot {
  /** Player facing angle, radians (world convention: 0 = east, +y = south). */
  facing: number;
  /** True during ALERT — the signal is jammed and nothing else is populated. */
  jammed: boolean;
  blips: RadarBlip[];
  /** Blocked-tile offsets near the player, player-relative, in tiles. */
  walls: WallBuffer;
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
  mobile: readonly RadarUnit[],
  fixed: readonly RadarUnit[],
  jammed: boolean,
  into: RadarSnapshot = emptyRadarSnapshot(),
): RadarSnapshot {
  into.facing = player.facing;
  into.jammed = jammed;
  into.blips.length = 0;
  into.walls.clear();
  if (jammed) return into;

  const ptx = player.x / tileSize;
  const pty = player.y / tileSize;
  const r2 = RADAR_RADIUS_TILES * RADAR_RADIUS_TILES;

  let n = addBlips(mobile, into.blips, 0, ptx, pty, tileSize, r2);
  addBlips(fixed, into.blips, n, ptx, pty, tileSize, r2);

  grid.wallsNear(ptx, pty, RADAR_RADIUS_TILES, into.walls);
  return into;
}

/** Recycled blip objects; a snapshot's `blips` holds references into this. */
const blipPool: RadarBlip[] = [];

/**
 * Appends the units within radar reach to `out`, recycling pool entries from
 * `start` onward, and returns the next free pool index.
 *
 * A module-level function rather than a closure over the caller's locals, so
 * calling it twice a frame costs nothing.
 */
function addBlips(
  units: readonly RadarUnit[],
  out: RadarBlip[],
  start: number,
  ptx: number,
  pty: number,
  tileSize: number,
  r2: number,
): number {
  let n = start;
  for (const u of units) {
    const dx = u.x / tileSize - ptx;
    const dy = u.y / tileSize - pty;
    if (dx * dx + dy * dy > r2) continue;
    const slot = blipPool[n] ?? (blipPool[n] = { dx: 0, dy: 0, facing: 0, alerted: false });
    slot.dx = dx;
    slot.dy = dy;
    slot.facing = u.facing;
    slot.alerted = u.detection > 0.66;
    out.push(slot);
    n++;
  }
  return n;
}

/** A blank snapshot to fill — hold one per scene and pass it back in each frame. */
export function emptyRadarSnapshot(): RadarSnapshot {
  return { facing: 0, jammed: false, blips: [], walls: new WallBuffer() };
}
