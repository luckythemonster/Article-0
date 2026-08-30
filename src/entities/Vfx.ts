import type Phaser from "phaser";
import { isPixelPerfect } from "../render/pixelScale";

/**
 * One-shot visual effects, played at a world position and thrown away.
 *
 * The game draws everything else procedurally — the EMP zone, the fire tracers,
 * the boss core and the relay dish are all `Graphics` primitives with an ADD
 * blend — so this is the only sprite-based effect path, and the only thing that
 * plays an animation somewhere and then disposes of it.
 *
 * The frames come from pixel-VFX packs staged in `public/assets/vfx/`. One more
 * sits there unused: `explosion` is still the third-party 512x512, sixteen
 * tiles across, and getting it to game scale means an 8x nearest-neighbour
 * reduction — the exact pixel destruction `src/render/pixelScale.ts` exists to
 * prevent. It needs redrawing at size before it can be wired up, the way
 * `electricity` now has been — see `tools/vfx/build_vfx.py`.
 */

/** Where an effect's frames come from. */
export type VfxSource =
  /** One PNG per frame, numbered by `frame(i)`. */
  | { kind: "frames"; frame(index: number): string }
  /** A uniform grid in a single image. */
  | { kind: "sheet"; path: string; frameSize: number };

export interface VfxSpec {
  /** Texture/animation key prefix, and the folder under `assets/vfx/`. */
  id: string;
  source: VfxSource;
  frameCount: number;
  frameRate: number;
  /** Native pixel size of one frame. */
  frameSize: number;
  /**
   * Height on screen, as a multiple of tile size.
   *
   * Paired with {@link frameSize} under the same rule the characters follow:
   * `(tileSize * displayTiles) / frameSize * cameraZoom` has to be a whole
   * number or the frames get resampled. {@link assertVfxScales} checks it.
   */
  displayTiles: number;
  /**
   * Render depth.
   *
   * The ladder in play: ground shadows 300, guard cones 400, EMP zone 410,
   * orderlies 440, bodies 450, the lighting overlay 700/701, the player 750.
   *
   * Effects sit **above** the lighting, at {@link VFX_DEPTH}, for the same
   * reason the player does: unlit space is fully opaque, so anything underneath
   * it is simply gone. An effect exists to tell you something landed, and one
   * that vanishes because the room happens to be dark fails at the only job it
   * has — you would fire a stun round into a dark corridor and get no feedback
   * at all. Every one of these is player-triggered and lasts under a second, so
   * nothing is revealed that the player did not just cause.
   */
  depth: number;
}

/**
 * Above the lighting overlay (700/701) and the player (750).
 *
 * Above the player as well as the lighting because the EMP blast is centred on
 * him — drawn under, a two-tile burst would be a ring around his feet.
 */
export const VFX_DEPTH = 760;

/**
 * The EMP Grenade's detonation.
 *
 * Fired from `GameScene.fireChaffBurst`, which until now rendered an
 * electromagnetic burst as a camera flash and nothing else.
 */
export const EMP_BLAST: VfxSpec = {
  id: "emp-blast",
  source: { kind: "sheet", path: "assets/vfx/emp-blast/spritesheet.png", frameSize: 64 },
  frameCount: 9,
  frameRate: 18,
  frameSize: 64,
  displayTiles: 2,
  depth: VFX_DEPTH,
};

/** Sparks off a laser emitter knocked out by an EMP. */
export const ELECTRONICS_SPARK: VfxSpec = {
  id: "electronics-spark",
  source: {
    kind: "sheet",
    path: "assets/vfx/impact-electronics-or-silicate/spritesheet.png",
    frameSize: 128,
  },
  frameCount: 12,
  frameRate: 20,
  frameSize: 128,
  // Half its native size: 128px is four tiles, far too big for a hit on a
  // single emitter.
  displayTiles: 2,
  depth: VFX_DEPTH,
};

/** A human taking a hit — a stun dart, or the Rail-Stapler pinning him. */
export const IMPACT: VfxSpec = {
  id: "impact",
  source: { kind: "frames", frame: (i) => `assets/vfx/impact/SP103_0${i + 1}.png` },
  frameCount: 4,
  frameRate: 16,
  frameSize: 32,
  displayTiles: 1,
  depth: VFX_DEPTH,
};

