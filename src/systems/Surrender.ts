import {
  HOLD_UP_ARC_DEGREES,
  HOLD_UP_REACH_TILES,
  HOLD_UP_RELEASE_ARC_DEGREES,
  HOLD_UP_RELEASE_TILES,
  STAPLER_ITEM,
  STUN_ROUNDS_ITEM,
} from "./EntityStats";

/**
 * The hold-up: pointing a weapon at a person instead of firing it.
 *
 * Everything else in the arsenal answers a human being with violence — the dart
 * drops him, the staple pins him, and both of them shout while they do it. This is
 * the threat, and the rules it needs are all about *aim*: who is in front of Rowan,
 * who stays in front of him while he walks, and where a man marched ahead of him
 * ought to be standing.
 *
 * Pure — no Phaser, no allocation in the hot path — so it unit-tests like the rest
 * of `src/systems`, which is the whole reason it isn't just a method on `Orderly`.
 * The *state* of surrendering belongs to the person surrendering and lives in
 * `Orderly`'s state union; the state of the aim belongs to the aim and lives here,
 * because "which person is this weapon on" is not a fact about any one orderly.
 *
 * Named for the target's side of the transaction, matching {@link Deployables}. It
 * emphatically may **not** be called `Hold*`: `HoldTarget`/`HoldFixture` already own
 * that word for the hold-to-interact fixtures (terminals, chests, pedestals), and
 * `HoldTarget` caches its position at construction, so it could not follow a walking
 * person even if the name were free.
 */

/** The slice of the level this module reads. Structural, so a test can pass a literal. */
export interface SurrenderWorld {
  tileSize: number;
  grid: { hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean };
}

/** Whoever is doing the aiming. `Player` satisfies this by shape. */
export interface Aimer {
  x: number;
  y: number;
  /** Facing angle, radians (world convention: 0 = east, +y = south). */
  facing: number;
}

/**
 * Whoever can be made to put their hands up. `Orderly` satisfies this by shape.
 *
 * Note there is no `facing` here, and that is deliberate: a hold-up has no cone
 * requirement on the *target*. Walking up behind someone and telling them to freeze
 * is the fantasy, and demanding they be looking at you would delete it.
 */
export interface Surrenderable {
  readonly x: number;
  readonly y: number;
  /** False for someone who has already raised the alarm, or is already frozen. */
  readonly canSurrender: boolean;
}

/** One frame's answer from {@link SurrenderAim}. */
export interface SurrenderResult<T> {
  /**
   * Who Rowan *could* hold up right now, whether or not the key is down. Drives the
   * `[Q] Hold up` prompt, which is the only reason it is computed on a frame where
   * nothing is being held.
   */
  candidate: T | null;
  /** Who Rowan *is* holding up. Non-null only while the aim is down. */
  target: T | null;
  /** True on the exact frame a new target is acquired — for the sting and the journal. */
  acquired: boolean;
}

/** Cos of the half-angle of an arc given as a full width in degrees. */
function arcCos(fullDegrees: number): number {
  return Math.cos((fullDegrees * Math.PI) / 360);
}

const ACQUIRE_ARC_COS = arcCos(HOLD_UP_ARC_DEGREES);
const RELEASE_ARC_COS = arcCos(HOLD_UP_RELEASE_ARC_DEGREES);

/**
 * True when Rowan is carrying something worth being afraid of.
 *
 * Either weapon will do, because the mechanic is the gesture rather than the
 * ordnance — a man looking down the barrel of a compliance dart has the same
 * decision to make as one looking at a rail-stapler. What he must not be able to do
 * is bluff empty-handed: the verb stays behind the same chest-loot progression as
 * the rest of the arsenal.
 */
export function canHoldUp(inventory: readonly string[]): boolean {
  return inventory.includes(STUN_ROUNDS_ITEM) || inventory.includes(STAPLER_ITEM);
}

/**
 * The nearest person Rowan is pointing at, or null.
 *
 * `prefer` is the target of an established hold, and it is tested first and at the
 * *release* thresholds — a wider arc and a longer reach. Without that stickiness a
 * second orderly wandering closer would silently steal the aim: the first man's
 * grace would start draining while the player watched someone else put their hands
 * up, which reads as a bug however correct "nearest" is.
 *
 * Tests are ordered squared-distance → arc → line of sight, the way `noticedLure`
 * orders its own: this runs for every orderly on every frame to drive the prompt,
 * and `hasLineOfSight` walks tiles.
 */
