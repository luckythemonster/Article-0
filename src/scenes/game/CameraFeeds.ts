import type Phaser from "phaser";
import type { Sensor } from "../../entities/Sensor";
import { getAudio } from "../../systems/AudioDirector";
import type { AlertPhase } from "../../systems/AlertState";
import {
  SURVEILLANCE_KEY,
  buildChannels,
  feedJammed,
  isLooped,
  loopFeed,
  nextChannel,
  surveillanceState,
  surveillanceView,
  tickLoops,
  type SurveillanceState,
} from "../../systems/Surveillance";
import { CAMERA_ZOOM } from "../../render/pixelScale";
import { UI, hex } from "../../ui/hudTheme";
import { feedViewport } from "../../ui/CameraFeed";

/**
 * The security-camera feed: a second Phaser camera looking out of a chosen
 * sensor, opened by tapping E at a terminal the player has already breached.
 *
 * **This mode does not freeze the game, and that is the whole design.** Every
 * overlay in `OverlayGate` pauses physics and returns early out of
 * `GameScene.update`; a feed that did the same would be a free look at the
 * patrol routes. So it takes the other road already in that file — NW-SMAC-01's
 * false completion card, which claims a few keys for the frame and then falls
 * through to `updateWorld` (see the comment on that method). Patrols keep
 * walking while the monitor is up, and Rowan stands frozen at the panel with
 * `UNAUTHORIZED` on his conduct record the entire time. Watching is being
 * exposed.
 *
 * The rules — which channels exist, what they are called, what is looped — are
 * `src/systems/Surveillance.ts` and are unit-tested there. What is left here is
 * the part that needs Phaser: one extra camera, its ignore list, and the
 * registry hand-off to the chrome in `src/ui/CameraFeedHud.ts`.
 */

/** Everything the feed needs from the scene, rebound per level. */
export interface FeedWorld {
  /** The live cameras, in the order `FeedChannel.unit` indexes. */
  sensors(): readonly Sensor[];
  tileSize(): number;
  /** The current level's extent in tiles, for the channel labels. */
  levelSize(): { width: number; height: number };
  alertPhase(): AlertPhase;
  registry(): Phaser.Data.DataManager;
  /**
   * World objects the feed camera must not draw, given the plane it is watching.
   *
   * Everything built for *one* viewer — the darkness and its shadow fan, the
   * remembered-geometry wash, the prompts pinned over Rowan's head — plus the
   * baked art of any surface other than the one this camera looks at. See
   * `Lighting.displayObjects` for the argument.
   */
  ignoreFor(plane: number): Phaser.GameObjects.GameObject[];
  /** Charges a continuous `UNAUTHORIZED` for this frame at the panel. */
  violateUnauthorized(): void;
  /** Charges the discrete `TAMPERING` a loop costs. */
  violateTampering(): void;
}

