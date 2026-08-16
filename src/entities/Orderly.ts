import Phaser from "phaser";
import type { CollisionGrid } from "../systems/CollisionGrid";
import {
  ESCORT_WALK_TILES,
  ORDERLY_COLLISION_RADIUS_TILES,
  paced,
  RATION_SPOOF_SECONDS,
  SANITATION_CONE_DEGREES,
  SANITATION_SIGHT_MULTIPLIER,
} from "../systems/EntityStats";
import { moveCirclePx } from "../systems/GridMotion";
import { findPath, type PathNode } from "../systems/Pathfinder";
import { workDoors } from "./doorWork";
import type { PatrolRoute } from "../systems/PatrolRoute";
import { LURE_SPECS, noticedLure, type DeployedLure } from "../systems/Deployables";
import { DIRS_8, nearestDirection, type Dir8 } from "./directions";
import { shadowShapeFor, type ShadowShape } from "../render/shadowShape";
import { ORDERLY_SILHOUETTE } from "./Silhouette";
import { alertMarker, speechMarker } from "./markers";
import {
  ORDERLY_ANIM_FRAME_COUNTS,
  ORDERLY_ANIM_FRAME_RATES,
  ORDERLY_DISPLAY_TILES,
  ORDERLY_SOURCE_SIZE,
  orderlyAnimKey,
  orderlyFrameKey,
  type OrderlyAnimName,
} from "./OrderlyAnimations";
import { angleDiff } from "../systems/angles";
import { len } from "../systems/distance";

export interface OrderlyContext {
  grid: CollisionGrid;
  tileSize: number;
  player: { x: number; y: number };
  /** True when the player is hidden (crouched in cover) — orderlies can't see them either. */
  playerConcealed: boolean;
  /** True when the player reads as compliant staff — nothing to report. */
  playerCompliant: boolean;
  /** Items left on the floor this frame; an orderly services the nearest it notices. */
  lures?: readonly DeployedLure[];
  /**
   * True when the player is holding an opened ration and no alarm is up: the
   * orderly reads Rowan as an asset on a break and grants a grace window instead
   * of reporting. Resolved by the scene, since the "before an alarm" half of it is
   * global alert state the orderly has no other reason to know about.
   */
  rationSpoof?: boolean;
  /**
   * True when this tile holds a door the orderly may work itself.
   *
   * The same predicate the guards get, and for the same reason their own copy
   * spells out: a facility's staff route *through* its doors rather than
   * treating every one as permanent geometry. Without it `main1`'s orderly could
   * not reach three of the four waypoints on its own authored round — it walked
   * to the first, found a shut door, and loitered at spawn for the rest of the
   * run.
   */
  isOperableDoor?: (tileX: number, tileY: number) => boolean;
  /** Opens or closes a door the orderly is working. */
  setDoorOpen?: (tileX: number, tileY: number, open: boolean) => void;
}

/**
 * What an orderly is currently doing.
 *
 * These used to be three implicit booleans (`alerted`, a nullable distract target,
 * a pause accumulator) whose legal combinations were only knowable by reading the
 * whole file — which was survivable with one override and stopped being so with
 * three. The transitions are now stated in {@link Orderly.think}, once:
 *
 *  - **WANDER**     — the default: drift near the spawn point on a leash.
 *  - **INSPECT**    — walking over to look at a knock, then giving up.
 *  - **SANITATION** — servicing a deployed item: the Sanitation / Containment
 *                     override, which outranks both of the above.
 *  - **SURRENDERED** — hands up at gunpoint. Outranks everything but WITNESSED.
 *  - **WITNESSED**  — has seen the player and raised its one alarm. Terminal.
 *
 * SURRENDERED is a member of this union rather than a third timer beside
 * {@link stunTimer} and {@link pinTimer}, and the distinction is worth stating.
 * Stun and pin get away with being bare timers because they carry no *behaviour*:
 * {@link update} short-circuits above `think()` and the orderly simply resumes when
 * they lapse. Surrender does carry behaviour — it turns to face the weapon, it says
 * something, it can be marched, it has a release grace, and it is refused outright
 * to someone who has already reported you. That is a state.
 *
 * It is also why {@link isImmobilized} is deliberately **not** extended to cover it.
 * Folding surrender in there would silently change four unrelated call sites at once:
 * the Rail-Stapler would stop being able to staple a surrendered man, `distract`
 * would no-op by accident rather than by decision, {@link syncMarkers} would blank
 * the very speech line that carries the state, and `GameScene.buildAnomalies` would
 * report the wrong kind to the patrols. Two separate getters, so each of those is
 * answered on purpose.
 */
type OrderlyState = "WANDER" | "INSPECT" | "SANITATION" | "SURRENDERED" | "WITNESSED";

