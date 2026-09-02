import type Phaser from "phaser";
import type { GameTile } from "../map/types";
import { lightSwitchStatsFor, type LightSwitchStats } from "../systems/EntityStats";
import {
  clipFrames,
  ensureEntityClip,
  entitySpriteKey,
  framesLabelled,
  hasEntitySprite,
  type EntitySpriteId,
} from "./EntitySprites";

/**
 * A wall plate that kills the lights in one zone. The quiet half of the power grid.
 *
 * ### What makes it different from a breaker
 *
 * Everything except the fact that both cut power. `src/entities/Breaker.ts` is a
 * cabinet: it plays a 2.4-second keypad sequence you cannot interrupt, it is heard
 * seven tiles out, it is charged as a breach, and the facility sends an orderly to
 * put it back. That is the price of taking a whole wing.
 *
 * This is a light switch. It flips instantly, it is heard two tiles out, **nobody is
 * charged and nobody is sent**, and it takes exactly the room you are standing in.
 * The contrast is the mechanic, not an oversight: the breaker is the loud move that
 * buys a lot of darkness on a clock, and the switch is the quiet one that buys a
 * little and keeps it. A player who wants a specific room dark and wants to still be
 * nobody has to walk into that room to do it.
 *
 * ### Where they come from
 *
 * Almost always derived rather than placed — `src/map/AutoLight.ts` files one per
 * lit zone, on standable floor with a wall to sit against. A map is free to author
 * them on a `light_switches` board too; the component is the claim, exactly as
 * `power_grid` is for a breaker.
 */

const ART: EntitySpriteId = "light-switch";

/**
 * The two clips the art authors, and the labels that back them up.
 *
 * `light_switch.aseprite` tags `ON` as frames 0-2 and `OFF` as 3-8 — each a long
 * hold followed by a couple of 29ms frames, so the plate reads as a fluorescent
 * indicator that catches rather than as a static light. Played as *clips* rather
 * than sampled as stills because that timing is drawn, not incidental: the same
 * reasoning `BASE_FRAME_RATE` in `EntitySprites` spells out for the camera and the
 * terminal.
 *
 * The identical names also appear as cel labels on the `switch` layer, which is
 * what {@link stateFrame} falls back to when a file carries labels but no tags.
 */
const CLIP_ON = "ON";
const CLIP_OFF = "OFF";

/**
 * The third state: no power reaches this plate at all.
 *
 * Its own thing rather than a shade of `OFF`, because they are different facts and
 * the player needs to tell them apart — a plate reading `OFF` is one you switched
 * and can switch back, and one reading this is a plate whose wing a breaker took or
 * whose circuit a terminal cut. Flipping it would do nothing, so it does not offer.
 *
 * Unlike the other two it is *labelled but not tagged* in the shipped art — frames
 * 9-10 on `INDICATOR_LIGHT` — which is why {@link stateClip} falls back to the
 * labelled frames. Tag it later and nothing here changes.
 */
const CLIP_NO_POWER = "NO_POWER";

export class LightSwitch {
  readonly tileX: number;
  readonly tileY: number;
  /** Pixel centre — public for the same reason as {@link Breaker.x}. */
  readonly x: number;
  readonly y: number;
  readonly stats: LightSwitchStats;

  /** The plate's own position: true when this switch is set to on. */
  private closed: boolean;
  /**
   * Whether power reaches the plate at all — see {@link CLIP_NO_POWER}.
   *
   * Independent of {@link closed}, which is the whole point: a plate can be switched
   * on and still be dead. `PowerControl.applyZone` owns the answer and pushes it in.
   */
  private live = true;

  /**
   * The plate, when there is no art on disk to draw it with.
   *
   * Optional for the reason `EntitySprites` states: every entity here already draws
   * *something*, so missing art costs the upgrade and never the fixture. Same
   * arrangement as `Sensor`'s housing.
   */
  private readonly plate?: Phaser.GameObjects.Graphics;
  private readonly sprite?: Phaser.GameObjects.Sprite;
  /** Drawn size in px, from the tile's own span — see the constructor. */
  private readonly width: number;
  private readonly height: number;

