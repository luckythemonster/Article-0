import type Phaser from "phaser";
import type { CollisionGrid } from "../../systems/CollisionGrid";
import { len } from "../../systems/distance";
import { ExploredMap, initialExplored, type ExploredState } from "../../systems/Explored";
import { rayDirections, sightDistances, walkRayCells, SIGHT_RAYS } from "../../systems/Visibility";
import type { MemoryLayer } from "../../ui/MemoryLayer";

/**
 * What Rowan has had a sightline to, and the throttled sweep that finds out.
 *
 * The mask itself is `systems/Explored.ts`; this is the shell that casts into
 * it — the ray fan, the reusable distance buffer, the cooldown, and the
 * registry round-trip that carries a level's mask across a scene restart. Those
 * four things are one mechanism and had no reason to be four scene fields.
 */

/** How long between sweeps, in seconds. */
const EXPLORE_INTERVAL = 0.25;

/**
 * All getters. This is built as a field initializer so the ray fan and the
 * distance buffer are allocated once and reused across levels — `scene.restart()`
 * does not re-run field initialisers, and the sweep's cast is deliberately
 * independent of `Lighting`'s. {@link reload} swaps in the new level's mask.
 */
export interface ExploredWorld {
  tileSize(): number;
  grid(): CollisionGrid;
  levelName(): string;
  levelSize(): { width: number; height: number };
  /** Cast from here — the eye, not the body. */
  eye(): { x: number; y: number };
  camera(): Phaser.Cameras.Scene2D.Camera;
  registry(): Phaser.Data.DataManager;
  memory(): MemoryLayer;
}

export class ExploredTracker {
  /** Seen-tile mask for *this* level; the other levels' stay in the registry. */
  private mask!: ExploredMap;
  /** Seconds until the next sweep — they're throttled, not per-frame. */
  private cooldown = 0;
  /**
   * The sweep's own ray fan and distance buffer.
   *
   * Cast separately from `Lighting`'s rather than borrowing its result. Four
   * sweeps a second against sixty frames is a rounding error, and buying the
   * independence is worth it: the sweep keeps working with the darkness toggled
   * off (debug `O`), and it does not inherit the overlay's own recast cadence.
   * Allocated once and reused across levels — see {@link ExploredWorld}.
   */
  private readonly dirs = rayDirections(SIGHT_RAYS);
  private readonly dist = new Float64Array(SIGHT_RAYS);
  /** Cells first seen this sweep, as `y * width + x`, handed to the memory layer. */
  private readonly fresh: number[] = [];

  constructor(private readonly w: ExploredWorld) {}

  /** Picks up the mask for whichever level is now current, and restarts the clock. */
  reload(): void {
    this.mask = this.load();
    this.cooldown = 0;
  }

  /** The live mask, for the pause-menu minimap and the memory layer's priming. */
  get explored(): ExploredMap {
    return this.mask;
  }

  /** This level's seen-tile mask, restored from the registry if we've been here. */
  private load(): ExploredMap {
    const registry = this.w.registry();
    const state = (registry.get("explored") as ExploredState | undefined) ?? initialExplored();
    registry.set("explored", state);
    const stored = state[this.w.levelName()];
    const { width, height } = this.w.levelSize();
    return stored ? ExploredMap.fromBase64(stored, width, height) : new ExploredMap(width, height);
  }

  /** Folds this level's mask back into the registry-held per-level record. */
  flush(): void {
    const registry = this.w.registry();
    const state = (registry.get("explored") as ExploredState | undefined) ?? initialExplored();
    state[this.w.levelName()] = this.mask.toBase64();
    registry.set("explored", state);
  }

  /**
   * Marks everything currently in the player's line of sight as seen.
   *
   * Throttled rather than run per frame: at walking pace a quarter-second of
   * movement reveals no tile a full sweep wouldn't have.
   *
   * This casts *the same visibility polygon the darkness does* — `sightDistances`
   * over the same ray fan — and then remembers every cell those rays crossed.
   * It used to scan a 9-tile box and test each tile centre with the boolean
   * `hasLineOfSight`, which is a different algorithm over a different shape: two
   * answers that disagreed at every boundary, and a hard circular horizon. That
   * was survivable while the mask only fed the pause menu's minimap. Now that
   * remembered tiles are drawn *in the world*, any disagreement between the mask
   * and the shadow fan is visible as a seam, so there is only one cast.
   *
   * A cast distance carries half a tile past the face it stopped at
   * (`WALL_REVEAL_TILES`), so the walls of a room are remembered along with its
   * floor — a room recalled without its walls is not a room.
   */
  mark(dt: number): void {
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    this.cooldown = EXPLORE_INTERVAL;

    // Cast from the eye, not the body, so a peek round a corner fills in the map
    // it just looked at — the same reason the darkness is cast from there. The
    // explored mask is meant to show what Rowan has had a sightline to.
    const eye = this.w.eye();
    const ts = this.w.tileSize();
    const px = eye.x / ts;
    const py = eye.y / ts;
    sightDistances(this.w.grid(), px, py, this.reachTiles(eye.x, eye.y), this.dirs, this.dist);

    const fresh = this.fresh;
    fresh.length = 0;
    const { width, height } = this.w.levelSize();
    const mask = this.mask;
    // One closure for the sweep rather than one per ray.
    const visit = (tx: number, ty: number): void => {
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) return;
      if (mask.has(tx, ty)) return;
      mask.mark(tx, ty);
      fresh.push(ty * width + tx);
    };

    const { cos, sin } = this.dirs;
    for (let i = 0; i < cos.length; i++) {
      walkRayCells(px, py, cos[i], sin[i], this.dist[i], visit);
    }

    if (fresh.length > 0) this.w.memory().remember(fresh);
  }

  /**
   * How far the sweep casts, in tiles: to the furthest corner of what the camera
   * is showing, plus a tile of slack.
   *
   * The same reach `Lighting.viewReach` uses, and for the same reason — there is
   * no point remembering ground the player could not have been shown, and no
   * point stopping short of the screen edge either.
   */
  private reachTiles(viewX: number, viewY: number): number {
    const v = this.w.camera().worldView;
    const ts = this.w.tileSize();
    const dx = Math.max(Math.abs(viewX - v.x), Math.abs(v.right - viewX));
    const dy = Math.max(Math.abs(viewY - v.y), Math.abs(v.bottom - viewY));
    return (len(dx, dy) + ts) / ts;
  }
}
