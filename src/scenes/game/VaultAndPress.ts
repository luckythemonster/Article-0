import type Phaser from "phaser";
import type { Player } from "../../entities/Player";
import { getAudio } from "../../systems/AudioDirector";
import type { CollisionGrid } from "../../systems/CollisionGrid";
import type { DetectionSystem } from "../../systems/DetectionSystem";
import { len } from "../../systems/distance";
import {
  PRESS_LEAN_TILES,
  PRESS_REACH_TILES,
  VAULT_NOISE,
  VAULT_REACH_TILES,
  VAULT_SECONDS,
} from "../../systems/EntityStats";
import { resolvePress, type PressState } from "../../systems/WallPress";

/**
 * Rowan's two ways of dealing with a piece of furniture: go over it, or flatten
 * against it.
 *
 * They share this module because they share a latch — starting a vault drops the
 * press, and being mid-vault suppresses the next one — and because both answer
 * the same question of the collision grid and the cover board at once. Split
 * across the scene, that mutual exclusion was two `pressToggled = false` writes
 * 60 lines apart with nothing naming the rule.
 *
 * The state is owned here: whether the press is latched, and how much of a vault
 * is left to run.
 */

/** The two boards a vault has to agree with, narrowed for the pure core. */
export interface VaultQuery {
  /** Would this cell stop a standing man — walls and cover both. */
  isBlocked(tx: number, ty: number): boolean;
  /** `"low"`, `"high"`, or undefined for a plain wall, at a pixel position. */
  coverTypeAt(px: number, py: number): string | undefined;
}

/**
 * The tile a vault from `(px, py)` facing `facing` would land on, or null when
 * there is nothing to go over.
 *
 * A vault is a cardinal hop across exactly one cell, so the facing is reduced
 * to its dominant axis rather than projected by distance — a diagonal approach
 * to a crate should still put Rowan squarely on the far side of it.
 *
 * Only **low** cover qualifies. That is what finally gives the map's authored
 * `Cover.Height` split some teeth: crates and desks are things you get over,
 * server racks are things you get *into* (crouched) or hide behind, and the two
 * verbs stay distinct instead of both being "cross this tile".
 */
export function vaultTargetFor(
  q: VaultQuery,
  tileSize: number,
  px: number,
  py: number,
  facing: number,
): { x: number; y: number } | null {
  const ts = tileSize;
  const fx = Math.cos(facing);
  const fy = Math.sin(facing);
  const stepX = Math.abs(fx) >= Math.abs(fy) ? Math.sign(fx) : 0;
  const stepY = stepX === 0 ? Math.sign(fy) : 0;
  if (stepX === 0 && stepY === 0) return null;

  const cx = Math.floor(px / ts);
  const cy = Math.floor(py / ts);
  const ox = cx + stepX;
  const oy = cy + stepY;
  // Close enough to actually reach it, measured to the obstacle's centre.
  const reach = len(ox + 0.5 - px / ts, oy + 0.5 - py / ts);
  if (reach > VAULT_REACH_TILES) return null;
  // Solid *and* low cover: the grid answers the first, the cover board the second.
  if (!q.isBlocked(ox, oy)) return null;
  if (q.coverTypeAt((ox + 0.5) * ts, (oy + 0.5) * ts) !== "low") return null;
  // Somewhere to come down. Cover reads as blocked here too, so this also stops
  // a vault that would land him on top of the next crate along.
  const lx = cx + stepX * 2;
  const ly = cy + stepY * 2;
  if (q.isBlocked(lx, ly)) return null;
  return { x: lx, y: ly };
}

/**
 * Getters rather than captured values: `create()` rebinds the player and the
 * per-level boards, and a module built before that would hold the wrong ones.
 */
export interface VaultWorld {
  tileSize: number;
  grid(): CollisionGrid;
  detection(): DetectionSystem;
  player(): Player;
  /** A weapon on somebody claims Rowan's hands — he cannot vault while holding up. */
  heldUp(): boolean;
}

export class VaultAndPress {
  /** Latched by X: true while Rowan is holding a wall face. */
  private toggled = false;
  /** Seconds left in a vault over low cover, or 0 when not vaulting. */
  private left = 0;
  /** Velocity (px/sec) the current vault carries him at, held constant for its run. */
  private vx = 0;
  private vy = 0;

  constructor(private readonly w: VaultWorld) {}

  get vaulting(): boolean {
    return this.left > 0;
  }