  /**
   * @param closed the zone's live state — the persisted `PowerGridState` override
   *   if the player has thrown this one before, and the map's authored `state`
   *   otherwise, so a room they darkened is still dark when they come back to it.
   */
  constructor(scene: Phaser.Scene, tile: GameTile, tileSize: number, closed: boolean) {
    this.tileX = tile.x;
    this.tileY = tile.y;
    this.x = (tile.x + 0.5) * tileSize + tile.offsetX;
    this.y = (tile.y + 0.5) * tileSize + tile.offsetY;
    this.stats = lightSwitchStatsFor(tile.components);
    this.closed = closed;

    // Off the tile, not the art — the same reading `Breaker` takes of its cabinet.
    // `src/map/AutoLight.ts` files these at `SWITCH_TILES`, and taking the size from
    // there rather than from a constant here is what keeps the drawn plate and the
    // sprite spec's `displayTiles` from drifting apart, which they previously did.
    this.width = tile.colSpan * tileSize;
    this.height = tile.rowSpan * tileSize;

    if (hasEntitySprite(scene, ART)) {
      this.sprite = scene.add
        .sprite(this.x, this.y, entitySpriteKey(ART))
        .setDisplaySize(this.width, this.height)
        // Beside the breaker on the fixture layer, under everything that walks.
        .setDepth(120);
    } else {
      this.plate = scene.add.graphics().setDepth(120);
    }
    this.draw();
  }

  /** True when this plate is set to on. Says nothing about whether it has power. */
  get isClosed(): boolean {
    return this.closed;
  }

  /** True when power reaches this plate, so flipping it would do something. */
  get isLive(): boolean {
    return this.live;
  }

  /** Told by `PowerControl` whenever the circuit above this plate changes. */
  setLive(live: boolean): void {
    if (live === this.live) return;
    this.live = live;
    this.draw();
  }

  /**
   * Flips the switch and reports the state it landed in.
   *
   * No `started` return and no callback, unlike {@link Breaker.toggle}: there is no
   * animation to be already playing, so a tap can never be refused and there is
   * nothing to fire mid-way through. The caller acts on the answer directly.
   */
  toggle(): boolean {
    this.closed = !this.closed;
    this.draw();
    return this.closed;
  }

  /**
   * Which single frame shows the current state, for art that has no clip to play.
   *
   * The labelled frame where the art carries labels, and frame 0/1 where it does
   * not — so a plain two-frame file still works and costs only a build warning,
   * rather than the switch silently sticking on one state. A single-cel file gets
   * frame 0 both ways, which reads as a plate that does not animate rather than as
   * a broken one.
   */
  /**
   * The clip for one state, built however the art happens to describe it.
   *
   * Prefers the tag, because a tag is an ordered range and says where the state
   * starts. Falls back to whichever frames carry the state's cel label, which is
   * what makes `NO_POWER` work in the shipped file — it is labelled on two frames
   * and tagged on none — and means tagging it later is a no-op here.
   */
  private stateClip(state: string): string | undefined {
    const scene = this.sprite?.scene;
    if (!scene) return undefined;
    const tagged = clipFrames(ART, state);
    const frames = tagged.length > 0 ? tagged : [...framesLabelled(ART, state)].sort((a, b) => a - b);
    return ensureEntityClip(scene, ART, `${entitySpriteKey(ART)}-${state}`, frames);
  }

  private stateFrame(): number {
    const [labelled] = framesLabelled(ART, this.closed ? CLIP_ON : CLIP_OFF);
    if (labelled !== undefined) return labelled;
    const frames = this.sprite?.texture.getFrameNames().length ?? 0;
    return this.closed || frames < 2 ? 0 : 1;
  }

  /**
   * Repaints for the current state.
   *
   * A frame swap where there is art, and where there isn't, a small plate whose
   * rocker is lit while the circuit is closed — the same reading as the breaker
   * cabinet's green screen, so the two fixtures agree about which way "on" looks.
   */
  private draw(): void {
    if (this.sprite) {
      const state = !this.live ? CLIP_NO_POWER : this.closed ? CLIP_ON : CLIP_OFF;
      const clip = this.stateClip(state);
      // A file with frames for this state animates; one without holds still.
      if (clip) this.sprite.play(clip, true);
      else this.sprite.setFrame(this.stateFrame());
      return;
    }

    const g = this.plate;
    if (!g) return;
    // The same box the art will occupy, so the switch does not visibly change size
    // on the day somebody drops the PNG in. Tight — a quarter tile is 8 world pixels
    // to fit a plate and a rocker into — but a fallback that lied about the
    // footprint would make the real art look like a regression when it landed.
    const w = this.width;
    const h = this.height;
    g.clear();
    g.fillStyle(0x1a2330, 1);
    g.fillRect(this.x - w / 2, this.y - h / 2, w, h);
    g.lineStyle(1, 0x424c6e, 1);
    g.strokeRect(this.x - w / 2, this.y - h / 2, w, h);
    // The rocker: bright and high while the lights are on, dim and low while off,
    // and gone entirely with no power — a dead plate shows nothing, which is the
    // same thing the art's `NO_POWER` frames say.
    if (!this.live) return;
    g.fillStyle(this.closed ? 0xd3fc7e : 0x2a2f4e, 1);
    const rockerH = h * 0.34;
    const top = this.closed ? this.y - h * 0.38 : this.y + h * 0.04;
    g.fillRect(this.x - w * 0.28, top, w * 0.56, rockerH);
  }
}