/** Cover coming apart. */
export const SMOKE_PLUME: VfxSpec = {
  id: "smoke-plume",
  source: {
    kind: "frames",
    frame: (i) => `assets/vfx/smoke-plume/FX045_nyknck/FX45_0${i + 1}.png`,
  },
  frameCount: 7,
  frameRate: 14,
  frameSize: 32,
  // Two tiles rather than one: the plume is a pale khaki that sits close to the
  // floor's own grey, and at a single tile a broken cover tile barely announced
  // itself. Four screen pixels per source pixel is chunky, but it is a whole
  // number and a soft gaseous shape carries the magnification far better than
  // character art would.
  displayTiles: 2,
  depth: VFX_DEPTH,
};

/**
 * A hand-drawn electrical arc. Redrawn from a 512x512 third-party pack (see
 * `tools/vfx/build_vfx.py`) at native size, on ENDESGA-64.
 *
 * **Not fired anywhere yet.** Nothing in the game calls `playVfx(scene,
 * ELECTRICITY, …)` — it's here so the art and the scale rule are both
 * checked, but a call site is still an open decision.
 */
export const ELECTRICITY: VfxSpec = {
  id: "electricity",
  source: { kind: "sheet", path: "assets/vfx/electricity/spritesheet.png", frameSize: 128 },
  frameCount: 14,
  // The source's own per-frame hold: 14 frames at a flat 100ms each.
  frameRate: 10,
  frameSize: 128,
  displayTiles: 2,
  depth: VFX_DEPTH,
};

/**
 * The Stun Rounds dart, hand-drawn on ENDESGA-64 at `tools/vfx/build_vfx.py`.
 *
 * Two tags cover its 13 frames: `travelling` (0-6) is the dart itself, spinning
 * in flight; `impact` (7-12) is the flash it makes landing, fading to a fully
 * transparent last frame. That split is why it does not go through `playVfx`
 * below — every other effect plays once at a fixed point, but a projectile has
 * to cross the world first. See {@link fireStunRound}.
 */
export const STUN_ROUND: VfxSpec = {
  id: "stun-round",
  source: { kind: "sheet", path: "assets/vfx/stun-round/spritesheet.png", frameSize: 8 },
  frameCount: 13,
  // The source's own per-frame hold: 20ms flat, same reasoning as `ELECTRICITY`.
  frameRate: 50,
  frameSize: 8,
  // A quarter tile: (32 * 0.25 / 8) * 2 = 2 screen pixels per source pixel, the
  // same ratio every other effect in this file lands on, and small enough that
  // a dart reads as a dart next to the person it hits rather than matching him.
  displayTiles: 0.25,
  depth: VFX_DEPTH,
};

export const ALL_VFX: readonly VfxSpec[] = [
  EMP_BLAST,
  ELECTRONICS_SPARK,
  IMPACT,
  SMOKE_PLUME,
  ELECTRICITY,
  STUN_ROUND,
];

/** Texture key for a spec, and for one frame of a loose-frame spec. */
function textureKey(spec: VfxSpec, index = 0): string {
  return spec.source.kind === "sheet" ? `vfx-${spec.id}` : `vfx-${spec.id}-${index}`;
}

function animKey(spec: VfxSpec): string {
  return `vfx-${spec.id}`;
}

/** Queues every effect's frames, for BootScene's preload. */
export function preloadVfx(scene: Phaser.Scene): void {
  for (const spec of ALL_VFX) {
    if (spec.source.kind === "sheet") {
      scene.load.spritesheet(textureKey(spec), spec.source.path, {
        frameWidth: spec.source.frameSize,
        frameHeight: spec.source.frameSize,
      });
    } else {
      for (let i = 0; i < spec.frameCount; i++) {
        scene.load.image(textureKey(spec, i), spec.source.frame(i));
      }
    }
  }
}

/** Registers every effect's animation. Safe to call more than once. */
function ensureAnimations(scene: Phaser.Scene): void {
  for (const spec of ALL_VFX) {
    const key = animKey(spec);
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames:
        spec.source.kind === "sheet"
          ? scene.anims.generateFrameNumbers(textureKey(spec), { start: 0, end: spec.frameCount - 1 })
          : Array.from({ length: spec.frameCount }, (_, i) => ({ key: textureKey(spec, i) })),
      frameRate: spec.frameRate,
      repeat: 0,
    });
  }
}

/**
 * Plays an effect once at a world position, then disposes of it.
 *
 * The sprite removes itself on `animationcomplete`, and that event is the whole
 * risk here: it fires once, and a missed one leaks a sprite that never goes
 * away. `Player.ts` hit the same trap with its crouch transitions and answered
 * it by polling `anims.isPlaying` instead. The difference is that a stance
 * machine has a frame loop to poll from and a one-shot effect does not, so this
 * takes the event and pairs it with a timer sized to the clip as a backstop —
 * whichever lands first destroys the sprite, and destroying twice is a no-op.
 */