  /** Flips the wall-press latch — X is a toggle, not a hold. */
  togglePress(): void {
    this.toggled = !this.toggled;
  }

  /** Drops the latch without a keypress, on death, transition or level reset. */
  releasePress(): void {
    this.toggled = false;
  }

  /**
   * The wall face Rowan is holding this frame, or null.
   *
   * Resolved here rather than in `Player` because this is where the collision
   * grid lives; what crosses the seam is plain geometry. The latch is dropped as
   * soon as nothing is in reach, so walking away from a wall releases the press
   * on its own and X never has to be tapped twice to get moving again.
   */
  pressSurface(): PressState | null {
    if (!this.toggled || this.left > 0) return null;
    const player = this.w.player();
    const body = player.sprite.body as Phaser.Physics.Arcade.Body;
    const ts = this.w.tileSize;
    const found = resolvePress(
      this.w.grid(),
      body.center.x / ts,
      body.center.y / ts,
      { halfW: body.halfWidth / ts, halfH: body.halfHeight / ts },
      PRESS_REACH_TILES,
      player.facing,
      PRESS_LEAN_TILES,
    );
    if (!found) this.toggled = false;
    return found;
  }

  /** The tile a vault would land on, or null when there is nothing to go over. */
  target(): { x: number; y: number } | null {
    const player = this.w.player();
    if (player.crouched || player.pressed || this.w.heldUp()) return null;
    const detection = this.w.detection();
    const grid = this.w.grid();
    return vaultTargetFor(
      {
        isBlocked: (tx, ty) => grid.isBlocked(tx, ty),
        coverTypeAt: (px, py) => detection.coverTypeAt(px, py),
      },
      this.w.tileSize,
      player.x,
      player.y,
      player.facing,
    );
  }

  /** Commits to a vault: a straight, constant-speed crossing to the far side. */
  begin(target: { x: number; y: number }): void {
    const ts = this.w.tileSize;
    const player = this.w.player();
    this.left = VAULT_SECONDS;
    this.vx = ((target.x + 0.5) * ts - player.x) / VAULT_SECONDS;
    this.vy = ((target.y + 0.5) * ts - player.y) / VAULT_SECONDS;
    this.toggled = false;
    getAudio().door();
  }

  /**
   * One frame of a vault.
   *
   * The ordinary player update still runs, driven by a synthetic input pointing
   * the way he is going, so the facing and the walk cycle come out of the code
   * that already knows how to do them. Only the velocity is overwritten — the
   * crossing is scripted, the animation is not.
   */
  tick(dt: number): void {
    const player = this.w.player();
    this.left = Math.max(0, this.left - dt);
    player.update(
      {
        up: this.vy < 0,
        down: this.vy > 0,
        left: this.vx < 0,
        right: this.vx > 0,
        sneak: false,
        run: false,
        escorting: false,
      carrying: false,
        press: null,
        canStand: true,
      },
      dt,
    );
    player.sprite.setVelocity(this.vx, this.vy);
    player.noise = VAULT_NOISE;
  }

  /**
   * Pixel centre of the face Rowan is holding, or his own position when he is
   * not pressed against anything.
   */
  pressedCoverCentre(): { x: number; y: number } {
    const player = this.w.player();
    const held = player.pressedSurface;
    if (!held) return { x: player.x, y: player.y };
    const ts = this.w.tileSize;
    return { x: (held.surface.wallX + 0.5) * ts, y: (held.surface.wallY + 0.5) * ts };
  }

  /**
   * What the held face is made of — `"low"`, `"high"`, or undefined when Rowan
   * is not pressed or is pressed against a plain wall.
   */
  pressedCoverType(): string | undefined {
    if (!this.w.player().pressedSurface) return undefined;
    const c = this.pressedCoverCentre();
    return this.w.detection().coverTypeAt(c.x, c.y);
  }

  /**
   * True while Rowan is squeezed inside a cover tile, so there is no headroom to
   * stand up into.
   *
   * Both halves are needed. The grid answers "would this stop a standing man",
   * which is what makes the rule fire on `main2`'s solid server racks and *not*
   * on the rooftop's cover, whose board was never marked solid and which has
   * always been walked over standing.
   */
  inCover(): boolean {
    const player = this.w.player();
    const ts = this.w.tileSize;
    const tx = Math.floor(player.x / ts);
    const ty = Math.floor(player.y / ts);
    return (
      this.w.grid().isBlocked(tx, ty) &&
      this.w.detection().coverTypeAt(player.x, player.y) !== undefined
    );
  }
}
