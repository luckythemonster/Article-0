import Phaser from "phaser";
import type { CollisionGrid } from "../systems/CollisionGrid";
import {
  paced,
  RATION_SPOOF_SECONDS,
  SANITATION_CONE_DEGREES,
  SANITATION_SIGHT_MULTIPLIER,
} from "../systems/EntityStats";
import { LURE_SPECS, noticedLure, type DeployedLure } from "../systems/Deployables";
import { DIRS_8, nearestDirection, type Dir8 } from "./directions";
import { alertMarker, speechMarker } from "./markers";
import {
  ORDERLY_ANIM_FRAME_COUNTS,
  ORDERLY_ANIM_FRAME_RATES,
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
 *  - **WITNESSED**  — has seen the player and raised its one alarm. Terminal.
 */
type OrderlyState = "WANDER" | "INSPECT" | "SANITATION" | "WITNESSED";

const SIGHT_RANGE_TILES = 5;
const WANDER_LEASH_TILES = 2.5;
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
 * Two things bend that: a **deployed Sack Lunch**, which pulls it off its round
 * to clean and half-blinds it while it works, and an **opened** one held in
 * plain sight, which buys a grace window before it reports. Both are the same
 * insight from opposite ends — an orderly is a member of staff with a job, and
 * a job is a thing you can give it.
 */
export class Orderly {
  /** Pixel position — public for the same reason as {@link Enforcer.x}. */
  x: number;
  y: number;
  private readonly spawnX: number;
  private readonly spawnY: number;
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

  private readonly body: Phaser.GameObjects.Sprite;
  private readonly bang: Phaser.GameObjects.Text;
  private readonly speech: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, tileX: number, tileY: number, tileSize: number) {
    this.x = this.spawnX = (tileX + 0.5) * tileSize;
    this.y = this.spawnY = (tileY + 0.5) * tileSize;
    this.wanderTimer = Phaser.Math.FloatBetween(1, 3);

    Orderly.ensureAnimations(scene);
    this.body = scene.add.sprite(this.x, this.y, orderlyFrameKey("idle", "south", 0)).setDepth(440);
    // The 84x84 source art scaled to ~1.5 tiles tall, matching the guards.
    this.body.setScale((tileSize * 1.5) / 84);
    this.body.play(orderlyAnimKey("idle", "south"));

    this.bang = alertMarker(scene, this.x, this.y, tileSize);
    this.speech = speechMarker(scene, this.x, this.y, tileSize);
  }

  /** Freezes the orderly for a stretch (a Stun Rounds dart) — can't witness. */
  stun(seconds: number): void {
    this.stunTimer = Math.max(this.stunTimer, seconds);
    this.moving = false;
    this.bang.setVisible(false);
  }

  /** Pins the orderly to a wall for a stretch (the Rail-Stapler's field mode) — can't witness. */
  pin(seconds: number): void {
    this.pinTimer = Math.max(this.pinTimer, seconds);
    this.moving = false;
    this.bang.setVisible(false);
  }

  /**
   * Lures the orderly to inspect a nearby noise (a player's knock): it leaves
   * its wander, walks over, pauses, then drifts back. A no-op while stunned,
   * already startled by witnessing the player, or busy with a spill — a knock
   * does not out-rank an actual work order.
   */
  distract(sx: number, sy: number): void {
    if (this.isImmobilized) return;
    if (this.state === "WITNESSED" || this.state === "SANITATION") return;
    this.state = "INSPECT";
    this.distractTarget = { x: sx, y: sy };
    this.distractPause = 0;
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

    const witnessed = this.state === "WITNESSED" ? false : this.witnessCheck(dt, ctx);
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

    if (this.state !== "SANITATION") {
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

  private wander(dt: number, ctx: OrderlyContext): void {
    const { grid, tileSize } = ctx;
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.moving = !this.moving || Math.random() < 0.5;
      if (this.moving) {
        // Head roughly back toward spawn once the leash stretches too far,
        // otherwise wander in a random direction.
        const strayed = len(this.x - this.spawnX, this.y - this.spawnY) > WANDER_LEASH_TILES * tileSize;
        this.facing = strayed
          ? Math.atan2(this.spawnY - this.y, this.spawnX - this.x)
          : Phaser.Math.FloatBetween(0, Math.PI * 2);
      }
      this.wanderTimer = this.moving
        ? Phaser.Math.FloatBetween(0.8, 1.8)
        : Phaser.Math.FloatBetween(1.5, 3.5);
    }

    if (!this.moving) return;
    const speed = WALK_SPEED_TILES * tileSize;
    const nx = this.x + Math.cos(this.facing) * speed * dt;
    const ny = this.y + Math.sin(this.facing) * speed * dt;
    if (grid.isBlocked(Math.floor(nx / tileSize), Math.floor(ny / tileSize))) {
      this.moving = false;
      this.wanderTimer = Phaser.Math.FloatBetween(1, 2);
    } else {
      this.x = nx;
      this.y = ny;
    }
  }

  /**
   * Walks toward a knock and lingers there before giving up. Once the pause
   * elapses (or the path is blocked) it returns to WANDER — the spawn leash then
   * drifts the orderly back home.
   */
  private investigateDistraction(dt: number, ctx: OrderlyContext): void {
    const target = this.distractTarget!;
    const step = this.stepToward(target.x, target.y, dt, ctx);

    if (step === "arrived" || step === "blocked") {
      // Arrived: look around for a beat. Blocked: give up on the same clock.
      this.distractPause += dt;
      if (this.distractPause >= DISTRACT_PAUSE) this.returnToRound();
    }
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

    const step = this.stepToward(lure.x, lure.y, dt, ctx);
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
   * One step along the ground toward a point, shared by both walk-over states.
   *
   * Returns what happened, so the caller owns the give-up policy rather than
   * having its own copy of the movement: `"arrived"` inside {@link ARRIVE_TILES},
   * `"blocked"` when the next step would enter a wall, `"walking"` otherwise.
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
    const speed = WALK_SPEED_TILES * tileSize;
    const nx = this.x + Math.cos(this.facing) * speed * dt;
    const ny = this.y + Math.sin(this.facing) * speed * dt;
    if (grid.isBlocked(Math.floor(nx / tileSize), Math.floor(ny / tileSize))) {
      this.moving = false;
      return "blocked";
    }
    this.moving = true;
    this.x = nx;
    this.y = ny;
    return "walking";
  }

  /** Drops whatever the orderly was doing — finished or abandoned — and resumes its round. */
  private returnToRound(): void {
    this.state = "WANDER";
    this.distractTarget = null;
    this.distractPause = 0;
    this.lure = null;
    this.serviceTimer = 0;
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

    // The spoof line is the one worth reading — it is a timer the player is
    // spending — so it wins over the cleaning mutter when both apply. Nothing is
    // said while frozen by a dart or a staple.
    const line = this.isImmobilized
      ? ""
      : this.reprimanding
        ? REPRIMAND
        : this.state === "SANITATION"
          ? SANITATION_LINE
          : "";
    if (line === "") {
      this.speech.setVisible(false);
      return;
    }
    if (this.speech.text !== line) this.speech.setText(line);
    this.speech.setVisible(true);
  }

  /** True while frozen by a Stun Rounds dart — guards treat this as an anomaly. */
  get isStunned(): boolean {
    return this.stunTimer > 0;
  }

  /** True while pinned to a wall by the Rail-Stapler's field mode — same effect as stun. */
  get isPinned(): boolean {
    return this.pinTimer > 0;
  }

  /** Frozen and can't witness, regardless of which effect is holding it. */
  get isImmobilized(): boolean {
    return this.isStunned || this.isPinned;
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