const SIGHT_RANGE_TILES = 5;
const WANDER_LEASH_TILES = 2.5;
/**
 * Seconds an orderly loiters near a waypoint before walking to the next one.
 *
 * Long, and deliberately so. An orderly's board is a round, not a patrol: the
 * character is a member of staff who has somewhere to be eventually, not a guard
 * pacing a beat. Loitering for most of the cycle keeps the leash-drift above as
 * the behaviour you actually see, with the walk between posts as punctuation.
 */
const POST_SECONDS: readonly [number, number] = [8, 16];
const WALK_SPEED_TILES = paced(1.1);
/** Seconds an orderly lingers at a knock it walked over to inspect before resuming its wander. */
const DISTRACT_PAUSE = 2.5;
/** Tiles from a target that count as arrived — half a tile, for both overrides. */
const ARRIVE_TILES = 0.5;

/** What an orderly says to an asset it has caught eating where it shouldn't. */
const REPRIMAND = "RATIONS IN THE MESS DECK, ASSET.";
/** What it mutters over a spill. */
const SANITATION_LINE = "BIOHAZARD. CONTAINING.";
/**
 * What a man says with a weapon pointed at him: he reaches for the only protection
 * this building has ever offered anybody, and finds out what it is worth.
 */
const SURRENDER_LINE = "COMPLIANT. I'M COMPLIANT. DON'T.";
/** The pale amber a surrendered orderly is tinted — see {@link syncMarkers}. */
const SURRENDER_TINT = 0xffd08a;

/**
 * A bystander, not a threat — the map's `orderlies` tiles carry no gameplay
 * component (unlike guards/drones), so this is a distinct, lighter mechanic.
 *
 * An orderly wanders loosely near its spawn point. If it gets a clear,
 * unobstructed line of sight to the player (no cone-angle restriction — a
 * person just looks around) and the player isn't concealed, it startles: a
 * one-shot "witness" sighting. `update()` returns `true` on exactly that
 * frame so the scene can react (raise nearby guards' suspicion, the same way
 * a noisy door does) — after which the orderly freezes, its job done. It's a
 * hazard to avoid being seen by, not a persistent threat like a guard.
 *
 * Three things bend that. A **deployed Sack Lunch** pulls it off its round to clean
 * and half-blinds it while it works; an **opened** one held in plain sight buys a
 * grace window before it reports. Both are the same insight from opposite ends — an
 * orderly is a member of staff with a job, and a job is a thing you can give it.
 *
 * The third is a **weapon** ({@link handsUp}). An orderly is also the only human
 * being on the deck, which is the one thing a threat needs to work on, and the
 * silicates it shares a corridor with are not. He puts his hands up, he stops being
 * able to report anything, and he walks where he is pointed — and the moment the
 * weapon comes off him he is a witness again with a very short memory of being
 * frightened.
 */
export class Orderly {
  /** Pixel position — public for the same reason as {@link Enforcer.x}. */
  x: number;
  y: number;
  /** Footprint the ground shadow is drawn from — see `EntityShadows`. */
  readonly shadow: ShadowShape;
  private readonly spawnX: number;
  private readonly spawnY: number;
  /**
   * The round this orderly walks — its board's tiles, in authored order.
   *
   * Empty or single-waypoint is the ordinary case and behaves exactly as it
   * always did: the orderly drifts on a leash around one spot and never paths
   * anywhere. Two or more waypoints turn that spot into a *current* post that
   * moves on, which is what makes a board one orderly rather than four.
   */
  private route: PatrolRoute = [];
  private routeIndex = 0;
  /** Seconds left loitering at the current post before walking to the next. */
  private postTimer = Phaser.Math.FloatBetween(...POST_SECONDS);
  /** The A* legs left to walk to the next post, or null while loitering. */
  private legPath: PathNode[] | null = null;
  private legStep = 0;
  /**
   * Body radius and the door currently held open, both read by the shared
   * {@link workDoors} — see `doorWork.ts`. Public for the same structural reason
   * `Enforcer`'s are.
   */
  readonly radiusTiles = ORDERLY_COLLISION_RADIUS_TILES;
  heldDoor: PathNode | null = null;
  private facing = 0;
  private moving = false;
  private wanderTimer: number;
  private dir: Dir8 = "south";
  private state: OrderlyState = "WANDER";
  /** Seconds of stun remaining; while > 0 the orderly is frozen and can't witness. */
  private stunTimer = 0;
  /** Seconds pinned to a wall (the Rail-Stapler's field mode) remaining; same effect as stun. */
  private pinTimer = 0;
  /** A knock the orderly is walking over to inspect, or null outside INSPECT. */
  private distractTarget: { x: number; y: number } | null = null;
  private distractPause = 0;
  /** The deployed item being serviced, and seconds of servicing done. Null outside SANITATION. */
  private lure: DeployedLure | null = null;
  private serviceTimer = 0;
  /**
   * Lures this orderly has tried and failed to reach, so it stops trying.
   *
   * Bounded by the number of items deployed on the level, and bound once as a
   * field rather than a closure per frame — {@link think} runs for every orderly
   * on every frame of the run.
   */
  private readonly unreachable = new Set<DeployedLure>();
  private readonly isUnreachable = (lure: DeployedLure): boolean => this.unreachable.has(lure);
  /** Seconds of tolerated eating banked against {@link RATION_SPOOF_SECONDS}. */
  private spoofTimer = 0;
  /** Set on frames the orderly is actively citing mess-deck policy at Rowan. */
  private reprimanding = false;
  /** Seconds of surrender left to run. Topped up every frame the weapon stays on him. */
  private surrenderGrace = 0;
  /**
   * Where the scene wants this man marched *this frame*, or null to stand his ground.
   *
   * Consumed and cleared by {@link complyAtGunpoint} every frame, so the escort has to
   * be re-sent to persist. That is the same discipline {@link handsUp} runs on, and it
   * means no path out of a hold has to remember to cancel a stale march order.
   */
  private escortTarget: { x: number; y: number } | null = null;
  /** Mirrors whether the body currently carries {@link SURRENDER_TINT}. */
  private tinted = false;

