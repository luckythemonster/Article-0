import type { CollisionGrid } from "./CollisionGrid";
import { WallBuffer } from "./CollisionGrid";
import { len } from "./distance";
import type { NoiseLog } from "./NoiseLog";

/** How far the radar reaches, in tiles. */
export const RADAR_RADIUS_TILES = 10;

/**
 * Compass sectors the bezel's noise ticks divide the world into.
 *
 * Eight because the art has eight: `radar_bezel.aseprite` carries one layer per
 * cardinal and ordinal bearing. Changing this means redrawing the ring.
 */
export const NOISE_SECTORS = 8;

/** Radians per sector — the width of one tick's slice of the world. */
const SECTOR_ARC = (Math.PI * 2) / NOISE_SECTORS;

/**
 * How loud each bearing is right now, 0 (silent) to 1 (a source underfoot).
 *
 * Fixed at {@link NOISE_SECTORS} slots rather than growable like
 * {@link WallBuffer}, because the sectors are the art's eight ticks and there
 * can never be a ninth. Refilled each frame and read the same frame; hold one
 * per snapshot rather than minting one.
 *
 * Sector 0 is due east and they run clockwise on screen (+y is south), which is
 * the row order `tools/radar/build_radar_bezel.py` lays the spritesheet out in.
 * The two agree on purpose: a sector index *is* a sheet row, with no lookup
 * table in between to drift.
 */
export class NoiseSectors {
  private readonly levels = new Float32Array(NOISE_SECTORS);

  /** Silences every bearing, keeping the buffer. */
  clear(): void {
    this.levels.fill(0);
  }

  /**
   * Raises `sector` to `loudness` if that is louder than what is already there.
   *
   * Louder wins rather than accumulating: two quiet noises on one bearing are
   * still two quiet noises, and summing them into a red tick would report a
   * threat that is not out there.
   */
  add(sector: number, loudness: number): void {
    if (loudness > this.levels[sector]) this.levels[sector] = loudness;
  }

  /** How loud sector `i` is, 0..1. */
  level(i: number): number {
    return this.levels[i];
  }
}

/**
 * Which sector a world-space offset points into.
 *
 * Rounds to the nearest sector centre rather than flooring into a slice, so a
 * source due north lights the north tick rather than whichever of its
 * neighbours the arc happens to start in.
 */
export function noiseSectorFor(dx: number, dy: number): number {
  const sector = Math.round(Math.atan2(dy, dx) / SECTOR_ARC);
  return ((sector % NOISE_SECTORS) + NOISE_SECTORS) % NOISE_SECTORS;
}

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
  /** How loud each compass bearing is, for the bezel's noise ticks. */
  noise: NoiseSectors;
}

/**
 * Builds one frame's radar data: guard blips and terrain within
 * {@link RADAR_RADIUS_TILES} of the player, in player-relative tile units, the
 * bezel's per-bearing noise levels, and a jammed flag. Pure — never touches
 * Phaser — so it's cheap to call every frame and easy to unit-check.
 *
 * Soliton-radar homage: during ALERT the signal is jammed (mirrors classic
 * Metal Gear radio jamming), so you lose the safety net exactly when guards
 * are actively hunting and have to rely on line of sight instead.
 *
 * `nowSec` shares the {@link NoiseLog}'s clock — seconds since boot, which is
 * what `NoiseWorld.now()` hands `emitAt` when it records.
 */
export function buildRadarSnapshot(
  grid: CollisionGrid,
  tileSize: number,
  player: { x: number; y: number; facing: number },
  mobile: readonly RadarUnit[],
  fixed: readonly RadarUnit[],
  jammed: boolean,
  noiseLog: NoiseLog,
  nowSec: number,
  into: RadarSnapshot = emptyRadarSnapshot(),
): RadarSnapshot {
  into.facing = player.facing;
  into.jammed = jammed;
  into.blips.length = 0;
  into.walls.clear();
  into.noise.clear();
  if (jammed) return into;

  const ptx = player.x / tileSize;
  const pty = player.y / tileSize;
  const r2 = RADAR_RADIUS_TILES * RADAR_RADIUS_TILES;

  let n = addBlips(mobile, into.blips, 0, ptx, pty, tileSize, r2);
  addBlips(fixed, into.blips, n, ptx, pty, tileSize, r2);

  grid.wallsNear(ptx, pty, RADAR_RADIUS_TILES, into.walls);
  addNoise(noiseLog, into.noise, player.x, player.y, nowSec);
  return into;
}

/**
 * Fills `sectors` from the emissions the player can currently hear.
 *
 * **The player is a listener on the same terms as a guard.** `NoiseEvents.emitAt`
 * gives each guard `1 - d / radiusPx` and ignores anyone at or past the radius;
 * this reuses that formula exactly, so what the ring reports is what a guard
 * standing in Rowan's shoes would have heard. A source out of earshot lights
 * nothing — not because it is filtered out, but because it genuinely made no
 * sound here.
 *
 * Age is not folded into the level. An emission is either still readable or it
 * is gone, which {@link NoiseLog.forEach} decides; a tick that holds its colour
 * and then drops reads as an event, where one fading down the ramp would read
 * as a source walking away.
 */
function addNoise(
  log: NoiseLog,
  sectors: NoiseSectors,
  px: number,
  py: number,
  nowSec: number,
): void {
  log.forEach(nowSec, (nx, ny, radiusPx) => {
    const dx = nx - px;
    const dy = ny - py;
    const d = len(dx, dy);
    if (d >= radiusPx) return;
    sectors.add(noiseSectorFor(dx, dy), 1 - d / radiusPx);
  });
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
  return {
    facing: 0,
    jammed: false,
    blips: [],
    walls: new WallBuffer(),
    noise: new NoiseSectors(),
  };
}
