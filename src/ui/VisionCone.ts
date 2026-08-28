import type Phaser from "phaser";
import type { CollisionGrid } from "../systems/CollisionGrid";
import { rayDistance } from "../systems/Visibility";
import { UI, hex } from "./hudTheme";

/**
 * Traces a wall-clipped cone as a fan of rays.
 *
 * This used to be the guards' yellow wedge and the cameras' cyan one as well.
 * Those are gone from the world — see `docs/DESIGN_NOTES.md` — because a drawn
 * cone hands the player the two things a stealth game is supposed to withhold:
 * where a guard is (the wedge spills through a doorway and announces somebody
 * the player has no sight of) and exactly where the safe line runs. It was also
 * quietly lying, drawing at full strength while {@link canSense} was already
 * short-circuiting on compliance, concealment or a plane mismatch, and never
 * drawing the 360° thermal sense at all.
 *
 * What remains here has two callers, and both are cones you are *meant* to see:
 * the rooftop searchlights, which are literal lamps, and the developer overlay,
 * which draws the real sensing geometry for tuning.
 *
 * Rays are marched by {@link rayDistance} — an exact Amanatides–Woo walk that
 * takes one step per boundary crossing. The cone stops flush at the wall face
 * (`reveal` of 0). The darkness overlay deliberately carries half a tile *into*
 * the wall so the near face lights up; a cone that did the same would read as
 * leaking through.
 */

/** Rays per cone. More is smoother, and each one is a grid walk. */
export const CONE_RAYS = 24;

/** Detection above which a cone switches to its "hot" colour. */
export const CONE_HOT_THRESHOLD = 0.66;

export interface ConeStyle {
  /** Fill while the cone is idle. */
  color: number;
  alpha: number;
  /** Fill once detection passes {@link CONE_HOT_THRESHOLD}. */
  hotColor: number;
  hotAlpha: number;
}

/** The guards' sweep, as the debug overlay draws it. */
export const GUARD_CONE: ConeStyle = {
  color: hex(UI.amberBright),
  alpha: 0.14,
  hotColor: hex(UI.redDeep),
  hotAlpha: 0.28,
};

/** The security cameras' sweep, as the debug overlay draws it. */
export const CAMERA_CONE: ConeStyle = {
  color: hex(UI.cyan),
  alpha: 0.14,
  hotColor: hex(UI.redDeep),
  hotAlpha: 0.28,
};

/**
 * Fills one cone into `gfx` using whatever fill style is already set, without
 * clearing it.
 *
 * Split out from {@link drawVisionCone} so the debug overlay can batch every
 * guard's and camera's cone into its one shared Graphics — that layer also
 * carries blocked tiles, collider bounds and navigation, so it cannot afford a
 * `clear()` per cone.
 *
 * @param facing cone axis in radians.
 * @param coneDegrees full cone width, in degrees (the map's authoring unit).
 * @param rangeTiles cone reach, in tiles.
 */
export function traceCone(
  gfx: Phaser.GameObjects.Graphics,
  grid: CollisionGrid,
  x: number,
  y: number,
  facing: number,
  coneDegrees: number,
  rangeTiles: number,
  tileSize: number,
  rays: number = CONE_RAYS,
): void {
  const half = (coneDegrees * Math.PI) / 360; // half of coneDegrees, in radians
  const originX = x / tileSize;
  const originY = y / tileSize;

  gfx.beginPath();
  gfx.moveTo(x, y);
  for (let i = 0; i <= rays; i++) {
    const a = facing - half + (2 * half * i) / rays;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const hitPx = rayDistance(grid, originX, originY, cos, sin, rangeTiles, 0) * tileSize;
    gfx.lineTo(x + cos * hitPx, y + sin * hitPx);
  }
  gfx.closePath();
  gfx.fillPath();
}

/**
 * Clears `gfx` and fills one cone into it, picking the idle or hot fill.
 *
 * For a caller that owns a Graphics per cone — which is the searchlights, one
 * per lamp. Anything drawing several cones into a shared layer wants
 * {@link traceCone} instead.
 *
 * @param detection 0..1, picks the idle or hot fill.
 */
export function drawVisionCone(
  gfx: Phaser.GameObjects.Graphics,
  grid: CollisionGrid,
  x: number,
  y: number,
  facing: number,
  coneDegrees: number,
  rangeTiles: number,
  tileSize: number,
  detection: number,
  style: ConeStyle,
  rays: number = CONE_RAYS,
): void {
  const hot = detection > CONE_HOT_THRESHOLD;
  gfx.clear();
  gfx.fillStyle(hot ? style.hotColor : style.color, hot ? style.hotAlpha : style.alpha);
  traceCone(gfx, grid, x, y, facing, coneDegrees, rangeTiles, tileSize, rays);
}
