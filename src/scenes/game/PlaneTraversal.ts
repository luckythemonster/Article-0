import type Phaser from "phaser";
import type { Player } from "../../entities/Player";
import { getAudio } from "../../systems/AudioDirector";
import { PLANE_FLOOR, PLANE_UPPER } from "../../map/planes";
import type { PlaneLink } from "../../systems/PlaneLinks";
import type { Lighting } from "../../ui/Lighting";

/**
 * Walking between a level's two surfaces — the ladders and ramps of the deck
 * levels — and the surface state that comes out of it.
 *
 * Not a level transition: no scene restart, nothing rebuilt. What changes is
 * which grid everything asks, which Arcade bodies pen the player in, and where
 * he is standing. The climb is scripted for a third of a second, and which
 * plane he is on is the answer everything else reads afterwards, so the two
 * belong to the same owner.
 */

/**
 * How long it takes to walk between a level's two surfaces, and how far the
 * sprite arcs up-screen on the way.
 *
 * Short enough that it never reads as a cutscene — this is a step up a slope,
 * not a set piece — and long enough for the walk cycle to show. The rise is in
 * world px, so at `CAMERA_ZOOM` 2 it is twice this on screen.
 */
const RAMP_SECONDS = 0.35;
const RAMP_RISE_PX = 7;

/** The four colliders a surface change switches between. */
export interface SurfaceColliders {
  wall?: Phaser.Physics.Arcade.Collider;
  door?: Phaser.Physics.Arcade.Collider;
  deckEdge?: Phaser.Physics.Arcade.Collider;
  cover?: Phaser.Physics.Arcade.Collider;
}

/** Getters for what `create()` rebinds per level. */
export interface TraversalWorld {
  tileSize(): number;
  player(): Player;
  lighting(): Lighting;
  colliders(): SurfaceColliders;
  /** Dropped when a climb starts — he cannot hold a wall on the way up. */
  releasePress(): void;
}

/**
 * Built as a field initializer, which preserves the existing behaviour that the
 * surface survives a level transition — nothing in the scene ever reset it.
 */
export class PlaneTraversal {
  /** Which walk surface the player is on; 0 everywhere but the two deck levels. */
  private current = PLANE_FLOOR;
  /** Cleared when he steps off a link, so a switch never bounces straight back. */
  private armed = true;
  /** Seconds left climbing between surfaces, or 0 when not on a slope. */
  private left = 0;
  private vx = 0;
  private vy = 0;
  private toPlane = PLANE_FLOOR;
  private toX = 0;
  private toY = 0;

  constructor(private readonly w: TraversalWorld) {}

  /** Which surface he is on now. */
  get plane(): number {
    return this.current;
  }

  /** True while a climb is playing out. */
  get climbing(): boolean {
    return this.left > 0;
  }

  /** Whether a link under him may fire — false until he steps off one. */
  get armedForLink(): boolean {
    return this.armed;
  }

  /**
   * The surface to draw the overlay against: the destination while climbing, so
   * the roof stops fading him out before he has arrived under it.
   */
  get visualPlane(): number {
    return this.left > 0 ? this.toPlane : this.current;
  }

  /** Re-arms the link under him once he has stepped off it. */
  arm(): void {
    this.armed = true;
  }

  /**
   * Moves the player between this level's walk surfaces.
   *
   * The body is moved *before* the collider swaps, or he starts the next frame
   * overlapping the deck's edge bodies and gets ejected off the gantry.
   */
  begin(link: PlaneLink): void {
    const ts = this.w.tileSize();
    const player = this.w.player();
    const goingUp = this.current === PLANE_FLOOR;
    const to = goingUp ? { x: link.toX, y: link.toY } : { x: link.x, y: link.y };
    const half = ts / 2;

    this.left = RAMP_SECONDS;
    this.toPlane = goingUp ? PLANE_UPPER : PLANE_FLOOR;
    this.toX = to.x * ts + half;
    this.toY = to.y * ts + half;
    this.vx = (this.toX - player.x) / RAMP_SECONDS;
    this.vy = (this.toY - player.y) / RAMP_SECONDS;
    this.armed = false;
    this.w.releasePress();

    // He belongs to neither surface while he is on the slope between them, so
    // nothing collides for the duration — which is also what lets the rise
    // below arc him off the straight line without catching on anything.
    this.setColliders(false, false);
    getAudio().door();
  }

  /**
   * One frame of a climb.
   *
   * The same trick `VaultAndPress.tick` uses: the ordinary player update still
   * runs, driven by a synthetic input pointing the way he is going, so the facing
   * and the walk cycle come out of the code that already knows how to do them.
   * Only the velocity is scripted.
   *
   * **The rise is in the velocity, not the sprite.** Offsetting `sprite.y` to
   * lift the art is a trap: Arcade's `Body.preUpdate` calls
   * `updateFromGameObject()` every frame, so nudging the sprite drags the body
   * with it — the same reason {@link Player.bodyCentre} explains the peek lean
   * has no visual component. A half-sine added to the *velocity* integrates to
   * zero over the crossing, so he arcs up-screen and lands exactly on the
   * destination cell, with body and art never disagreeing and `eye` staying
   * truthful to everything that senses him.
   */
  tick(dt: number): void {
    const player = this.w.player();
    const before = this.left;
    this.left = Math.max(0, this.left - dt);
    // Phase through the crossing, 0 → 1, sampled at the middle of this frame so
    // the arc integrates cleanly rather than drifting with the frame rate.
    const t = 1 - (before + this.left) / 2 / RAMP_SECONDS;
    // Displacement is `-RISE * sin(pi * t)`, so the velocity that produces it is
    // its derivative. Over the whole crossing that integrates to zero, which is
    // what puts him back on the line at the far end.
    const rise = -RAMP_RISE_PX * (Math.PI / RAMP_SECONDS) * Math.cos(Math.PI * t);

    player.update(
      {
        up: this.vy < 0,
        down: this.vy > 0,
        left: this.vx < 0,
        right: this.vx > 0,
        sneak: false,
        run: false,
        escorting: false,
        press: null,
        canStand: true,
      },
      dt,
    );
    player.sprite.setVelocity(this.vx, this.vy + rise);

    if (this.left <= 0) this.finish();
  }

  /** Commits the surface change once the climb has played out. */
  private finish(): void {
    // Land exactly on the cell rather than wherever the arc's rounding left him.
    this.w.player().moveTo(this.toX, this.toY);
    this.current = this.toPlane;
    this.setColliders(this.current === PLANE_FLOOR, this.current === PLANE_UPPER);
    // Sight is cast against the surface he is on, so the darkness has to recast
    // from scratch rather than reuse the polygon it built downstairs.
    this.w.lighting().setPlane(this.current);
  }

  /**
   * Which set of static bodies pens the player in.
   *
   * On the deck the floor's walls are below him and its cover is furniture he is
   * standing over; the deck's own edge is the only thing that stops him. Mid-climb
   * both are off.
   */
  setColliders(floor: boolean, deck: boolean): void {
    const c = this.w.colliders();
    if (c.wall) c.wall.active = floor;
    if (c.door) c.door.active = floor;
    if (c.deckEdge) c.deckEdge.active = deck;
    // Cover is re-asserted every frame in `updateWorld` against the crouch, so
    // only the mid-climb suppression needs saying here.
    if (c.cover) c.cover.active = floor;
  }
}
