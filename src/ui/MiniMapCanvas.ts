import type { MapSnapshot } from "../systems/PauseState";

/**
 * The pause menu's level map.
 *
 * Draws the current level as a tile grid into a `<canvas>`, masked by what the
 * player has actually seen: unexplored tiles are left at the panel background, so
 * the map fills in as a record of the route rather than handing over the floor
 * plan. Walls read as structure, the exits are called out in amber, and Rowan is
 * a cyan pip.
 *
 * Pure 2D canvas — no Phaser. The palette is pulled from the same `theme.css`
 * custom properties the rest of the overlay UI uses, because a canvas can't
 * reference them itself and a second hardcoded palette would be one to drift.
 */

interface Palette {
  wall: string;
  floor: string;
  exit: string;
  player: string;
}

/** Reads a `theme.css` token, falling back if the stylesheet hasn't applied. */
function token(name: string, fallback: string): string {
  if (typeof getComputedStyle !== "function") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v.length > 0 ? v : fallback;
}

function palette(): Palette {
  return {
    wall: token("--c-border-cool", "#2b4356"),
    floor: token("--c-track", "#11202b"),
    exit: token("--c-amber", "#ffb03b"),
    player: token("--c-cyan", "#39d3ff"),
  };
}

/**
 * Renders a snapshot into a canvas sized to fit `maxWidth` × `maxHeight`.
 *
 * The cell size is floored to a whole number of device pixels: a fractional cell
 * makes adjacent tiles bleed into each other under antialiasing, which on a
 * one-tile-thick wall reads as a gap. The canvas is then resized to exactly the
 * grid it drew, so it centres cleanly instead of sitting in a padded box.
 */
export function drawMiniMap(
  canvas: HTMLCanvasElement,
  snap: MapSnapshot,
  maxWidth: number,
  maxHeight: number,
): void {
  const cell = Math.max(1, Math.floor(Math.min(maxWidth / snap.width, maxHeight / snap.height)));
  const w = cell * snap.width;
  const h = cell * snap.height;

  const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const p = palette();

  for (let ty = 0; ty < snap.height; ty++) {
    for (let tx = 0; tx < snap.width; tx++) {
      if (!snap.explored.has(tx, ty)) continue;
      ctx.fillStyle = snap.walls[ty * snap.width + tx] ? p.wall : p.floor;
      ctx.fillRect(tx * cell, ty * cell, cell, cell);
    }
  }

  // Exits, but only ones already found — an unexplored hatch stays a secret.
  ctx.fillStyle = p.exit;
  for (const exit of snap.exits) {
    if (!snap.explored.has(exit.tx, exit.ty)) continue;
    ctx.fillRect(exit.tx * cell, exit.ty * cell, cell, cell);
  }

  // Rowan. Drawn at a floor of 3px so he stays findable on a large level where
  // a single cell has been squeezed down to one or two pixels.
  const pip = Math.max(3, cell);
  const off = (pip - cell) / 2;
  ctx.fillStyle = p.player;
  ctx.fillRect(snap.player.tx * cell - off, snap.player.ty * cell - off, pip, pip);
}

/** Fraction of the level's tiles the player has seen, for the STATUS readout. */
export function surveyedFraction(snap: MapSnapshot): number {
  const total = snap.width * snap.height;
  return total > 0 ? snap.explored.count() / total : 0;
}