  private readonly body: Phaser.GameObjects.Sprite;
  private readonly bang: Phaser.GameObjects.Text;
  private readonly speech: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    tileX: number,
    tileY: number,
    tileSize: number,
    route: PatrolRoute = [],
  ) {
    this.x = this.spawnX = (tileX + 0.5) * tileSize;
    this.y = this.spawnY = (tileY + 0.5) * tileSize;
    this.route = route;
    this.wanderTimer = Phaser.Math.FloatBetween(1, 3);

    Orderly.ensureAnimations(scene);
    this.body = scene.add.sprite(this.x, this.y, orderlyFrameKey("idle", "south", 0)).setDepth(440);
    // Scaled to ~1.5 tiles tall, matching the guards. The two constants are
    // paired so this division lands on 0.5 and the art is never resampled — see
    // ORDERLY_SOURCE_SIZE.
    this.body.setScale((tileSize * ORDERLY_DISPLAY_TILES) / ORDERLY_SOURCE_SIZE);
    this.shadow = shadowShapeFor(ORDERLY_SILHOUETTE, ORDERLY_DISPLAY_TILES, tileSize);
    this.body.play(orderlyAnimKey("idle", "south"));

    this.bang = alertMarker(scene, this.x, this.y, tileSize);
    this.speech = speechMarker(scene, this.x, this.y, tileSize);
  }

  /** Freezes the orderly for a stretch (a Stun Rounds dart) — can't witness. */
  stun(seconds: number): void {
    // Being knocked out ends a surrender rather than layering over it, so the kind of
    // anomaly the patrols see can't flicker between the two on alternate frames.
    if (this.state === "SURRENDERED") this.returnToRound();
    this.stunTimer = Math.max(this.stunTimer, seconds);
    this.moving = false;
    this.bang.setVisible(false);
  }

  /** Pins the orderly to a wall for a stretch (the Rail-Stapler's field mode) — can't witness. */
  pin(seconds: number): void {
    if (this.state === "SURRENDERED") this.returnToRound();
    this.pinTimer = Math.max(this.pinTimer, seconds);
    this.moving = false;
    this.bang.setVisible(false);
  }

  /**
   * Puts the orderly's hands up, and keeps them there for `seconds`.
   *
   * Shaped exactly like {@link stun} and {@link pin}, and called on **every frame**
   * the weapon stays trained: `Math.max` tops the grace back up for as long as the
   * hold lasts, so *releasing someone is simply the scene ceasing to call this*.
   * There is deliberately no `release()` — a second method would be a second thing to
   * forget on a level change, a capture, or any of the paths that drop an aim.
   *
   * Refused to a man who has already reported you. Un-reporting him would re-arm the
   * one-shot alarm this class exists to make one-shot, and a single orderly pinging
   * repeatedly is exactly what `NoiseSpamTracker` escalates to a full ALERT.
   */
  handsUp(seconds: number): void {
    if (this.state === "WITNESSED") return;
    if (this.state !== "SURRENDERED") {
      this.returnToRound(); // drops the mop, the knock, the lot
      this.state = "SURRENDERED";
      this.bang.setVisible(false);
    }
    this.surrenderGrace = Math.max(this.surrenderGrace, seconds);
  }

  /**
   * Marches a surrendered orderly toward a point this frame — the standoff position
   * ahead of the player, recomputed from Rowan's facing every frame by the scene.
   *
   * A no-op on anyone not currently at gunpoint, so a stray call can't push a man
   * around who never put his hands up.
   */
  escortTo(x: number, y: number): void {
    if (this.state !== "SURRENDERED") return;
    this.escortTarget = { x, y };
  }

  /**
   * Lures the orderly to inspect a nearby noise (a player's knock): it leaves
   * its wander, walks over, pauses, then drifts back. A no-op while stunned,
   * already startled by witnessing the player, or busy with a spill — a knock
   * does not out-rank an actual work order.
   *
   * Returns whether the override took. The refusals above are the only place
   * those rules are written down, so a caller that needs somebody who will
   * *actually* come — `GameScene.updateBreakerResets`, picking an orderly to
   * reset a thrown breaker — asks by calling rather than by re-deriving them
   * from the public getters and drifting.
   */
  distract(sx: number, sy: number): boolean {
    if (this.isImmobilized) return false;
    // A knock does not out-rank an actual work order, and it certainly does not
    // out-rank the weapon pointed at him.
    if (this.state === "WITNESSED" || this.state === "SANITATION") return false;
    if (this.state === "SURRENDERED") return false;
    this.state = "INSPECT";
    this.distractTarget = { x: sx, y: sy };
    this.distractPause = 0;
    return true;
  }

  /** True on the exact frame the orderly first spots the player. */
  update(dt: number, ctx: OrderlyContext): boolean {
    // Stunned or pinned: hold still and stay blind until it wears off.
    if (this.stunTimer > 0 || this.pinTimer > 0) {
      this.stunTimer = Math.max(0, this.stunTimer - dt);
      this.pinTimer = Math.max(0, this.pinTimer - dt);
      this.moving = false;
      this.body.setPosition(this.x, this.y);
      this.syncMarkers(ctx);
      return false;
    }

    this.think(dt, ctx);

    const dir = nearestDirection(this.facing);
    const anim: OrderlyAnimName = this.moving ? "walk" : "idle";
    if (dir !== this.dir || this.body.anims.currentAnim?.key !== orderlyAnimKey(anim, dir)) {
      this.dir = dir;
      this.body.play(orderlyAnimKey(anim, dir), true);
    }
    this.body.setPosition(this.x, this.y);

    // A man with his hands up is not raising the alarm, and this one line is the
    // whole of that requirement — `canSee` stays untouched. It is also exactly right
    // about the release frame: the grace drains inside `think()`, which ran above, so
    // on the frame it reaches zero the state is already WANDER and the witness check
    // runs *that same frame*. No second timer, no "was released last frame" flag.
    const frozen = this.state === "WITNESSED" || this.state === "SURRENDERED";
    const witnessed = frozen ? false : this.witnessCheck(dt, ctx);
    this.syncMarkers(ctx);
    return witnessed;
  }

  /**
   * One frame of behaviour, and every transition between states.
   *
   * Priority is fixed and deliberate: a deployed item outranks a knock, which
   * outranks wandering, and none of them outrank having already reported the
   * player. That last one is why a WITNESSED orderly stays frozen even with a
   * lunch at its feet — it has raised its one alarm and re-arming it would let a
   * single orderly ping repeatedly, which `NoiseSpamTracker` escalates straight to
   * a full ALERT. (Dropping the `WITNESSED` guard below is all it would take to
   * have spills pull startled orderlies back to work instead.)
   */
  private think(dt: number, ctx: OrderlyContext): void {
    if (this.state === "WITNESSED") return;

    // Only a man going about his round notices litter. Written as an allow-list rather
    // than as `!== "SANITATION"` because the moment there was a second state that must
    // not be interrupted, the deny-list silently stopped covering them all — a
    // surrendered orderly would spot a Sack Lunch and walk off to clean it with his
    // hands in the air.
    if (this.state === "WANDER" || this.state === "INSPECT") {
      const found = ctx.lures
        ? noticedLure(this.x, this.y, ctx.lures, ctx, this.isUnreachable)
        : null;
      if (found) {
        this.state = "SANITATION";
        this.lure = found;
        this.serviceTimer = 0;
        this.distractTarget = null;
        this.distractPause = 0;
      }
    }

    switch (this.state) {
      case "SURRENDERED":
        this.complyAtGunpoint(dt, ctx);
        break;
      case "SANITATION":
        this.sanitize(dt, ctx);
        break;
      case "INSPECT":
        this.investigateDistraction(dt, ctx);
        break;
      case "WANDER":
        this.wander(dt, ctx);
        break;
    }
  }

  /**
   * The round: loiter near the current post, then walk to the next one.
   *
   * Delegates to {@link drift} for the loitering, which is the whole of the
   * behaviour on a board with fewer than two waypoints — i.e. everywhere the map
   * doesn't author a round, and everywhere it did before rounds existed.
   */
  private wander(dt: number, ctx: OrderlyContext): void {
    if (this.walkRound(dt, ctx)) return;
    this.drift(dt, ctx);
  }

  /**
   * Advances the walk between posts. Returns true while a leg is being walked,
   * so the caller leaves the loitering alone.
   *
   * A leg A* can't solve is skipped rather than ground against — the loop brings
   * that post back round next time, exactly as a guard's does
   * (`Enforcer.patrol`). Same for a leg that wedges partway: the orderly gives
   * the post up and loiters where it stands rather than standing in a wall.
   */
  private walkRound(dt: number, ctx: OrderlyContext): boolean {
    if (this.route.length < 2) return false;
    const { grid, tileSize } = ctx;

    if (!this.legPath) {
      this.postTimer -= dt;
      if (this.postTimer > 0) return false;
      const next = (this.routeIndex + 1) % this.route.length;
      const path = findPath(
        grid,
        { x: Math.floor(this.x / tileSize), y: Math.floor(this.y / tileSize) },
        this.route[next],
        { radiusTiles: ORDERLY_COLLISION_RADIUS_TILES, openable: ctx.isOperableDoor },
      );
      this.routeIndex = next;
      this.postTimer = Phaser.Math.FloatBetween(...POST_SECONDS);
      if (!path || path.length === 0) return false;
      this.legPath = path;
      this.legStep = 0;
    }

    const node = this.legPath[this.legStep];
    const nodeX = (node.x + 0.5) * tileSize;
    const nodeY = (node.y + 0.5) * tileSize;
    // The round crosses doors too — that is exactly what it could not do before.
    workDoors(this, ctx, grid, tileSize, Math.atan2(nodeY - this.y, nodeX - this.x));
    const step = this.stepToward(nodeX, nodeY, dt, ctx);
    if (step === "arrived") {
      this.legStep++;
      if (this.legStep >= this.legPath.length) this.clearLeg();
    } else if (step === "blocked") {
      this.clearLeg();
    }
    return true;
  }

  /** Ends the current leg and starts the loiter at whatever post was reached. */
  private clearLeg(): void {
    this.legPath = null;
    this.legStep = 0;
    this.postTimer = Phaser.Math.FloatBetween(...POST_SECONDS);
  }

  /** Where the leash is anchored: the current post, or the spawn if there is no round. */
  private anchor(tileSize: number): { x: number; y: number } {
    const wp = this.route[this.routeIndex];
    if (!wp) return { x: this.spawnX, y: this.spawnY };
    return { x: (wp.x + 0.5) * tileSize, y: (wp.y + 0.5) * tileSize };
  }

  private drift(dt: number, ctx: OrderlyContext): void {
    const { grid, tileSize } = ctx;
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.moving = !this.moving || Math.random() < 0.5;
      if (this.moving) {
        // Head roughly back toward the post once the leash stretches too far,
        // otherwise wander in a random direction.
        const home = this.anchor(tileSize);
        const strayed = len(this.x - home.x, this.y - home.y) > WANDER_LEASH_TILES * tileSize;
        this.facing = strayed
          ? Math.atan2(home.y - this.y, home.x - this.x)
          : Phaser.Math.FloatBetween(0, Math.PI * 2);
      }
      this.wanderTimer = this.moving
        ? Phaser.Math.FloatBetween(0.8, 1.8)
        : Phaser.Math.FloatBetween(1.5, 3.5);
    }

    if (!this.moving) return;
    const speed = WALK_SPEED_TILES * tileSize * dt;
    const moved = moveCirclePx(
      grid,
      this.x,
      this.y,
      Math.cos(this.facing) * speed,
      Math.sin(this.facing) * speed,
      ORDERLY_COLLISION_RADIUS_TILES,
      tileSize,
    );
    this.x = moved.x;
    this.y = moved.y;
    // Meeting a wall head-on ends the leg; clipping one on the diagonal just slides.
    if (moved.blockedX && moved.blockedY) {
      this.moving = false;
      this.wanderTimer = Phaser.Math.FloatBetween(1, 2);
    }
  }

  /**
   * Walks toward a knock and lingers there before giving up. Once the pause
   * elapses (or the path is blocked) it returns to WANDER — the spawn leash then
   * drifts the orderly back home.
   *
   * **Pathfound, not walked at.** This used to aim {@link stepToward} straight at
   * the target, which is fine for a knock a few tiles away — the wall slide gets
   * around most furniture — but it cannot leave a room. A breaker thrown across
   * the deck asks for exactly that: `GameScene` diverts an orderly to reset it,
   * and on `main1` the only one is twenty-odd tiles and several walls away. It
   * stalled against the first one it met and oscillated there.
   */
  private investigateDistraction(dt: number, ctx: OrderlyContext): void {
    const target = this.distractTarget!;
    const step = this.walkPathTo(target.x, target.y, dt, ctx);

    if (step === "arrived" || step === "blocked") {
      // Arrived: look around for a beat. Blocked: give up on the same clock.
      this.distractPause += dt;
      if (this.distractPause >= DISTRACT_PAUSE) this.returnToRound();
    }
  }

  /**
   * {@link stepToward}, but around corners: A* to the target, then along it.
   *
   * Shares {@link legPath}/{@link legStep} with {@link walkRound}, which is safe
   * because the two never run in the same frame — a state is WANDER or INSPECT,
   * never both — and {@link returnToRound} clears the leg on the way out.
   *
   * The path is computed once per leg and re-used, so this costs one A* per
   * diversion rather than one per frame. A target A* cannot reach reports
   * `blocked` immediately, which is the same answer the straight walk gave when
   * it wedged, and the same one the callers already handle.
   */
  private walkPathTo(
    tx: number,
    ty: number,
    dt: number,
    ctx: OrderlyContext,
  ): "arrived" | "blocked" | "walking" {
    const { grid, tileSize } = ctx;
    if (len(tx - this.x, ty - this.y) <= tileSize * ARRIVE_TILES) {
      this.moving = false;
      // Not `clearLeg()`: that also re-rolls `postTimer`, which belongs to the
      // round this diversion interrupted and should resume where it left off.
      this.legPath = null;
      this.legStep = 0;
      return "arrived";
    }

    if (!this.legPath) {
      const path = findPath(
        grid,
        { x: Math.floor(this.x / tileSize), y: Math.floor(this.y / tileSize) },
        { x: Math.floor(tx / tileSize), y: Math.floor(ty / tileSize) },
        { radiusTiles: ORDERLY_COLLISION_RADIUS_TILES, openable: ctx.isOperableDoor },
      );
      if (!path || path.length === 0) {
        this.moving = false;
        return "blocked";
      }
      this.legPath = path;
      this.legStep = 0;
    }

    const node = this.legPath[this.legStep];
    const nodeX = (node.x + 0.5) * tileSize;
    const nodeY = (node.y + 0.5) * tileSize;
    // Work the door before stepping into it, or the body meets the closed leaf
    // A* just routed through and reports blocked. Aimed at the next node rather
    // than the final target, since the path turns corners.
    workDoors(this, ctx, grid, tileSize, Math.atan2(nodeY - this.y, nodeX - this.x));
    const step = this.stepToward(nodeX, nodeY, dt, ctx);
    if (step === "arrived") {
      this.legStep++;
      // Path walked out but the target is still beyond `ARRIVE_TILES` — the last
      // node is a tile centre and the target may sit off it. Drop the leg and let
      // the check at the top close the gap, or re-path if something moved.
      if (this.legStep >= this.legPath.length) this.legPath = null;
      return "walking";
    }
    // Wedged against something the grid doesn't know about — a guard in the
    // doorway. Reported up as blocked so the caller's give-up clock runs, but the
    // leg is *kept*: re-pathing every frame against a body that is about to walk
    // on would be an A* per frame for as long as it stood there.
    return step;
  }

  /**
   * The **Sanitation / Containment override**: walk to the spill, run the
   * cleaning loop, destroy it, go back to work.
   *
   * The orderly bails early if the lunch went `spent` under it (another orderly
   * finished first) or if it cannot reach it inside the same give-up budget a
   * knock gets — after which it writes that lunch off and goes back to its round
   * rather than standing at the wall it failed to walk through.
   */
  private sanitize(dt: number, ctx: OrderlyContext): void {
    const lure = this.lure;
    if (!lure || lure.spent) {
      this.returnToRound();
      return;
    }

    // Pathfound, like the round and the knock: "the wall it failed to walk
    // through" above was a straight-line walk, and a spill two rooms away was
    // written off as unreachable when it was merely around a corner.
    const step = this.walkPathTo(lure.x, lure.y, dt, ctx);
    if (step === "blocked") {
      this.distractPause += dt;
      if (this.distractPause >= DISTRACT_PAUSE) {
        // Written off for good, not just for now: the scent carries through the
        // wall that is stopping it, so "notice it again next frame" is the
        // default and it has to be refused explicitly.
        this.unreachable.add(lure);
        this.returnToRound();
      }
      return;
    }
    if (step === "walking") {
      // Progress clears the give-up budget: a long walk that clips a corner or two
      // on the way is not the same thing as a lunch it cannot reach at all.
      this.distractPause = 0;
      return;
    }

    // Arrived: hold still, face the work, and run the cleaning loop out. Keep the
    // approach facing if the lunch is underfoot — atan2 of nothing is due east,
    // which would have the orderly cleaning a spill behind its own heel.
    const dx = lure.x - this.x;
    const dy = lure.y - this.y;
    if (dx !== 0 || dy !== 0) this.facing = Math.atan2(dy, dx);
    this.serviceTimer += dt;
    if (this.serviceTimer >= LURE_SPECS[lure.kind].serviceSeconds) {
      lure.consume();
      this.returnToRound();
    }
  }

  /**
   * The **hold-up**: hands up, and walk where the weapon says.
   *
   * The grace drains here rather than in `update()` so that it drains inside
   * `think()` — see the witness gate in {@link update} for why that placement is the
   * whole of the release behaviour.
   *
   * Standing still he turns to face the thing pointed at him; marched, he faces the
   * way he is walking, which {@link stepToward} sets for him. Between the two, the
   * tint and the speech line, the state reads at 32px with **no new art** — the
   * orderly sheet is `idle` and `walk` only, and a hands-up pose would mean a
   * a bespoke pose in the drawing code for one frame.
   */
  private complyAtGunpoint(dt: number, ctx: OrderlyContext): void {
    const target = this.escortTarget;
    this.escortTarget = null;

    // The scene re-sends the standoff point every frame of a hold, including the
    // frames Rowan is standing still — on those the point is where the man already
    // is, so the step reports `arrived` and he turns back to face the weapon. Keying
    // the turn off *not walking* rather than off *no target* is what makes that work:
    // a hostage wedged against a wall (`blocked`) looks at Rowan too, rather than
    // standing at attention facing the wall he failed to walk through.
    const step = target ? this.stepToward(target.x, target.y, dt, ctx) : "arrived";
    if (step !== "walking") {
      this.moving = false;
      const dx = ctx.player.x - this.x;
      const dy = ctx.player.y - this.y;
      // Same guard as `sanitize`: atan2 of nothing is due east, which would have him
      // staring past the shoulder of a man standing on his toes.
      if (dx !== 0 || dy !== 0) this.facing = Math.atan2(dy, dx);
    }

    this.surrenderGrace = Math.max(0, this.surrenderGrace - dt);
    if (this.surrenderGrace <= 0) this.returnToRound();
  }

  /**
   * One step along the ground toward a point, shared by both walk-over states.
   *
   * Returns what happened, so the caller owns the give-up policy rather than
   * having its own copy of the movement: `"arrived"` inside {@link ARRIVE_TILES},
   * `"blocked"` when a wall refused the step outright, `"walking"` otherwise.
   *
   * Resolved through {@link moveCirclePx}, like the guards, rather than by asking
   * whether the tile under the orderly's centre point is blocked. That older test is
   * the one `GridMotion`'s own doc says it replaced "everywhere" — orderlies were
   * simply missed at the time, which was survivable while they only pottered about
   * near a spawn point and stopped being so the moment one could be marched down a
   * corridor at gunpoint: a body pushed diagonally into a wall stalled dead against
   * it instead of sliding along it, several times a straight.
   */
  private stepToward(
    tx: number,
    ty: number,
    dt: number,
    ctx: OrderlyContext,
  ): "arrived" | "blocked" | "walking" {
    const { grid, tileSize } = ctx;
    if (len(tx - this.x, ty - this.y) <= tileSize * ARRIVE_TILES) {
      this.moving = false;
      return "arrived";
    }

    this.facing = Math.atan2(ty - this.y, tx - this.x);
    const speed = this.walkSpeedTiles() * tileSize * dt;
    const moved = moveCirclePx(
      grid,
      this.x,
      this.y,
      Math.cos(this.facing) * speed,
      Math.sin(this.facing) * speed,
      ORDERLY_COLLISION_RADIUS_TILES,
      tileSize,
    );
    this.x = moved.x;
    this.y = moved.y;
    // Only a step refused on *both* axes is blocked. One axis surviving is the slide
    // that carries him along the wall and around the corner.
    if (moved.blockedX && moved.blockedY) {
      this.moving = false;
      return "blocked";
    }
    this.moving = true;
    return "walking";
  }

  /** Marched pace while at gunpoint, his own amble otherwise — see {@link ESCORT_WALK_TILES}. */
  private walkSpeedTiles(): number {
    return this.state === "SURRENDERED" ? ESCORT_WALK_TILES : WALK_SPEED_TILES;
  }

  /**
   * Drops whatever the orderly was doing — finished or abandoned — and resumes its
   * round. The single place every override's bookkeeping is cleared, which is what
   * lets `handsUp`, `stun`, `pin` and the grace expiry all share one reset.
   */
  private returnToRound(): void {
    this.state = "WANDER";
    this.distractTarget = null;
    this.distractPause = 0;
    this.lure = null;
    this.serviceTimer = 0;
    this.surrenderGrace = 0;
    this.escortTarget = null;
    this.moving = false;
  }

  /**
   * The witness path, and the **Ration Compliance Spoof** that delays it.
   *
   * Without a lunch this is unchanged: see the player, raise the alarm, freeze.
   * With one open in Rowan's hands the orderly instead flags him as an asset
   * consuming rations and reprimands him, and only reports once the grace has run
   * out. Losing sight drains the grace at the same rate it filled, so walking
   * through a sightline costs nothing and standing in one costs everything.
   *
   * Returns true on the exact frame the alarm is raised.
   */
  private witnessCheck(dt: number, ctx: OrderlyContext): boolean {
    this.reprimanding = false;
    if (!this.canSee(ctx)) {
      this.spoofTimer = Math.max(0, this.spoofTimer - dt);
      return false;
    }

    if (ctx.rationSpoof) {
      this.spoofTimer += dt;
      if (this.spoofTimer < RATION_SPOOF_SECONDS) {
        this.reprimanding = true;
        return false;
      }
    }

    this.state = "WITNESSED";
    this.moving = false;
    this.bang.setVisible(true);
    return true;
  }

  /**
   * Unobstructed sight to the player within range — no cone-angle limit, except
   * while sanitising, when the reach halves and a cone appears for as long as the
   * orderly is bent over its work. See {@link SANITATION_SIGHT_MULTIPLIER}.
   */
  private canSee(ctx: OrderlyContext): boolean {
    // Orderlies are the readiest to be fooled: a coworker walking by is a coworker
    // walking by, so a compliant Rowan never startles one into raising the alarm.
    if (ctx.playerCompliant) return false;
    if (ctx.playerConcealed) return false;
    const { player, tileSize, grid } = ctx;
    const cleaning = this.state === "SANITATION";
    const rangeTiles = cleaning ? SIGHT_RANGE_TILES * SANITATION_SIGHT_MULTIPLIER : SIGHT_RANGE_TILES;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    if (len(dx, dy) > rangeTiles * tileSize) return false;
    if (cleaning) {
      const half = (SANITATION_CONE_DEGREES * Math.PI) / 360;
      if (Math.abs(angleDiff(this.facing, Math.atan2(dy, dx))) > half) return false;
    }
    return grid.hasLineOfSight(this.x / tileSize, this.y / tileSize, player.x / tileSize, player.y / tileSize);
  }

  /** Keeps the "!" and the speech line pinned overhead, and says what the state is. */
  private syncMarkers(ctx: OrderlyContext): void {
    const ts = ctx.tileSize;
    this.bang.setPosition(this.x, this.y - ts);
    this.speech.setPosition(this.x, this.y - ts * 0.75);

    // Surrender wins outright — it is the only line said with a weapon in the way.
    // Below it, the spoof line beats the cleaning mutter, because it is a timer the
    // player is spending. Nothing is said at all while frozen by a dart or a staple.
    const line = this.isImmobilized
      ? ""
      : this.state === "SURRENDERED"
        ? SURRENDER_LINE
        : this.reprimanding
          ? REPRIMAND
          : this.state === "SANITATION"
            ? SANITATION_LINE
            : "";
    if (line === "") this.speech.setVisible(false);
    else {
      if (this.speech.text !== line) this.speech.setText(line);
      this.speech.setVisible(true);
    }

    // The hands-up read, carried by colour rather than by a pose. Latched against a
    // flag for the same reason the animation key is checked before `play` above: a
    // tint call every frame is a WebGL round-trip for a value that changes twice.
    const wantTint = this.state === "SURRENDERED";
    if (wantTint !== this.tinted) {
      this.tinted = wantTint;
      if (wantTint) this.body.setTint(SURRENDER_TINT);
      else this.body.clearTint();
    }
  }

  /** True while frozen by a Stun Rounds dart — guards treat this as an anomaly. */
  get isStunned(): boolean {
    return this.stunTimer > 0;
  }

  /** True while pinned to a wall by the Rail-Stapler's field mode — same effect as stun. */
  get isPinned(): boolean {
    return this.pinTimer > 0;
  }

  /**
   * Frozen and can't witness, regardless of which effect is holding it.
   *
   * Covers the dart and the staple only. A surrendered orderly is *also* frozen and
   * also can't witness, and is deliberately still excluded here — see the state
   * union's doc for the four call sites that would have changed behind your back.
   */
  get isImmobilized(): boolean {
    return this.isStunned || this.isPinned;
  }

  /** Hands up at gunpoint — the patrols read this as an anomaly, same as a dart. */
  get isSurrendered(): boolean {
    return this.state === "SURRENDERED";
  }

  /**
   * Eligible to be held up: still has an alarm to withhold, and is awake to withhold
   * it. Read by `Surrender.aimedAt`, which this satisfies structurally.
   */
  get canSurrender(): boolean {
    return this.state !== "WITNESSED" && !this.isImmobilized;
  }

  /** Registers idle/walk animations for each direction once per scene. */
  private static ensureAnimations(scene: Phaser.Scene): void {
    for (const anim of Object.keys(ORDERLY_ANIM_FRAME_COUNTS) as OrderlyAnimName[]) {
      const frameCount = ORDERLY_ANIM_FRAME_COUNTS[anim];
      const frameRate = ORDERLY_ANIM_FRAME_RATES[anim];
      for (const dir of DIRS_8) {
        const key = orderlyAnimKey(anim, dir);
        if (scene.anims.exists(key)) continue;
        scene.anims.create({
          key,
          frames: Array.from({ length: frameCount }, (_, i) => ({
            key: orderlyFrameKey(anim, dir, i),
          })),
          frameRate,
          repeat: -1,
        });
      }
    }
  }
}