export class CameraFeeds {
  /**
   * The deck's channels and loop timers, rebuilt per level.
   *
   * Held across the monitor being opened and closed, because a loop outlives the
   * look that set it: the point of blinding a camera is to walk past it
   * afterwards. Undefined only before the first {@link rebuild}.
   */
  private state?: SurveillanceState;
  private cam?: Phaser.Cameras.Scene2D.Camera;
  private open = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly w: FeedWorld,
  ) {}

  /** True while the monitor is up — what pins Rowan in place and claims keys. */
  get watching(): boolean {
    return this.open;
  }

  /** The channel on the monitor, or -1. */
  get channel(): number {
    return this.state?.index ?? -1;
  }

  /** Whether this deck has anything to watch, for the interact prompt. */
  get hasFeeds(): boolean {
    return (this.state?.channels.length ?? 0) > 0;
  }

  /**
   * Rebuilds the deck's channels from the level just built.
   *
   * Called once per level, after `LevelBuilder` has spawned the sensors, so the
   * indices in `FeedChannel.unit` address the array that now exists. Any loop
   * running on the deck the player just left goes with it, which is correct: the
   * cameras themselves were destroyed and rebuilt by the same pass.
   */
  rebuild(): void {
    this.closeCamera();
    this.open = false;
    const ts = this.w.tileSize();
    const size = this.w.levelSize();
    const units = this.w.sensors().map((s) => ({
      tx: Math.floor(s.x / ts),
      ty: Math.floor(s.y / ts),
    }));
    this.state = surveillanceState(buildChannels(units, size.width, size.height));
    this.w.registry().remove(SURVEILLANCE_KEY);
  }

  /** Clears everything belonging to a run rather than to a level. */
  reset(): void {
    this.closeCamera();
    this.open = false;
    this.state = undefined;
  }

  /**
   * Puts the monitor up, or reports that there is nothing to put on it.
   *
   * Returning false rather than opening an empty screen lets the interact prompt
   * decline to offer the verb at all: on a deck with no cameras — `secret1`,
   * `secret2`, `duct2`, whose four `sensors` tiles are lasers — a breached
   * terminal should look like what it is, rather than promising a feed and then
   * showing static.
   */
  openFeed(): boolean {
    if (this.open) return true;
    if (!this.state || this.state.channels.length === 0) return false;
    this.open = true;
    this.openCamera();
    getAudio().select();
    return true;
  }

  /** Takes the monitor down. A no-op when it is already down. */
  closeFeed(): void {
    if (!this.open) return;
    this.open = false;
    this.closeCamera();
    this.w.registry().remove(SURVEILLANCE_KEY);
    getAudio().ping();
  }

  /** Moves the monitor one channel along. */
  cycle(delta: number): void {
    if (!this.open || !this.state || this.state.channels.length < 2) return;
    nextChannel(this.state, delta);
    getAudio().ping();
  }

  /**
   * Plays the selected channel back to itself.
   *
   * Charged as `TAMPERING` rather than as another `UNAUTHORIZED`: working a panel
   * you have no business at is one thing, and reaching into the security mesh to
   * falsify what it reports is the same class of act as prising open a chest.
   */
  loopSelected(): void {
    if (!this.open || !this.state) return;
    if (!loopFeed(this.state, this.state.index)) return;
    this.w.violateTampering();
    getAudio().jamClunk();
  }

  /**
   * One frame: the loop timers, the cameras they blind, and the monitor.
   *
   * The first two halves run whether or not anybody is watching — that is what
   * makes a loop worth setting on the way past — so this is called from
   * `updateWorld` unconditionally, and before the sensing tick, so a channel
   * looped on this frame is already blind when its camera reads the world.
   */
  update(dt: number): void {
    const state = this.state;
    if (!state) return;

    tickLoops(state, dt);
    const sensors = this.w.sensors();
    for (let i = 0; i < state.channels.length; i++) {
      const sensor = sensors[state.channels[i].unit];
      // An authored `state: LOOPED` camera is looped for the level and is not the
      // feed's to hand back, so it is never written down to `false` here.
      if (sensor && sensor.stats.state !== "looped") sensor.looped = isLooped(state, i);
    }

    if (!this.open) return;

    // Standing at a panel reading the facility's own cameras is the clearest
    // breach there is, and re-asserting it every frame keeps the flag topped up
    // for as long as the monitor is up — exactly how the hack hold behaves —
    // then starts its cooldown the moment the feed closes.
    this.w.violateUnauthorized();

    const sensor = sensors[state.channels[state.index]?.unit ?? -1];
    if (!sensor) {
      // The camera the monitor was on is gone. Nothing on the shipped map can do
      // this, but a feed pointing at a destroyed object is worth failing safe.
      this.closeFeed();
      return;
    }
    this.cam?.centerOn(sensor.x, sensor.y);
    this.w
      .registry()
      .set(SURVEILLANCE_KEY, surveillanceView(state, feedJammed(this.w.alertPhase())));
  }

  /**
   * Opens the second camera on the selected sensor.
   *
   * Created here rather than kept alive and hidden: a camera is a whole extra
   * pass over the scene's display list every frame, and one that outlived a level
   * transition — which is a `scene.restart` — would be pointing into a level that
   * no longer exists.
   *
   * `CAMERA_ZOOM` is reused rather than picked, because it is a whole number and
   * `src/render/pixelScale.ts` is the reason it has to be.
   */
  private openCamera(): void {
    const state = this.state;
    if (!state) return;
    const sensor = this.w.sensors()[state.channels[state.index]?.unit ?? -1];
    if (!sensor) return;

    const vp = feedViewport(this.scene.scale.width, this.scene.scale.height);
    const cam = this.scene.cameras.add(vp.x, vp.y, vp.w, vp.h);
    cam.setZoom(CAMERA_ZOOM);
    cam.roundPixels = true;
    // Opaque, so the picture covers the main camera's render of the same patch of
    // screen rather than compositing with it.
    cam.setBackgroundColor(hex(UI.bgVoid));
    cam.centerOn(sensor.x, sensor.y);
    cam.ignore(this.w.ignoreFor(sensor.plane));
    this.cam = cam;
  }

  /** Destroys the feed camera, if there is one. */
  private closeCamera(): void {
    if (!this.cam) return;
    this.scene.cameras.remove(this.cam, true);
    this.cam = undefined;
  }

  /**
   * Re-lays the viewport out after a canvas resize.
   *
   * The rect is `src/ui/CameraFeed.ts`'s answer and it moves with the canvas, so
   * a monitor left open across a window resize would otherwise keep its old
   * clipping rect while the chrome drawn around it moved.
   */
  layout(width: number, height: number): void {
    if (!this.cam) return;
    const vp = feedViewport(width, height);
    this.cam.setPosition(vp.x, vp.y);
    this.cam.setSize(vp.w, vp.h);
  }
}