export function playVfx(
  scene: Phaser.Scene,
  spec: VfxSpec,
  x: number,
  y: number,
  tileSize: number,
): void {
  ensureAnimations(scene);

  const sprite = scene.add
    .sprite(x, y, textureKey(spec))
    .setDepth(spec.depth)
    .setScale((tileSize * spec.displayTiles) / spec.frameSize);

  const done = (): void => sprite.destroy();
  sprite.once("animationcomplete", done);
  // Backstop, a little past the clip's own length.
  scene.time.delayedCall((spec.frameCount / spec.frameRate) * 1000 + 250, done);

  sprite.play(animKey(spec));
}

const STUN_ROUND_TRAVEL_ANIM = "vfx-stun-round-travel";
const STUN_ROUND_IMPACT_ANIM = "vfx-stun-round-impact";

/**
 * Registers the dart's two clips, once.
 *
 * Kept apart from {@link ensureAnimations}, which builds one clip spanning a
 * spec's whole frame range — right for every other effect, wrong here: the
 * dart has to loop through `travelling` while it is in flight and then switch
 * to `impact` on arrival, not play both ranges straight through back to back.
 */
function ensureStunRoundAnimations(scene: Phaser.Scene): void {
  if (scene.anims.exists(STUN_ROUND_TRAVEL_ANIM)) return;
  const key = textureKey(STUN_ROUND);
  scene.anims.create({
    key: STUN_ROUND_TRAVEL_ANIM,
    frames: scene.anims.generateFrameNumbers(key, { start: 0, end: 6 }),
    frameRate: STUN_ROUND.frameRate,
    repeat: -1,
  });
  scene.anims.create({
    key: STUN_ROUND_IMPACT_ANIM,
    frames: scene.anims.generateFrameNumbers(key, { start: 7, end: 12 }),
    frameRate: STUN_ROUND.frameRate,
    repeat: 0,
  });
}

/** A dart's flight, in world pixels per second. Brisk and fixed, so a shot at
 * point-blank and one at the full five-tile reach read as the same dart rather
 * than a slow one and a fast one. */
const STUN_ROUND_SPEED_PX_PER_SEC = 900;

/**
 * Flies the Stun Rounds dart from muzzle to the point `ItemActions.fireStunDart`
 * already resolved, then plays its impact flash there before disposing of itself.
 *
 * The only VFX that travels rather than playing in place: everything else in
 * this file animates at a fixed world position because it *is* the reaction to
 * something landing, where this sprite *is* the shot. It is purely decorative —
 * the caller has already resolved whether anything was hit by the time this is
 * called, so nothing here can change the outcome, only how it reads.
 */
export function fireStunRound(
  scene: Phaser.Scene,
  originX: number,
  originY: number,
  endX: number,
  endY: number,
  tileSize: number,
): void {
  ensureStunRoundAnimations(scene);

  const sprite = scene.add
    .sprite(originX, originY, textureKey(STUN_ROUND))
    .setDepth(STUN_ROUND.depth)
    .setScale((tileSize * STUN_ROUND.displayTiles) / STUN_ROUND.frameSize);
  sprite.play(STUN_ROUND_TRAVEL_ANIM);

  const dist = Math.hypot(endX - originX, endY - originY);
  scene.tweens.add({
    targets: sprite,
    x: endX,
    y: endY,
    duration: Math.max(40, (dist / STUN_ROUND_SPEED_PX_PER_SEC) * 1000),
    onComplete: () => {
      sprite.play(STUN_ROUND_IMPACT_ANIM);
      sprite.once("animationcomplete", () => sprite.destroy());
    },
  });
}

/**
 * Every effect's frame size and display height, for the pixel-scale test.
 *
 * Exported as data so the test can hold effects to the same rule as the cast
 * without this module importing vitest or the test hard-coding the numbers.
 */
export function vfxScales(): { id: string; displayTiles: number; frameSize: number }[] {
  return ALL_VFX.map((s) => ({ id: s.id, displayTiles: s.displayTiles, frameSize: s.frameSize }));
}

/** True when every effect reaches the screen without being resampled. */
export function assertVfxScales(): string[] {
  return ALL_VFX.filter((s) => !isPixelPerfect(s.displayTiles, s.frameSize)).map((s) => s.id);
}