export function aimedAt<T extends Surrenderable>(
  aimer: Aimer,
  candidates: readonly T[],
  world: SurrenderWorld,
  prefer?: T | null,
): T | null {
  const fx = Math.cos(aimer.facing);
  const fy = Math.sin(aimer.facing);

  if (prefer && inAim(aimer, fx, fy, prefer, world, HOLD_UP_RELEASE_TILES, RELEASE_ARC_COS)) {
    return prefer;
  }

  let best: T | null = null;
  let bestDist2 = Infinity;
  const reachPx = HOLD_UP_REACH_TILES * world.tileSize;
  const reach2 = reachPx * reachPx;
  for (const c of candidates) {
    const dx = c.x - aimer.x;
    const dy = c.y - aimer.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= bestDist2) continue;
    if (d2 > reach2) continue;
    if (!inAim(aimer, fx, fy, c, world, HOLD_UP_REACH_TILES, ACQUIRE_ARC_COS)) continue;
    bestDist2 = d2;
    best = c;
  }
  return best;
}

/** Range + arc + eligibility + line of sight, at whichever thresholds the caller is using. */
function inAim(
  aimer: Aimer,
  fx: number,
  fy: number,
  target: Surrenderable,
  world: SurrenderWorld,
  reachTiles: number,
  arcCosine: number,
): boolean {
  if (!target.canSurrender) return false;
  const dx = target.x - aimer.x;
  const dy = target.y - aimer.y;
  const d2 = dx * dx + dy * dy;
  const reachPx = reachTiles * world.tileSize;
  if (d2 > reachPx * reachPx) return false;
  // Standing inside someone is inside every arc there is; atan2 of nothing is due
  // east, so the dot product below would answer for a direction nobody chose.
  if (d2 === 0) return true;
  if ((dx * fx + dy * fy) / Math.sqrt(d2) < arcCosine) return false;
  const ts = world.tileSize;
  return world.grid.hasLineOfSight(aimer.x / ts, aimer.y / ts, target.x / ts, target.y / ts);
}

/**
 * Where a marched hostage should be standing: `standoffTiles` ahead along the
 * aimer's facing.
 *
 * Deriving it from the *facing* rather than from a stored offset is what makes the
 * march work with no aiming input at all. Rowan's facing is the direction he is
 * walking, so pushing the stick pushes the man in front of him, and stopping leaves
 * him where he was.
 */
export function escortPoint(
  aimer: Aimer,
  standoffTiles: number,
  tileSize: number,
): { x: number; y: number } {
  const d = standoffTiles * tileSize;
  return { x: aimer.x + Math.cos(aimer.facing) * d, y: aimer.y + Math.sin(aimer.facing) * d };
}

/**
 * One live aim, held across frames.
 *
 * Owned by the scene rather than by either party, and deliberately reconstructed on
 * a level change rather than reset in place — it holds a reference to an entity that
 * a `scene.restart()` destroys.
 */
export class SurrenderAim<T extends Surrenderable> {
  private held: T | null = null;
  private seconds = 0;

  /** Who is currently at gunpoint, or null. */
  get target(): T | null {
    return this.held;
  }

  /** How long the current hold has run. Resets to zero whenever the aim moves. */
  get heldSeconds(): number {
    return this.seconds;
  }

  /**
   * Advances the aim by one frame.
   *
   * `aiming` is the key *and* everything that gates it (a weapon in the bag, the
   * roof's input lock). Passing false is how a hold is released — there is no
   * separate release call, and there is deliberately nothing here that could forget
   * to make one.
   */
  update(
    dt: number,
    aiming: boolean,
    aimer: Aimer,
    candidates: readonly T[],
    world: SurrenderWorld,
  ): SurrenderResult<T> {
    // Recomputed even while nothing is held, because the prompt has to advertise the
    // verb before the player knows to press the key.
    const found = aimedAt(aimer, candidates, world, aiming ? this.held : null);

    if (!aiming || !found) {
      this.held = null;
      this.seconds = 0;
      return { candidate: found, target: null, acquired: false };
    }

    const acquired = this.held !== found;
    if (acquired) this.seconds = 0;
    this.held = found;
    this.seconds += dt;
    return { candidate: found, target: found, acquired };
  }
}
