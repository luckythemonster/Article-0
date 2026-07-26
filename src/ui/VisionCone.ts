import type Phaser from "phaser";
import type { CollisionGrid } from "../systems/CollisionGrid";
import { rayDistance } from "../systems/Visibility";

/**
 * Draws a wall-clipped vision cone as a fan of rays — the yellow wedge in front
 * of a guard, the cyan one in front of a security camera.
 *
 * `Enforcer` and `Sensor` each used to carry their own copy of this fan plus its
 * own `castRay`, identical but for the fill colour. Worse, both marched the ray
 * in fixed `tileSize / 4` steps: four grid lookups for every tile crossed, and
 * a hit distance quantised to quarter-tiles, which made the cone's edge visibly
 * stair-step along a wall. {@link rayDistance} — already in the codebase, driving
 * the darkness overlay — is an exact Amanatides–Woo walk that takes one step per
 * boundary crossing instead. It is both cheaper and sharper.
 *
 * The cone stops flush at the wall face (`reveal` of 0). The darkness overlay
 * deliberately carries half a tile *into* the wall so the near face lights up;
 * a cone that did the same would read as leaking through.
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

/** The guards' yellow sweep. */
export const GUARD_CONE: ConeStyle = {
  color: 0xffe14d,
  alpha: 0.14,
  hotColor: 0xff3b3b,
  hotAlpha: 0.28,
};

/** The security cameras' cyan sweep. */
export const CAMERA_CONE: ConeStyle = {
  color: 0x4fd8ff,
  alpha: 0.14,
  hotColor: 0xff3b3b,
  hotAlpha: 0.28,
};

/**
 * Clears `gfx` and fills one cone into it.
 *
 * @param facing cone axis in radians.
 * @param coneDegrees full cone width, in degrees (the map's authoring unit).
 * @param rangeTiles cone reach, in tiles.
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
  const half = (coneDegrees * Math.PI) / 360; // half of coneDegrees, in radians
  const originX = x / tileSize;
  const originY = y / tileSize;

  const hot = detection > CONE_HOT_THRESHOLD;
  gfx.clear();
  gfx.fillStyle(hot ? style.hotColor : style.color, hot ? style.hotAlpha : style.alpha);
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
